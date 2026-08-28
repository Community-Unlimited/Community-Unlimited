"""Audit trail.

19 requires an audit trail, and 11.3 requires that any qualification override
records who approved it, why, when, and any expiry. Approvals and overrides go
through :func:`app.services.audit.record` so the evidence is written in the
same transaction as the decision.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.person import STATUS_LEN


class AuditEvent(Base, TimestampMixin):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_entity", "entity_type", "entity_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # staff | system | whatsapp
    actor_type: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="staff", nullable=False
    )
    actor_id: Mapped[int | None] = mapped_column(Integer)
    actor_label: Mapped[str | None] = mapped_column(String(200))

    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer)

    summary: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSON)
