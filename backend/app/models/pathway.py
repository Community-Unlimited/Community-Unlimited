"""Pathways, modules and qualifications - the configurable tier engine.

13: the engine must not assume every pathway has exactly seven levels, and
4.3: formal qualification codes are stored separately from the public display
title, which is still being decided. Permission logic keys off the *code*,
never the display title.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UtcDateTime
from app.models.person import STATUS_LEN, Person


class Pathway(Base, TimestampMixin):
    __tablename__ = "pathways"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    modules: Mapped[list[Module]] = relationship(
        back_populates="pathway",
        cascade="all, delete-orphan",
        order_by="Module.sequence",
    )


class Module(Base, TimestampMixin):
    """A trainable unit, e.g. CB1 Brew Techniques."""

    __tablename__ = "modules"
    __table_args__ = (UniqueConstraint("pathway_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pathway_id: Mapped[int] = mapped_column(
        ForeignKey("pathways.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    # core | leadership. CB1-CB4 are core; CB5-CB7 are leadership progression
    # that not everyone is expected to take.
    kind: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="core", nullable=False
    )
    # The deployment gate: CB1 AND CB2 AND CB3 AND CB4.
    required_for_deployment: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    # 7: which leadership duty this module unlocks, if any.
    grants_role: Mapped[str | None] = mapped_column(String(64))
    # 4.3 configurable and NEVER used as permission logic.
    display_title: Mapped[str | None] = mapped_column(String(120))

    default_capacity: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    assessment_required: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    pathway: Mapped[Pathway] = relationship(back_populates="modules")

    def __repr__(self) -> str:
        return f"<Module {self.code} {self.name!r}>"


class Qualification(Base, TimestampMixin):
    """A module a person has actually earned.

    11.3: AI may compute readiness, but a human approves. A row only counts
    toward deployability when ``status == 'approved'``.
    """

    __tablename__ = "qualifications"
    __table_args__ = (UniqueConstraint("person_id", "module_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=False
    )
    module_id: Mapped[int] = mapped_column(
        ForeignKey("modules.id", ondelete="CASCADE"), nullable=False
    )

    # pending_approval | approved | revoked
    status: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="pending_approval", nullable=False
    )
    achieved_at: Mapped[datetime | None] = mapped_column(UtcDateTime)

    approved_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff_users.id", ondelete="SET NULL")
    )
    approved_at: Mapped[datetime | None] = mapped_column(UtcDateTime)

    # 11.3: an override must record who, why, when and any expiry.
    is_override: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    override_reason: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(UtcDateTime)

    # 22.8: CB3 is an internal module and is not itself a statutory food-safety
    # certificate. External evidence is recorded separately.
    external_evidence_ref: Mapped[str | None] = mapped_column(String(200))

    person: Mapped[Person] = relationship(back_populates="qualifications")
    module: Mapped[Module] = relationship()

    @property
    def is_effective(self) -> bool:
        from app.models.base import utcnow

        if self.status != "approved":
            return False
        if self.expires_at is not None and self.expires_at <= utcnow():
            return False
        return True
