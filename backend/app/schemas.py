"""Request and response models."""

from __future__ import annotations

import re
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

AGE_BANDS = (
    "<30",
    "30-40",
    "40-50",
    "50-59",
    "60-69",
    "70-79",
    "80+",
)

LANGUAGE_OPTIONS = (
    "en",
    "zh",
    "ms",
    "ta",
    "other",
)

INTERESTS = (
    "coffee",
    "exercise_hosting",
    "digital_support",
    "soundtech",
    "facilitation",
    "other",
)

MOBILITY_AIDS = (
    "none",
    "pmd",
    "wheelchair",
    "walking_aid",
)

HEALTH_CONDITIONS = (
    "heart_blood_pressure",
    "epilepsy_seizures",
    "joint_balance_mobility",
    "asthma_respiratory",
    "heat_grip_sensitivity",
    "allergies",
    "other",
)

_NRIC_PARTIAL_RE = re.compile(r"^\d{3}[A-Z]?$")


class AvailabilityIn(BaseModel):
    weekday: int = Field(ge=0, le=6)
    start_time: str = Field(examples=["09:00"])
    end_time: str = Field(examples=["12:00"])


class RegistrationRequest(BaseModel):
    """18: public & assisted registration with safety, PMD, grassroots & PDPA."""

    preferred_name: str = Field(min_length=1, max_length=120)
    phone: str
    full_name: str | None = None
    nric_last4: str | None = None
    email: str | None = None
    age_band: str | None = None
    preferred_language: str = "en"
    written_languages: list[str] = Field(default_factory=list)
    spoken_languages: list[str] = Field(default_factory=list)
    home_zone: str | None = None
    home_precinct: str | None = None
    interests: list[str] = Field(default_factory=list)
    availability: list[AvailabilityIn] = Field(default_factory=list)

    # Mobility & PMD (Personal Mobility Device)
    requires_pmd: bool = False
    mobility_aid: str | None = None

    # Health & Safety screening for Kopi Brewing & Workout sessions
    has_health_conditions: bool = False
    health_conditions: list[str] = Field(default_factory=list)
    health_notes: str | None = None

    # Emergency contact (Next-of-Kin)
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relationship: str | None = None

    # Grassroots / Community Volunteering
    is_grassroots_volunteer: bool = False
    grassroots_organisation: str | None = None

    # 19: PDPA & Safety Consents
    consent_participation: bool
    consent_health_safety: bool = True
    consent_whatsapp: bool = False
    consent_photo_media: bool = False

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

    @field_validator("nric_last4")
    @classmethod
    def _valid_nric_last4(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip().upper().replace(" ", "")
        if not cleaned:
            return None
        # Strip leading masking characters if user typed e.g. "XXXX123A" or "Sxxxx123A"
        if len(cleaned) > 4:
            cleaned = cleaned[-4:]
        if not _NRIC_PARTIAL_RE.match(cleaned):
            raise ValueError(
                "Please enter the last 3 digits and letter of your NRIC/FIN (e.g. 123A)"
            )
        return cleaned

    @field_validator("emergency_contact_phone")
    @classmethod
    def _valid_emergency_phone(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        try:
            return normalize_sg_phone(v)
        except InvalidPhoneNumber as exc:
            raise ValueError(f"Emergency contact number: {exc}") from exc

    @field_validator("mobility_aid")
    @classmethod
    def _valid_mobility_aid(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        cleaned = v.strip().lower()
        if cleaned not in MOBILITY_AIDS:
            raise ValueError(f"unknown mobility aid: {cleaned}")
        return cleaned

    @field_validator("health_conditions")
    @classmethod
    def _valid_health_conditions(cls, v: list[str]) -> list[str]:
        unknown = [c for c in v if c not in HEALTH_CONDITIONS]
        if unknown:
            raise ValueError(f"unknown health conditions: {', '.join(unknown)}")
        return list(dict.fromkeys(v))

    @field_validator("consent_participation")
    @classmethod
    def _must_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("participation consent is required to register")
        return v

    @field_validator("consent_health_safety")
    @classmethod
    def _must_consent_safety(cls, v: bool) -> bool:
        if not v:
            raise ValueError("health and safety acknowledgement is required to register")
        return v

    @field_validator("age_band")
    @classmethod
    def _valid_age_band(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            return None
        if cleaned not in AGE_BANDS:
            raise ValueError(f"unknown age band: {cleaned}")
        return cleaned

    @field_validator("written_languages", "spoken_languages")
    @classmethod
    def _valid_languages(cls, v: list[str]) -> list[str]:
        cleaned = [lang.strip().lower() for lang in v if lang and lang.strip()]
        unknown = [lang for lang in cleaned if lang not in LANGUAGE_OPTIONS]
        if unknown:
            raise ValueError(f"unknown languages: {', '.join(unknown)}")
        return list(dict.fromkeys(cleaned))

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
    nric_last4: str | None = None
    phone_e164: str
    email: str | None
    age_band: str | None
    preferred_language: str
    written_languages: list[str] | None = None
    spoken_languages: list[str] | None = None
    home_zone: str | None
    home_precinct: str | None
    requires_pmd: bool = False
    mobility_aid: str | None = None
    has_health_conditions: bool = False
    health_conditions: list[str] | None = None
    health_notes: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relationship: str | None = None
    is_grassroots_volunteer: bool = False
    grassroots_organisation: str | None = None
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
