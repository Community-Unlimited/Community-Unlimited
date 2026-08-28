"""Asset Registry.

2.2 is explicit: the authoritative list of the 17 Boon Lay assets does not
exist yet, so the structure is built first and real sites are filled in when
confirmed. Nothing here invents a site.

6.3 defines a 12-point Site Ready Gate. Each gate is a separate boolean rather
than one opaque score, because the requirement is that blocking reasons stay
visible - a black-box readiness number is explicitly rejected.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import Boolean, Date, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.person import STATUS_LEN

ASSET_STATUSES = (
    "not_started",
    "blocked",
    "preparing",
    "ready",
    "live",
    "paused",
    "retired",
)

# 6.3, in order. (attribute, human-readable blocker text)
READINESS_GATES: tuple[tuple[str, str], ...] = (
    ("place_confirmed", "Place not confirmed"),
    ("partner_confirmed", "Partner / owner not confirmed"),
    ("power_confirmed", "Power not confirmed"),
    ("water_confirmed", "Water not confirmed"),
    ("storage_confirmed", "Storage not confirmed"),
    ("equipment_allocated", "Equipment not allocated"),
    ("crew_sufficient", "Volunteer crew insufficient"),
    ("leader_coverage_sufficient", "Team-leader coverage insufficient"),
    ("safety_ready", "Safety / food ops not ready"),
    ("programme_plan_ready", "Programme / cafe plan not ready"),
    ("checkin_method_ready", "Data / check-in method not ready"),
    ("launch_approved", "Launch not approved"),
)


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    block_address: Mapped[str | None] = mapped_column(String(255))
    zone: Mapped[str | None] = mapped_column(String(120))
    precinct: Mapped[str | None] = mapped_column(String(120))
    asset_type: Mapped[str | None] = mapped_column(String(STATUS_LEN))

    venue_owner: Mapped[str | None] = mapped_column(String(200))
    partner_operator: Mapped[str | None] = mapped_column(String(200))
    cu_coordinator: Mapped[str | None] = mapped_column(String(200))

    status: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="not_started", nullable=False
    )
    planned_launch_date: Mapped[date | None] = mapped_column(Date)
    actual_launch_date: Mapped[date | None] = mapped_column(Date)

    # 3.4 working crew model: 14 core + 3 reserves = 17 per asset.
    target_crew_size: Mapped[int] = mapped_column(Integer, default=17, nullable=False)

    # --- 6.3 Site Ready Gate -------------------------------------------------
    place_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    partner_confirmed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    power_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    water_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    storage_confirmed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    equipment_allocated: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    crew_sufficient: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    leader_coverage_sufficient: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    safety_ready: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    programme_plan_ready: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    checkin_method_ready: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    launch_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text)

    @property
    def blockers(self) -> list[str]:
        """Every unmet gate, in checklist order. This is the readiness reason."""
        return [label for attr, label in READINESS_GATES if not getattr(self, attr)]

    @property
    def gates_met(self) -> int:
        return sum(1 for attr, _ in READINESS_GATES if getattr(self, attr))

    @property
    def is_ready_to_launch(self) -> bool:
        return not self.blockers

    def __repr__(self) -> str:
        return f"<Asset {self.code} {self.name!r} {self.status}>"
