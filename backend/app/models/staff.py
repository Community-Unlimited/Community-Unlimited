"""CU staff / operator accounts.

14: permissions are role-based and auditable. Community members are NOT staff
users - they have no password and are reached over WhatsApp.
"""

from __future__ import annotations

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.person import STATUS_LEN

# 14. Ordered loosely by breadth of access; `role` is checked explicitly, never
# by comparing display names.
STAFF_ROLES = (
    "trainer",
    "asset_coordinator",
    "precinct_coordinator",
    "zone_coordinator",
    "partner_user",
    "ops_admin",
    "data_custodian",
)


class StaffUser(Base, TimestampMixin):
    __tablename__ = "staff_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="ops_admin", nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<StaffUser {self.email} role={self.role}>"
