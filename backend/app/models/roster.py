"""Cafe shifts and deployment assignments.

3.2 / 3.3 LOCKED: cafe service is 0730-1030 daily, seven days a week, and every
shift is staffed by exactly one trained Team Leader plus one Operator.
"""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UtcDateTime
from app.models.person import STATUS_LEN, Person

# 3.2 LOCKED public cafe period.
CAFE_OPEN = time(7, 30)
CAFE_CLOSE = time(10, 30)

# 3.3 LOCKED: one leader + one operator per shift.
SHIFT_ROLES = ("team_leader", "operator")

ASSIGNMENT_STATUSES = (
    "assigned",
    "confirmed",
    "declined",
    "completed",
    "cancelled",
    "replacement_needed",
)


class Shift(Base, TimestampMixin):
    __tablename__ = "shifts"
    __table_args__ = (
        UniqueConstraint("asset_id", "service_date"),
        Index("ix_shifts_service_date", "service_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    service_date: Mapped[date] = mapped_column(Date, nullable=False)
    starts_at: Mapped[time] = mapped_column(default=CAFE_OPEN, nullable=False)
    ends_at: Mapped[time] = mapped_column(default=CAFE_CLOSE, nullable=False)

    # planned | published | completed | cancelled
    status: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="planned", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)

    assignments: Mapped[list[DeploymentAssignment]] = relationship(
        back_populates="shift", cascade="all, delete-orphan"
    )

    def filled_role(self, role: str) -> bool:
        return any(
            a.role == role and a.status in ("assigned", "confirmed", "completed")
            for a in self.assignments
        )

    @property
    def uncovered_roles(self) -> list[str]:
        return [r for r in SHIFT_ROLES if not self.filled_role(r)]


class DeploymentAssignment(Base, TimestampMixin):
    __tablename__ = "deployment_assignments"
    __table_args__ = (
        UniqueConstraint("shift_id", "person_id"),
        Index("ix_deployment_assignments_person", "person_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    shift_id: Mapped[int] = mapped_column(
        ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[int] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=False
    )

    role: Mapped[str] = mapped_column(String(STATUS_LEN), nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="assigned", nullable=False
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    notes: Mapped[str | None] = mapped_column(Text)

    shift: Mapped[Shift] = relationship(back_populates="assignments")
    person: Mapped[Person] = relationship()
