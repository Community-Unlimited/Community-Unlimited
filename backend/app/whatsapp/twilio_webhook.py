"""Inbound Twilio webhooks: signature checking and translation.

Twilio posts form-encoded fields, not Meta's JSON envelope. Rather than grow a
second copy of the acknowledgment logic, this module rewrites those fields
into the Meta shape and hands them to the existing
:func:`app.whatsapp.webhook_handler.handle_payload`. Dedupe, the
context-to-event resolution and the staleness guard are all inherited
unchanged, so there is exactly one implementation of the rules that matter.

Two things here have bitten this integration class before:

* The signature is computed over the URL **Twilio called**, not the URL the
  app thinks it is serving. Behind a TLS-terminating proxy (Render), a URL
  rebuilt from the request arrives as ``http://`` and never matches. Set
  ``CU_TWILIO_WEBHOOK_URL`` to the exact registered URL and the guesswork
  disappears; :func:`public_url` honours ``X-Forwarded-*`` otherwise.
* Signature validation is keyed on the **auth token**, never an API key
  secret, even when sends authenticate with an API key.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from collections.abc import Mapping
from datetime import datetime
from typing import Any

from app.models import utcnow

# Twilio MessageStatus -> our outbound status. Ordered so a late callback
# cannot walk a message backwards (see advance_status).
_STATUS_RANK = {"sent": 1, "delivered": 2, "read": 3}
_TWILIO_STATUS = {
    "queued": "sent",
    "sending": "sent",
    "sent": "sent",
    "delivered": "delivered",
    "read": "read",
    "undelivered": "failed",
    "failed": "failed",
}


def compute_signature(url: str, params: Mapping[str, str], auth_token: str) -> str:
    """Twilio's X-Twilio-Signature: HMAC-SHA1 over URL + sorted params, base64.

    Parameter names are concatenated with their values and no separators, in
    case-sensitive byte order - which is what Python's ``sorted`` gives for
    the ASCII field names Twilio sends.
    """
    payload = url + "".join(f"{key}{params[key]}" for key in sorted(params))
    digest = hmac.new(
        auth_token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1
    ).digest()
    return base64.b64encode(digest).decode("ascii")


def verify_signature(
    url: str, params: Mapping[str, str], header: str | None, auth_token: str
) -> bool:
    if not header or not auth_token:
        return False
    return hmac.compare_digest(compute_signature(url, params, auth_token), header)


def public_url(
    *,
    scheme: str,
    netloc: str,
    path: str,
    query: str,
    headers: Mapping[str, str],
    configured: str = "",
) -> str:
    """The absolute URL Twilio addressed, as it appeared to Twilio.

    ``configured`` wins outright: it is the URL registered in the Twilio
    console, so it is by definition the one that was signed.
    """
    if configured:
        return configured

    forwarded_proto = headers.get("x-forwarded-proto", "").split(",")[0].strip()
    forwarded_host = headers.get("x-forwarded-host", "").split(",")[0].strip()
    scheme = forwarded_proto or scheme
    netloc = forwarded_host or headers.get("host", "") or netloc
    suffix = f"?{query}" if query else ""
    return f"{scheme}://{netloc}{path}{suffix}"


def wa_id_from(value: str) -> str:
    """``whatsapp:+6591234567`` -> ``6591234567``.

    Bare digits are what Meta uses and what ``handle_payload`` matches against
    ``Person.phone_e164``, so everything is normalised to that form.
    """
    return value.strip().removeprefix("whatsapp:").lstrip("+")


def to_meta_envelope(
    params: Mapping[str, str], *, received_at: datetime | None = None
) -> dict[str, Any]:
    """Rewrite a Twilio inbound POST as a Meta webhook envelope."""
    message_sid = (
        params.get("MessageSid") or params.get("SmsMessageSid") or params.get("SmsSid")
    )
    wa_id = params.get("WaId") or wa_id_from(params.get("From", ""))

    # Twilio sends no timestamp on inbound messages, so receipt time is the
    # best available. Whole seconds keeps it consistent with Meta, and the
    # acknowledgment guard already tolerates equal timestamps.
    timestamp = int((received_at or utcnow()).timestamp())

    button_payload = params.get("ButtonPayload")
    body = params.get("Body")
    if button_payload:
        message: dict[str, Any] = {
            "type": "button",
            "button": {
                "payload": button_payload,
                "text": params.get("ButtonText") or body or "",
            },
        }
    elif body:
        message = {"type": "text", "text": {"body": body}}
    else:
        message = {"type": "other"}

    message.update(
        {
            "from": wa_id,
            "id": message_sid,
            "timestamp": str(timestamp),
            # Kept for forensics: handle_payload stores the whole message dict
            # in inbound_messages.raw, so the original Twilio fields survive
            # for debugging without changing that handler.
            "twilio": dict(params),
        }
    )

    # A quick-reply carries the SID of the template message it answers, which
    # is the same id stored on the outbound row - so the event resolution
    # through context.id works identically to Meta.
    replied_to = params.get("OriginalRepliedMessageSid")
    if replied_to:
        message["context"] = {"id": replied_to}

    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "TWILIO",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": wa_id_from(
                                    params.get("To", "")
                                )
                            },
                            "contacts": [
                                {
                                    "profile": {
                                        "name": params.get("ProfileName", "")
                                    },
                                    "wa_id": wa_id,
                                }
                            ],
                            "messages": [message],
                        },
                    }
                ],
            }
        ],
    }


def advance_status(current: str, twilio_status: str) -> str | None:
    """The new outbound status for a delivery receipt, or ``None`` to ignore.

    Callbacks arrive out of order often enough to matter, so a receipt only
    moves a message forward. A failure always wins: it is terminal and it is
    the one an operator has to see.
    """
    mapped = _TWILIO_STATUS.get(twilio_status.lower())
    if mapped is None:
        return None
    if mapped == "failed":
        return "failed"
    if current in {"failed", "cancelled"}:
        return None
    if _STATUS_RANK.get(mapped, 0) <= _STATUS_RANK.get(current, 0):
        return None
    return mapped
