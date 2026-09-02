"""WhatsApp transport.

``CU_WHATSAPP_PROVIDER=fake`` (the default) performs no network I/O at all, so
the entire application - including the outbox, the webhook and acknowledgment
handling - is exercisable offline and in CI with no credentials.

Three transports, one message shape. :mod:`app.whatsapp.templates` renders the
**Meta Cloud API body**, and that is what every provider receives and what the
outbox stores, whichever transport is live. ``CloudProvider`` posts it
verbatim; ``TwilioProvider`` translates it to Twilio's form-encoded API on the
way out. Keeping one canonical shape in the database means switching provider
does not split ``outbound_messages.payload`` into two dialects that every
later reader has to branch on, and it keeps the fake provider representative
of both.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.config import get_settings
from app.whatsapp import twilio_content

GRAPH_API_VERSION = "v21.0"


@dataclass(frozen=True, slots=True)
class SendResult:
    ok: bool
    provider_message_id: str | None = None
    error: str | None = None


def channel_address(value: str) -> str:
    """Twilio addresses WhatsApp as ``whatsapp:+65...``; Meta uses bare digits.

    Accepts either form, so callers never have to track which one they hold.
    """
    value = value.strip()
    if value.startswith("whatsapp:"):
        return value
    return "whatsapp:+" + value.lstrip("+")


def content_variables(template: dict[str, Any]) -> dict[str, str]:
    """Positional body parameters -> Twilio's ``{"1": ..., "2": ...}``.

    Only the body component carries substitutions. Twilio's quick-reply
    buttons take their payloads from the stored Content template itself, so
    the Meta button components have no Twilio counterpart and are dropped
    here - the ``ack_yes``/``ack_no``/``ack_maybe`` ids live in the Content
    template (see ``scripts/twilio_setup.py``) and come back on the inbound
    webhook as ``ButtonPayload``.
    """
    for component in template.get("components") or []:
        if component.get("type") == "body":
            return {
                str(index): str(parameter.get("text", ""))
                for index, parameter in enumerate(
                    component.get("parameters") or [], start=1
                )
            }
    return {}


class WhatsAppProvider(Protocol):
    name: str

    def send(self, payload: dict[str, Any]) -> SendResult: ...


class FakeProvider:
    """Records sends in memory and returns a deterministic message id.

    Deterministic ids matter: tests can assert on them, and a replayed send
    produces the same id rather than a new random one.
    """

    name = "fake"

    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    def send(self, payload: dict[str, Any]) -> SendResult:
        self.sent.append(payload)
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True).encode("utf-8")
        ).hexdigest()[:24]
        return SendResult(ok=True, provider_message_id=f"wamid.fake.{digest}")

    def clear(self) -> None:
        self.sent.clear()


class CloudProvider:
    """Meta WhatsApp Cloud API. Not exercised until credentials are configured."""

    name = "cloud"

    def __init__(self, phone_number_id: str, access_token: str) -> None:
        if not phone_number_id or not access_token:
            raise RuntimeError(
                "CU_WHATSAPP_PHONE_NUMBER_ID and CU_WHATSAPP_ACCESS_TOKEN are "
                "required when CU_WHATSAPP_PROVIDER=cloud"
            )
        self._url = (
            f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages"
        )
        self._headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    def send(self, payload: dict[str, Any]) -> SendResult:
        try:
            response = httpx.post(
                self._url, headers=self._headers, json=payload, timeout=20.0
            )
        except httpx.HTTPError as exc:
            return SendResult(ok=False, error=f"transport error: {exc}")

        if response.status_code >= 400:
            return SendResult(ok=False, error=f"{response.status_code}: {response.text[:500]}")

        body = response.json()
        messages = body.get("messages") or []
        message_id = messages[0].get("id") if messages else None
        return SendResult(ok=True, provider_message_id=message_id)


class TwilioProvider:
    """Twilio's WhatsApp channel.

    Takes the same Meta-shaped body every other provider gets and translates
    it: a ``template`` message becomes ``ContentSid`` + ``ContentVariables``,
    a ``text`` message becomes ``Body``.
    """

    name = "twilio"

    def __init__(
        self,
        *,
        account_sid: str,
        whatsapp_from: str,
        auth_token: str = "",
        api_key_sid: str = "",
        api_key_secret: str = "",
        content_sid_event_invite: str = "",
        status_callback_url: str = "",
    ) -> None:
        if not account_sid or not whatsapp_from:
            raise RuntimeError(
                "CU_TWILIO_ACCOUNT_SID and CU_TWILIO_WHATSAPP_FROM are required "
                "when CU_WHATSAPP_PROVIDER=twilio"
            )
        # Prefer the API key pair: it can be revoked on its own, whereas
        # rotating the auth token invalidates every other integration at once.
        if api_key_sid and api_key_secret:
            self._auth = (api_key_sid, api_key_secret)
        elif auth_token:
            self._auth = (account_sid, auth_token)
        else:
            raise RuntimeError(
                "CU_WHATSAPP_PROVIDER=twilio needs either CU_TWILIO_API_KEY_SID "
                "+ CU_TWILIO_API_KEY_SECRET, or CU_TWILIO_AUTH_TOKEN"
            )
        self._url = (
            f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        )
        self._from = channel_address(whatsapp_from)
        self._content_sid_event_invite = content_sid_event_invite
        self._status_callback_url = status_callback_url

    def _pinned_sid_for(self, template_name: str) -> str:
        from app.whatsapp.templates import EVENT_INVITE_TEMPLATE

        if template_name == EVENT_INVITE_TEMPLATE:
            return self._content_sid_event_invite
        return ""

    def build_request(self, payload: dict[str, Any]) -> dict[str, str]:
        """Meta body -> Twilio form fields.

        Raises ``ValueError`` on a shape it cannot express. :meth:`send`
        catches that and records it on the outbound row, because the
        alternative - posting a message with no body - delivers a blank
        WhatsApp message to a real person and still reports success.
        """
        recipient = payload.get("to")
        if not recipient:
            raise ValueError("payload has no recipient")

        data: dict[str, str] = {"From": self._from, "To": channel_address(recipient)}
        if self._status_callback_url:
            data["StatusCallback"] = self._status_callback_url

        kind = payload.get("type")
        if kind == "template":
            template = payload.get("template") or {}
            template_name = template.get("name")
            if not template_name:
                raise ValueError("template payload has no template name")
            data["ContentSid"] = twilio_content.resolve_content_sid(
                template_name,
                auth=self._auth,
                pinned=self._pinned_sid_for(template_name),
            )
            variables = content_variables(template)
            if variables:
                data["ContentVariables"] = json.dumps(variables)
        elif kind == "text":
            body = ((payload.get("text") or {}).get("body") or "").strip()
            if not body:
                raise ValueError("text payload has an empty body")
            data["Body"] = body
        else:
            raise ValueError(f"unsupported payload type {kind!r}")
        return data

    def send(self, payload: dict[str, Any]) -> SendResult:
        try:
            data = self.build_request(payload)
        except (ValueError, twilio_content.TemplateNotFound) as exc:
            return SendResult(ok=False, error=str(exc))
        except httpx.HTTPError as exc:
            return SendResult(ok=False, error=f"content lookup failed: {exc}")

        try:
            response = httpx.post(self._url, auth=self._auth, data=data, timeout=20.0)
        except httpx.HTTPError as exc:
            return SendResult(ok=False, error=f"transport error: {exc}")

        if response.status_code >= 400:
            return SendResult(
                ok=False, error=f"{response.status_code}: {response.text[:500]}"
            )

        body = response.json()
        # Twilio returns 201 for a message it has already given up on, so the
        # status field decides whether this was a send, not the HTTP code.
        if body.get("status") == "failed" or body.get("error_code"):
            return SendResult(
                ok=False,
                error=f"twilio {body.get('error_code')}: {body.get('error_message')}",
            )
        return SendResult(ok=True, provider_message_id=body.get("sid"))


_fake_singleton = FakeProvider()


def get_provider() -> WhatsAppProvider:
    settings = get_settings()
    if settings.whatsapp_provider == "cloud":
        return CloudProvider(
            settings.whatsapp_phone_number_id, settings.whatsapp_access_token
        )
    if settings.whatsapp_provider == "twilio":
        return TwilioProvider(
            account_sid=settings.twilio_account_sid,
            whatsapp_from=settings.twilio_whatsapp_from,
            auth_token=settings.twilio_auth_token,
            api_key_sid=settings.twilio_api_key_sid,
            api_key_secret=settings.twilio_api_key_secret,
            content_sid_event_invite=settings.twilio_content_sid_event_invite,
            status_callback_url=settings.twilio_status_callback_url,
        )
    return _fake_singleton


def get_fake_provider() -> FakeProvider:
    """Test/dev access to the recorded sends."""
    return _fake_singleton
