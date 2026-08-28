"""Inbound webhook processing.

Both the live Meta route and the dev simulator call :func:`handle_payload`, so
the offline path exercises exactly the same code that will run in production.

Signature verification hashes the **raw request bytes**. Re-serialising the
parsed JSON and hashing that never matches - key order and whitespace differ
from what Meta signed.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    EventAcknowledgment,
    InboundMessage,
    OutboundMessage,
    Person,
    utcnow,
)
from app.models.messaging import ACK_PAYLOADS


def verify_signature(raw_body: bytes, header: str | None, app_secret: str) -> bool:
    """Validate ``X-Hub-Signature-256`` against the raw bytes."""
    if not header or not app_secret:
        return False
    prefix, _, provided = header.partition("=")
    if prefix != "sha256" or not provided:
        return False
    expected = hmac.new(
        app_secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, provided)


def sign(raw_body: bytes, app_secret: str) -> str:
    """Produce the header Meta would send. Used by the dev simulator."""
    digest = hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _iter_messages(payload: dict[str, Any]):
    for entry in payload.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value", {}) or {}
            for message in value.get("messages", []) or []:
                yield message


def _resolve_event_id(
    db: Session, message: dict[str, Any], person: Person | None
) -> int | None:
    """Find which event a button press answers.

    A quick-reply carries ``context.id`` - the id of the template message it
    replies to - so the authoritative link is through the outbound row we
    already stored. Only if that is missing do we fall back to the person's
    most recent invite.
    """
    context_id = (message.get("context") or {}).get("id")
    if context_id:
        outbound = db.scalar(
            select(OutboundMessage).where(
                OutboundMessage.provider_message_id == context_id
            )
        )
        if outbound is not None and outbound.event_id is not None:
            return outbound.event_id

    if person is not None:
        latest = db.scalar(
            select(OutboundMessage)
            .where(
                OutboundMessage.person_id == person.id,
                OutboundMessage.kind == "event_invite",
                OutboundMessage.event_id.is_not(None),
            )
            .order_by(OutboundMessage.id.desc())
        )
        if latest is not None:
            return latest.event_id
    return None


def handle_payload(db: Session, payload: dict[str, Any]) -> dict[str, int]:
    """Process a webhook body. Idempotent for exact redelivery."""
    stored = duplicates = acknowledged = stale = unresolved = 0

    for message in _iter_messages(payload):
        provider_message_id = message.get("id")
        if not provider_message_id:
            continue

        # Meta retries on any non-200, so identical redelivery must be a no-op.
        already = db.scalar(
            select(InboundMessage).where(
                InboundMessage.provider_message_id == provider_message_id
            )
        )
        if already is not None:
            duplicates += 1
            continue

        from_wa_id = message.get("from", "")
        person = db.scalar(
            select(Person).where(Person.phone_e164 == f"+{from_wa_id}")
        )

        raw_ts = message.get("timestamp")
        provider_ts = (
            datetime.fromtimestamp(int(raw_ts), tz=timezone.utc) if raw_ts else utcnow()
        )

        msg_type = message.get("type", "other")
        button_payload = None
        text_body = None
        if msg_type == "button":
            button_payload = (message.get("button") or {}).get("payload")
        elif msg_type == "interactive":
            interactive = message.get("interactive") or {}
            button_payload = (interactive.get("button_reply") or {}).get("id")
        elif msg_type == "text":
            text_body = (message.get("text") or {}).get("body")

        inbound = InboundMessage(
            provider_message_id=provider_message_id,
            person_id=person.id if person else None,
            from_wa_id=from_wa_id,
            kind=msg_type,
            button_payload=button_payload,
            text_body=text_body,
            provider_timestamp=provider_ts,
            raw=message,
            processed_at=utcnow(),
        )
        db.add(inbound)
        db.flush()
        stored += 1

        response = ACK_PAYLOADS.get(button_payload or "")
        if response is None or person is None:
            if response is not None and person is None:
                unresolved += 1
            continue

        event_id = _resolve_event_id(db, message, person)
        if event_id is None:
            unresolved += 1
            continue

        existing = db.scalar(
            select(EventAcknowledgment).where(
                EventAcknowledgment.event_id == event_id,
                EventAcknowledgment.person_id == person.id,
            )
        )
        if existing is None:
            db.add(
                EventAcknowledgment(
                    event_id=event_id,
                    person_id=person.id,
                    response=response,
                    responded_at=provider_ts,
                    inbound_message_id=inbound.id,
                )
            )
            acknowledged += 1
        elif existing.supersedes(provider_ts):
            existing.response = response
            existing.responded_at = provider_ts
            existing.inbound_message_id = inbound.id
            acknowledged += 1
        else:
            # Older than what we hold - an out-of-order redelivery, not a change
            # of mind. Strictly older: same-second corrections still win above.
            stale += 1

    db.commit()
    return {
        "stored": stored,
        "duplicates": duplicates,
        "acknowledged": acknowledged,
        "stale": stale,
        "unresolved": unresolved,
    }
