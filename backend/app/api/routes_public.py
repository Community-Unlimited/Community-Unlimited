"""Public registration.

18: mobile-first, age-friendly data entry, no account complexity, and assisted
registration as a first-class path. A community member never gets a password.
Includes NRIC (last 3 digits + letter), PMD/mobility needs, Kopi Brewing &
Workout health/safety screening, grassroots volunteering affiliation, and PDPA
consent records.
"""

from __future__ import annotations

from datetime import time

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbSession
from app.models import Availability, Consent, Person, PersonInterest, utcnow
from app.schemas import PersonOut, RegistrationRequest, RegistrationResponse, TierOut
from app.services import audit
from app.services.qualification import evaluate_tier

router = APIRouter(prefix="/api", tags=["registration"])


def _parse_hhmm(value: str) -> time:
    hours, _, minutes = value.partition(":")
    return time(int(hours), int(minutes or 0))


def create_person(db: DbSession, payload: RegistrationRequest) -> Person:
    requires_pmd = payload.requires_pmd or payload.mobility_aid == "pmd"
    mobility_aid = payload.mobility_aid or ("pmd" if requires_pmd else "none")
    clean_health_notes = (payload.health_notes or "").strip() or None
    has_health = (
        payload.has_health_conditions
        or bool(payload.health_conditions)
        or bool(clean_health_notes)
    )
    clean_grassroots_org = (payload.grassroots_organisation or "").strip() or None
    is_grassroots = payload.is_grassroots_volunteer or bool(clean_grassroots_org)

    person = Person(
        preferred_name=payload.preferred_name.strip(),
        full_name=(payload.full_name or "").strip() or None,
        nric_last4=payload.nric_last4,
        phone_e164=payload.phone,  # already normalised by the validator
        email=(payload.email or "").strip() or None,
        age_band=payload.age_band,
        preferred_language=payload.preferred_language or "en",
        home_zone=(payload.home_zone or "").strip() or None,
        home_precinct=(payload.home_precinct or "").strip() or None,
        requires_pmd=requires_pmd,
        mobility_aid=mobility_aid,
        has_health_conditions=has_health,
        health_conditions=list(payload.health_conditions) if payload.health_conditions else [],
        health_notes=clean_health_notes,
        emergency_contact_name=(payload.emergency_contact_name or "").strip() or None,
        emergency_contact_phone=payload.emergency_contact_phone,
        emergency_contact_relationship=(
            payload.emergency_contact_relationship or ""
        ).strip()
        or None,
        is_grassroots_volunteer=is_grassroots,
        grassroots_organisation=clean_grassroots_org if is_grassroots else None,
        status="registered",
        registration_source="assisted" if payload.assisted_registration else "self",
        assisted_registration=payload.assisted_registration,
        assisted_by=(payload.assisted_by or "").strip() or None,
    )
    db.add(person)
    db.flush()

    for interest in dict.fromkeys(payload.interests):
        db.add(PersonInterest(person_id=person.id, interest=interest))

    for window in payload.availability:
        db.add(
            Availability(
                person_id=person.id,
                weekday=window.weekday,
                start_time=_parse_hhmm(window.start_time),
                end_time=_parse_hhmm(window.end_time),
            )
        )

    now = utcnow()
    method = "assisted" if payload.assisted_registration else "web_form"
    db.add(
        Consent(
            person_id=person.id,
            consent_type="participation",
            granted=True,
            granted_at=now,
            method=method,
        )
    )
    db.add(
        Consent(
            person_id=person.id,
            consent_type="health_safety_declaration",
            granted=payload.consent_health_safety,
            granted_at=now if payload.consent_health_safety else None,
            method=method,
        )
    )
    db.add(
        Consent(
            person_id=person.id,
            consent_type="whatsapp_messaging",
            granted=payload.consent_whatsapp,
            granted_at=now if payload.consent_whatsapp else None,
            method=method,
        )
    )
    db.add(
        Consent(
            person_id=person.id,
            consent_type="photo_media",
            granted=payload.consent_photo_media,
            granted_at=now if payload.consent_photo_media else None,
            method=method,
        )
    )

    audit.record(
        db,
        action="person.registered",
        entity_type="person",
        entity_id=person.id,
        actor_type="system",
        summary=f"{person.preferred_name} registered",
        detail={
            "source": person.registration_source,
            "assisted": person.assisted_registration,
            "requires_pmd": person.requires_pmd,
            "has_health_conditions": person.has_health_conditions,
            "is_grassroots_volunteer": person.is_grassroots_volunteer,
        },
    )
    return person


@router.post("/register", response_model=RegistrationResponse)
def register(payload: RegistrationRequest, db: DbSession) -> RegistrationResponse:
    existing = db.scalar(select(Person).where(Person.phone_e164 == payload.phone))
    if existing is not None:
        return RegistrationResponse(
            already_registered=True,
            message=(
                "This number is already registered. "
                "Someone from Community Unlimited will be in touch."
            ),
        )

    person = create_person(db, payload)
    db.commit()
    db.refresh(person)

    tier = evaluate_tier(db, person)
    return RegistrationResponse(
        already_registered=False,
        person=PersonOut.model_validate(person),
        tier=TierOut(**tier.as_dict),  # type: ignore[arg-type]
        message=f"Thank you {person.preferred_name}. You are registered.",
    )
