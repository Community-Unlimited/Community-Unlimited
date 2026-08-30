"""WhatsApp transport.

``CU_WHATSAPP_PROVIDER=fake`` (the default) performs no network I/O at all, so
the entire application - including the outbox, the webhook and acknowledgment
handling - is exercisable offline and in CI with no Meta credentials.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.config import get_settings

GRAPH_API_VERSION = "v21.0"


@dataclass(frozen=True, slots=True)
class SendResult:
    ok: bool
    provider_message_id: str | None = None
    error: str | None = None


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


_fake_singleton = FakeProvider()


def get_provider() -> WhatsAppProvider:
    settings = get_settings()
    if settings.whatsapp_provider == "cloud":
        return CloudProvider(
            settings.whatsapp_phone_number_id, settings.whatsapp_access_token
        )
    return _fake_singleton


def get_fake_provider() -> FakeProvider:
    """Test/dev access to the recorded sends."""
    return _fake_singleton
