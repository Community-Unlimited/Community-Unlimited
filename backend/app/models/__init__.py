"""All ORM models.

Importing this package registers every table on ``Base.metadata``. Alembic's
``env.py`` and the test fixtures both rely on that, so any new model file must
be imported here or it will be silently missing from migrations.
"""

from app.models.academy import (
    ENROLLMENT_STATUSES,
    EVENT_STATUSES,
    SEAT_HOLDING_STATUSES,
    Enrollment,
    ScheduledEvent,
)
from app.models.asset import ASSET_STATUSES, READINESS_GATES, Asset
from app.models.audit import AuditEvent
from app.models.base import Base, TimestampMixin, UtcDateTime, utcnow
from app.models.messaging import (
    ACK_PAYLOADS,
    OUTBOUND_STATUSES,
    EventAcknowledgment,
    InboundMessage,
    OutboundMessage,
)
from app.models.pathway import Module, Pathway, Qualification
from app.models.person import Availability, Consent, Person, PersonInterest
from app.models.roster import (
    ASSIGNMENT_STATUSES,
    CAFE_CLOSE,
    CAFE_OPEN,
    SHIFT_ROLES,
    DeploymentAssignment,
    Shift,
)
from app.models.staff import STAFF_ROLES, StaffUser

__all__ = [
    "ACK_PAYLOADS",
    "ASSET_STATUSES",
    "ASSIGNMENT_STATUSES",
    "CAFE_CLOSE",
    "CAFE_OPEN",
    "ENROLLMENT_STATUSES",
    "EVENT_STATUSES",
    "OUTBOUND_STATUSES",
    "READINESS_GATES",
    "SEAT_HOLDING_STATUSES",
    "SHIFT_ROLES",
    "STAFF_ROLES",
    "Asset",
    "AuditEvent",
    "Availability",
    "Base",
    "Consent",
    "DeploymentAssignment",
    "Enrollment",
    "EventAcknowledgment",
    "InboundMessage",
    "Module",
    "OutboundMessage",
    "Pathway",
    "Person",
    "PersonInterest",
    "Qualification",
    "ScheduledEvent",
    "Shift",
    "StaffUser",
    "TimestampMixin",
    "UtcDateTime",
    "utcnow",
]
