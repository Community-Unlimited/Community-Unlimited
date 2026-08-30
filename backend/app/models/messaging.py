"""WhatsApp messaging tables.

The Meta integration is deliberately not wired up yet - only the seams are
here, so next session is configuration rather than surgery. Three constraints
in this file exist because of specific, expensive bugs:

* ``OutboundMessage.dedupe_key`` is UNIQUE, which is what stops a retry or a
  double-running scheduler from sending twice. A *cancelled* row must have its
  key mangled (see ``cancel()``), otherwise the cancelled row keeps occupying
  that key forever and the message can never legitimately be sent again.
* ``InboundMessage.provider_message_id`` is UNIQUE. Meta redelivers webhooks on
  any non-200, so exact redelivery must be absorbed at the database level.
* ``EventAcknowledgment`` compares provider timestamps with ``<``, never
  ``<=`` - Meta timestamps are whole seconds, so ``<=`` silently discards a
  genuine change of mind inside the same second.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UtcDateTime, utcnow
from app.models.person import STATUS_LEN, Person

OUTBOUND_STATUSES = (
    "queued",
    "sent",
    "delivered",
    "read",
    "failed",
    "cancelled",
)

# The three quick-reply buttons on the event invite template.
ACK_YES = "ack_yes"
ACK_NO = "ack_no"
ACK_MAYBE = "ack_maybe"
ACK_PAYLOADS = {ACK_YES: "yes", ACK_NO: "no", ACK_MAYBE: "maybe"}


class OutboundMessage(Base, TimestampMixin):
    __tablename__ = "outbound_messages"
    __table_args__ = (
        UniqueConstraint("dedupe_key"),
        Index("ix_outbound_messages_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=False
    )
    event_id: Mapped[int | None] = mapped_column(
        ForeignKey("scheduled_events.id", ondelete="CASCADE")
    )

    # event_invite | event_reminder | event_cancelled | qualification_awarded |
    # shift_assigned | broadcast
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    # Stable natural key, e.g. "event_invite:12:person:34".
    dedupe_key: Mapped[str] = mapped_column(String(255), nullable=False)

    status: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="queued", nullable=False
    )
    to_wa_id: Mapped[str] = mapped_column(String(32), nullable=False)
    # Exactly the JSON body posted to the Cloud API. The fake provider renders
    # this identically to the real one, so switching providers changes nothing
    # about what is stored.
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    scheduled_for: Mapped[datetime | None] = mapped_column(UtcDateTime)
    sent_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    provider_message_id: Mapped[str | None] = mapped_column(String(128))
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)

    person: Mapped[Person] = relationship()

    def cancel(self) -> None:
        """Cancel this message and free its dedupe key.

        The key is UNIQUE. Leaving it intact on a cancelled row permanently
        blocks that logical message from ever being sent again.
        """
        self.status = "cancelled"
        self.dedupe_key = f"cancelled:{utcnow():%Y%m%d%H%M%S%f}:{self.dedupe_key}"[:255]


class InboundMessage(Base, TimestampMixin):
    __tablename__ = "inbound_messages"
    __table_args__ = (UniqueConstraint("provider_message_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    provider_message_id: Mapped[str] = mapped_column(String(128), nullable=False)

    person_id: Mapped[int | None] = mapped_column(
        ForeignKey("people.id", ondelete="SET NULL")
    )
    from_wa_id: Mapped[str] = mapped_column(String(32), nullable=False)

    # button | text | interactive | other
    kind: Mapped[str] = mapped_column(String(STATUS_LEN), nullable=False)
    button_payload: Mapped[str | None] = mapped_column(String(64))
    text_body: Mapped[str | None] = mapped_column(Text)

    # Whole seconds, straight from Meta.
    provider_timestamp: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    raw: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    processed_at: Mapped[datetime | None] = mapped_column(UtcDateTime)

    person: Mapped[Person | None] = relationship()


class EventAcknowledgment(Base, TimestampMixin):
    """A person's yes/no/maybe against an event, from a quick-reply button."""

    __tablename__ = "event_acknowledgments"
    __table_args__ = (UniqueConstraint("event_id", "person_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("scheduled_events.id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[int] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=False
    )

    # yes | no | maybe
    response: Mapped[str] = mapped_column(String(STATUS_LEN), nullable=False)
    responded_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    inbound_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("inbound_messages.id", ondelete="SET NULL")
    )

    def supersedes(self, incoming_ts: datetime) -> bool:
        """True when an incoming answer should replace the one we hold.

        Reject only what is *strictly older*. Meta timestamps have one-second
        resolution, so a person who taps "No" then "Yes" inside the same second
        produces two distinct messages carrying the same timestamp - requiring
        ``incoming > stored`` would silently discard the correction and leave
        the wrong answer on record.

        This is safe against duplicates because exact redelivery never reaches
        here: ``InboundMessage.provider_message_id`` is UNIQUE, so a replayed
        webhook is dropped before any acknowledgment is touched.
        """
        return incoming_ts >= self.responded_at
