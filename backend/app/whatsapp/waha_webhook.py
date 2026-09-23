"""WAHA (linked-device WhatsApp) webhooks: signature checking and translation.

Same approach as :mod:`app.whatsapp.twilio_webhook`: WAHA's events are
rewritten into the Meta envelope and handed to
:func:`app.whatsapp.webhook_handler.handle_payload`, so dedupe, event
resolution and the change-of-mind rules stay in one place.

A poll vote becomes a ``button`` message whose payload is the ``ack_*`` id of
the option picked and whose ``context.id`` is the poll's key id, which is what
:class:`app.whatsapp.provider.WahaProvider` stored as the outbound
``provider_message_id``.

Things that differ from the official APIs and matter here:

* **The number is also a phone.** Messages typed on the phone come back as
  ``fromMe`` events, and so does a vote the operator casts on their own poll.
  Both are dropped, or staff would acknowledge on a member's behalf.
* **Senders can be ``@lid``.** WhatsApp is moving to privacy ids that are not
  phone numbers. The route resolves those through the poll's outbound row or
  WAHA's LID lookup; nothing here assumes ``from`` is digits.
* **A vote has no stable id of its own across engines**, and changing a vote
  is a new event. The inbound id is built from the vote id, its timestamp and
  the options chosen, so a redelivery is absorbed but a change of mind is not.
* **Retracting a vote** arrives with no options. It is stored, and it leaves
  the recorded acknowledgment alone.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Callable
from typing import Any

# WAHA signs with sha512 today; the header names the algorithm, so accept only
# ones that are actually HMACs worth trusting.
_HMAC_ALGORITHMS = {"sha512", "sha256"}
_PHONE_SUFFIXES = ("@c.us", "@s.whatsapp.net")
_IGNORED_SUFFIXES = ("@g.us", "@broadcast", "@newsletter")


def compute_signature(raw_body: bytes, key: str, algorithm: str = "sha512") -> str:
    return hmac.new(key.encode("utf-8"), raw_body, algorithm).hexdigest()


def verify_signature(
    raw_body: bytes, header: str | None, key: str, algorithm: str | None = None
) -> bool:
    """Validate ``X-Webhook-Hmac`` (hex) over the raw request bytes."""
    algorithm = (algorithm or "sha512").lower()
    if not header or not key or algorithm not in _HMAC_ALGORITHMS:
        return False
    return hmac.compare_digest(compute_signature(raw_body, key, algorithm), header)


def chat_id(wa_id: str) -> str:
    """``6591234567`` / ``+6591234567`` -> ``6591234567@c.us``."""
    value = wa_id.strip()
    if "@" in value:
        return value
    return value.lstrip("+") + "@c.us"


def wa_id_from_chat_id(value: str) -> str | None:
    """Bare digits for a phone-number chat id, ``None`` for anything else."""
    for suffix in _PHONE_SUFFIXES:
        if value.endswith(suffix):
            digits = value.removesuffix(suffix).split(":")[0]
            return digits if digits.isdigit() else None
    return None


def key_id(message_id: Any) -> str | None:
    """The WhatsApp key id inside WAHA's serialised message id.

    ``true_6591234567@c.us_3EB0C1A2`` -> ``3EB0C1A2``. Group messages append
    ``_<participant>``, hence the third segment rather than the last. Chat ids
    never contain an underscore.
    """
    if isinstance(message_id, dict):
        message_id = message_id.get("_serialized") or message_id.get("id")
    if not isinstance(message_id, str) or not message_id:
        return None
    parts = message_id.split("_")
    return parts[2] if len(parts) >= 3 else parts[-1]


def sent_message_id(body: Any) -> str | None:
    """Key id from a sendText/sendPoll response, whichever engine answered.

    GOWS and WEBJS return ``{"id": "true_..._<id>"}`` (WEBJS sometimes as an
    object with ``_serialized``); NOWEB returns the raw message with ``key.id``.
    """
    if not isinstance(body, dict):
        return None
    if body.get("id"):
        return key_id(body["id"])
    key = body.get("key")
    if isinstance(key, dict) and key.get("id"):
        return str(key["id"])
    return None


def ack_for_option(label: str) -> str | None:
    """Poll option text -> ``ack_*`` id. Tolerates case and spacing."""
    from app.whatsapp.templates import ACK_BUTTON_LABELS

    wanted = " ".join(label.split()).casefold()
    for ack, text in ACK_BUTTON_LABELS.items():
        if " ".join(text.split()).casefold() == wanted:
            return ack
    return None


def to_seconds(value: Any) -> int | None:
    """WAHA mixes seconds (messages) and milliseconds (votes)."""
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return None
    return number // 1000 if number > 10**11 else number


def _ignored_chat(value: str) -> bool:
    """Groups, status updates and channels: the sender is not a person."""
    return not value or value.endswith(_IGNORED_SUFFIXES)


def _forensics(payload: dict[str, Any]) -> dict[str, Any]:
    # _data is the engine's raw protobuf/JSON and can be large; the rest is
    # enough to debug with.
    return {k: v for k, v in payload.items() if k != "_data"}


def to_meta_envelope(
    event: dict[str, Any],
    *,
    resolve_wa_id: Callable[[str, str | None], str | None],
) -> dict[str, Any] | None:
    """Rewrite one WAHA webhook event, or ``None`` if it is not for us.

    ``resolve_wa_id(sender_chat_id, poll_key_id)`` returns the sender's bare
    phone digits; the route supplies it because it needs the database and
    WAHA's LID lookup.
    """
    kind = event.get("event")
    payload = event.get("payload") or {}

    if kind == "message":
        sender = payload.get("from") or ""
        if payload.get("fromMe") or _ignored_chat(sender):
            return None
        message_id = payload.get("id")
        if not message_id:
            return None
        body = payload.get("body")
        message: dict[str, Any] = (
            {"type": "text", "text": {"body": body}} if body else {"type": "other"}
        )
        message["id"] = f"waha:{key_id(message_id) or message_id}"[:128]
        timestamp = to_seconds(payload.get("timestamp"))
        poll_key = None

    elif kind == "poll.vote":
        vote = payload.get("vote") or {}
        poll = payload.get("poll") or {}
        sender = vote.get("from") or ""
        if vote.get("fromMe") or _ignored_chat(sender):
            return None
        poll_key = key_id(poll.get("id"))
        options = [str(o) for o in vote.get("selectedOptions") or []]
        ack = ack_for_option(options[0]) if len(options) == 1 else None
        if ack is not None:
            message = {"type": "button", "button": {"payload": ack, "text": options[0]}}
        else:
            # A retraction (no options) or an option we did not offer. Stored
            # for the record; it acknowledges nothing.
            message = {"type": "other"}
        raw_ts = vote.get("timestamp")
        timestamp = to_seconds(raw_ts)
        digest = hashlib.sha256("\x1f".join(options).encode("utf-8")).hexdigest()[:12]
        vote_key = key_id(vote.get("id")) or poll_key or "unknown"
        message["id"] = f"waha-vote:{vote_key}:{raw_ts}:{digest}"[:128]
        if poll_key:
            message["context"] = {"id": poll_key}

    else:
        return None

    wa_id = resolve_wa_id(sender, poll_key)
    message["from"] = wa_id or sender[:32]
    if timestamp is not None:
        message["timestamp"] = str(timestamp)
    message["waha"] = {"event": kind, "payload": _forensics(payload)}

    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WAHA",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "contacts": [{"wa_id": message["from"]}],
                            "messages": [message],
                        },
                    }
                ],
            }
        ],
    }
