"""People - the master community record.

Privacy rule from the handoff (11.2): CU focuses on *robust* seniors, but that
is not a reason to infer or store any health or frailty label. There is
deliberately no health field here. If one is ever needed it requires its own
justified workflow, minimal capture and explicit consent.
"""

from __future__ import annotations

from datetime import datetime, time

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UtcDateTime

# Status strings are deliberately generous in width. A previous build sized a
# status column String(10) and it silently truncated "requested".
STATUS_LEN = 32


class Person(Base, TimestampMixin):
    __tablename__ = "people"

    id: Mapped[int] = mapped_column(primary_key=True)

    preferred_name: Mapped[str] = mapped_column(String(120), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200))
    # The WhatsApp number is the identity key, so it is unique and always E.164.
    phone_e164: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    email: Mapped[str | None] = mapped_column(String(255))

    age_band: Mapped[str | None] = mapped_column(String(STATUS_LEN))
    preferred_language: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="en", nullable=False
    )

    home_zone: Mapped[str | None] = mapped_column(String(120))
    home_precinct: Mapped[str | None] = mapped_column(String(120))
    travel_willingness: Mapped[str | None] = mapped_column(String(STATUS_LEN))

    # registered | active | paused | withdrawn
    status: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="registered", nullable=False
    )
    # self | assisted | admin | whatsapp | import
    registration_source: Mapped[str] = mapped_column(
        String(STATUS_LEN), default="self", nullable=False
    )
    # 18: assisted registration is a first-class path, not an afterthought.
    assisted_registration: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    assisted_by: Mapped[str | None] = mapped_column(String(200))

    # 4.2 Disciple concept - explicitly NOT a formal CB level.
    disciple_status: Mapped[str | None] = mapped_column(String(STATUS_LEN))
    target_next_level: Mapped[str | None] = mapped_column(String(16))
    mentor_id: Mapped[int | None] = mapped_column(
        ForeignKey("people.id", ondelete="SET NULL")
    )

    notes: Mapped[str | None] = mapped_column(Text)

    interests: Mapped[list[PersonInterest]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )
    availability: Mapped[list[Availability]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )
    consents: Mapped[list[Consent]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )
    qualifications: Mapped[list["Qualification"]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )
    enrollments: Mapped[list["Enrollment"]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Person {self.id} {self.preferred_name!r} {self.phone_e164}>"


class PersonInterest(Base):
    """coffee | exercise_hosting | digital_support | soundtech | facilitation | other"""

    __tablename__ = "person_interests"
    __table_args__ = (UniqueConstraint("person_id", "interest"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=False
    )
    interest: Mapped[str] = mapped_column(String(64), nullable=False)

    person: Mapped[Person] = relationship(back_populates="interests")


class Availability(Base, TimestampMixin):
    """Recurring weekly availability. 0 = Monday .. 6 = Sunday."""

    __tablename__ = "availability"
    __table_args__ = (
        UniqueConstraint("person_id", "weekday", "start_time", "end_time"),
        Index("ix_availability_weekday", "weekday"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=False
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(nullable=False)
    end_time: Mapped[time] = mapped_column(nullable=False)

    person: Mapped[Person] = relationship(back_populates="availability")


class Consent(Base, TimestampMixin):
    """19: explicit, versioned, revocable consent per purpose."""

    __tablename__ = "consents"
    __table_args__ = (UniqueConstraint("person_id", "consent_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=False
    )
    # participation | whatsapp_messaging | photo_media
    consent_type: Mapped[str] = mapped_column(String(64), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    version: Mapped[str] = mapped_column(String(32), default="v1", nullable=False)
    granted_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    # verbal_assisted | web_form | whatsapp | paper
    method: Mapped[str | None] = mapped_column(String(STATUS_LEN))

    person: Mapped[Person] = relationship(back_populates="consents")
