"""Audit recording.

Written in the same transaction as the decision it describes, so a committed
approval always has committed evidence.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditEvent, StaffUser


def record(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    actor: StaffUser | None = None,
    actor_type: str = "staff",
    summary: str | None = None,
    detail: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_type="system" if actor is None and actor_type == "staff" else actor_type,
        actor_id=actor.id if actor else None,
        actor_label=actor.email if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        detail=detail,
    )
    db.add(event)
    return event
