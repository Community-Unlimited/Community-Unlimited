"""Outbound queue.

Everything goes through a queued row before it is sent, so a send is always
idempotent, always auditable, and never lost when the provider is unreachable.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OutboundMessage, Person, ScheduledEvent, utcnow
from app.services.calendar import SGT
from app.utils.phone import to_wa_id
from app.whatsapp import templates
from app.whatsapp.provider import get_provider


def invite_dedupe_key(event_id: int, person_id: int) -> str:
    return f"event_invite:{event_id}:person:{person_id}"


def format_when(event: ScheduledEvent) -> str:
    """Human date/time in Singapore local time, which is what the reader expects."""
    local = event.starts_at.astimezone(SGT)
    local_end = event.ends_at.astimezone(SGT)
    return f"{local:%a %d %b %Y}, {local:%I:%M%p}-{local_end:%I:%M%p}".replace(
        "AM", "am"
    ).replace("PM", "pm")


def queue_event_invite(
    db: Session, event: ScheduledEvent, person: Person
) -> OutboundMessage | None:
    """Queue one invite. Returns ``None`` when one already exists.

    The UNIQUE dedupe key is the real guard - this check just avoids a pointless
    IntegrityError on the common path.
    """
    key = invite_dedupe_key(event.id, person.id)
    existing = db.scalar(
        select(OutboundMessage).where(OutboundMessage.dedupe_key == key)
    )
    if existing is not None:
        return None

    wa_id = to_wa_id(person.phone_e164)
    payload = templates.event_invite(
        wa_id,
        preferred_name=person.preferred_name,
        event_title=event.title,
        when_text=format_when(event),
        venue=event.venue,
        language=person.preferred_language or "en",
    )
    message = OutboundMessage(
        person_id=person.id,
        event_id=event.id,
        kind="event_invite",
        dedupe_key=key,
        status="queued",
        to_wa_id=wa_id,
        payload=payload,
    )
    db.add(message)
    return message


def flush(db: Session, limit: int = 100) -> dict[str, int]:
    """Send queued messages. Safe to call repeatedly."""
    provider = get_provider()
    queued = list(
        db.scalars(
            select(OutboundMessage)
            .where(OutboundMessage.status == "queued")
            .order_by(OutboundMessage.id)
            .limit(limit)
        )
    )

    sent = failed = 0
    for message in queued:
        result = provider.send(message.payload)
        message.attempts += 1
        if result.ok:
            message.status = "sent"
            message.sent_at = utcnow()
            message.provider_message_id = result.provider_message_id
            message.error = None
            sent += 1
        else:
            message.status = "failed"
            message.error = result.error
            failed += 1

    db.commit()
    return {"sent": sent, "failed": failed, "considered": len(queued)}
