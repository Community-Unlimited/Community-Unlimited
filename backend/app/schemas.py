"""Request and response models."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.phone import InvalidPhoneNumber, normalize_sg_phone


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------
# auth
# --------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str


# --------------------------------------------------------------------------
# registration / people
# --------------------------------------------------------------------------

INTERESTS = (
    "coffee",
    "exercise_hosting",
    "digital_support",
    "soundtech",
    "facilitation",
    "other",
)


class AvailabilityIn(BaseModel):
    weekday: int = Field(ge=0, le=6)
    start_time: str = Field(examples=["09:00"])
    end_time: str = Field(examples=["12:00"])


class RegistrationRequest(BaseModel):
    """18: minimal data entry. Only name, phone and consent are required."""

    preferred_name: str = Field(min_length=1, max_length=120)
    phone: str
    full_name: str | None = None
    email: str | None = None
    age_band: str | None = None
    preferred_language: str = "en"
    home_zone: str | None = None
    home_precinct: str | None = None
    interests: list[str] = Field(default_factory=list)
    availability: list[AvailabilityIn] = Field(default_factory=list)

    # 19: participation consent is required; messaging consent is separate.
    consent_participation: bool
    consent_whatsapp: bool = False

    # 18: assisted registration by a volunteer or staff member.
    assisted_registration: bool = False
    assisted_by: str | None = None

    @field_validator("phone")
    @classmethod
    def _valid_phone(cls, v: str) -> str:
        try:
            return normalize_sg_phone(v)
        except InvalidPhoneNumber as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("consent_participation")
    @classmethod
    def _must_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("participation consent is required to register")
        return v

    @field_validator("interests")
    @classmethod
    def _known_interests(cls, v: list[str]) -> list[str]:
        unknown = [i for i in v if i not in INTERESTS]
        if unknown:
            raise ValueError(f"unknown interests: {', '.join(unknown)}")
        return v


class TierOut(BaseModel):
    person_id: int
    core_completed: list[str]
    core_missing: list[str]
    leadership_held: list[str]
    pending_approval: list[str]
    highest_qualification: str | None
    deployable: bool
    can_lead: bool
    tier_label: str
    disciple_status: str | None
    next_module: str | None


class PersonOut(ORMModel):
    id: int
    preferred_name: str
    full_name: str | None
    phone_e164: str
    email: str | None
    age_band: str | None
    preferred_language: str
    home_zone: str | None
    home_precinct: str | None
    status: str
    registration_source: str
    assisted_registration: bool
    disciple_status: str | None
    created_at: datetime


class PersonDetailOut(PersonOut):
    interests: list[str] = Field(default_factory=list)
    tier: TierOut | None = None

    @field_validator("interests", mode="before")
    @classmethod
    def _flatten_interests(cls, v: object) -> list[str]:
        # from_attributes picks up the PersonInterest relationship, so flatten
        # the ORM rows to their interest strings before validation.
        if not v:
            return []
        return [i if isinstance(i, str) else i.interest for i in v]  # type: ignore[union-attr]


class RegistrationResponse(BaseModel):
    """``person`` is omitted when the number was already registered.

    Public self-registration must not confirm back to an anonymous caller who
    else is on the system, so a repeat submission gets a neutral acknowledgement
    rather than the existing record.
    """

    already_registered: bool = False
    person: PersonOut | None = None
    tier: TierOut | None = None
    message: str


# --------------------------------------------------------------------------
# events / academy
# --------------------------------------------------------------------------


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: Literal["training", "community", "briefing"] = "training"
    module_code: str | None = None
    venue: str
    starts_at: datetime
    ends_at: datetime
    capacity: int = Field(default=10, ge=1, le=500)
    assessment_required: bool = False
    notes: str | None = None

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _must_be_aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("send an ISO-8601 datetime with a timezone offset")
        return v


class EventUpdate(BaseModel):
    title: str | None = None
    venue: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    capacity: int | None = Field(default=None, ge=1, le=500)
    status: str | None = None
    notes: str | None = None


class EventOut(ORMModel):
    id: int
    kind: str
    title: str
    venue: str
    starts_at: datetime
    ends_at: datetime
    capacity: int
    status: str
    assessment_required: bool
    module_code: str | None = None
    seats_taken: int = 0
    seats_available: int = 0
    acknowledged_yes: int = 0
    acknowledged_no: int = 0
    acknowledged_maybe: int = 0
    awaiting_reply: int = 0


class EnrollRequest(BaseModel):
    person_id: int
    source: Literal["self", "assisted", "admin", "whatsapp"] = "admin"


class AttendanceMark(BaseModel):
    person_id: int
    attended: bool
    assessment_outcome: Literal["pass", "fail", "not_required"] | None = None


class EnrollmentOut(ORMModel):
    id: int
    person_id: int
    event_id: int
    status: str
    source: str
    attended_at: datetime | None
    assessment_outcome: str | None
    preferred_name: str | None = None


class ApproveQualificationRequest(BaseModel):
    person_id: int
    module_code: str
    is_override: bool = False
    reason: str | None = None


# --------------------------------------------------------------------------
# assets
# --------------------------------------------------------------------------


class AssetOut(ORMModel):
    id: int
    code: str
    name: str
    block_address: str | None
    zone: str | None
    precinct: str | None
    status: str
    planned_launch_date: date | None
    actual_launch_date: date | None
    gates_met: int = 0
    blockers: list[str] = Field(default_factory=list)
    is_ready_to_launch: bool = False


class AssetGateUpdate(BaseModel):
    gate: str
    value: bool


# --------------------------------------------------------------------------
# launch control
# --------------------------------------------------------------------------


class FindingOut(BaseModel):
    code: str
    severity: str
    title: str
    detail: str
    metrics: dict[str, Any]


class LaunchControlOut(BaseModel):
    generated_at: str
    worst_severity: str
    headline: dict[str, Any]
    findings: list[FindingOut]


# --------------------------------------------------------------------------
# whatsapp / dev
# --------------------------------------------------------------------------


class SimulateReplyRequest(BaseModel):
    phone: str
    response: Literal["yes", "no", "maybe"]
    event_id: int | None = None
    provider_message_id: str | None = None
    timestamp: int | None = None

    @field_validator("phone")
    @classmethod
    def _valid_phone(cls, v: str) -> str:
        try:
            return normalize_sg_phone(v)
        except InvalidPhoneNumber as exc:
            raise ValueError(str(exc)) from exc


class InviteRequest(BaseModel):
    person_ids: list[int] | None = None
    send_now: bool = True
