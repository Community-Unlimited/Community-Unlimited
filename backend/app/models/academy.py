"""Scheduled events and enrollment.

One table covers both kinds of scheduling the operation needs:

* ``kind='training'`` with a ``module_id`` - a CB1-CB7 Academy session.
* ``kind='community'`` with no module - a general community event.

Both are invited, acknowledged and attended over WhatsApp through exactly the
same flow, so they deliberately share a table rather than diverging into two
near-identical ones.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UtcDateTime
from app.models.pathway import Module
from app.models.person import STATUS_LEN, Person

EVENT_STATUSES = (
    "draft",
    "open",
    "full",
    "waitlist",
    "closed",
    "completed",
    "cancelled",
)

ENROLLMENT_STATUSES = (
    "invited",
    "registered",
    "waitlisted",
    "confirmed",
    "attended",
    "no_show",
    "cancelled",
    "completed",
    "requires_reassessment",
)

# Enrollment states that occupy a seat. Cancelled/no-show release the seat.
SEAT_HOLDING_STATUSES = (
    "registered",
    "confirmed",
    "attended",
    "completed",
    "requires_reassessment",
)


class ScheduledEvent(Base, TimestampMixin):
    __tablename__ = "scheduled_events"
    __table_args__ = (
        Index("ix_scheduled_events_starts_at", "starts_at"),
        Index("ix_scheduled_events_kind_status", "kind", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # training | community | briefing
    kind: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="training", nullable=False
    )
    module_id: Mapped[int | None] = mapped_column(
        ForeignKey("modules.id", ondelete="RESTRICT")
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    venue: Mapped[str] = mapped_column(String(200), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)

    # 5.2 LOCKED: max 10 participants per training session.
    capacity: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="draft", nullable=False
    )

    trainer_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff_users.id", ondelete="SET NULL")
    )
    assessment_required: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)

    module: Mapped[Module | None] = relationship()
    enrollments: Mapped[list[Enrollment]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )

    @property
    def seats_taken(self) -> int:
        return sum(1 for e in self.enrollments if e.status in SEAT_HOLDING_STATUSES)

    @property
    def seats_available(self) -> int:
        return max(0, self.capacity - self.seats_taken)

    def __repr__(self) -> str:
        return f"<ScheduledEvent {self.id} {self.title!r} {self.starts_at:%Y-%m-%d}>"


class Enrollment(Base, TimestampMixin):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("event_id", "person_id"),
        Index("ix_enrollments_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("scheduled_events.id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[int] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=False
    )

    status: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="registered", nullable=False
    )
    # self | assisted | admin | whatsapp
    source: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="admin", nullable=False
    )

    attended_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    marked_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff_users.id", ondelete="SET NULL")
    )
    # pass | fail | not_required
    assessment_outcome: Mapped[str | None] = mapped_column(String(STATUS_LEN))
    notes: Mapped[str | None] = mapped_column(Text)

    event: Mapped[ScheduledEvent] = relationship(back_populates="enrollments")
    person: Mapped[Person] = relationship(back_populates="enrollments")
