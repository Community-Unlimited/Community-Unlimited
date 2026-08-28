"""Public registration.

18: mobile-first, minimal data entry, no account complexity, and assisted
registration as a first-class path. A community member never gets a password.
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
    person = Person(
        preferred_name=payload.preferred_name.strip(),
        full_name=(payload.full_name or "").strip() or None,
        phone_e164=payload.phone,  # already normalised by the validator
        email=(payload.email or "").strip() or None,
        age_band=payload.age_band,
        preferred_language=payload.preferred_language or "en",
        home_zone=payload.home_zone,
        home_precinct=payload.home_precinct,
        status="registered",
        registration_source="assisted" if payload.assisted_registration else "self",
        assisted_registration=payload.assisted_registration,
        assisted_by=payload.assisted_by,
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
    db.add(
        Consent(
            person_id=person.id,
            consent_type="participation",
            granted=True,
            granted_at=now,
            method="assisted" if payload.assisted_registration else "web_form",
        )
    )
    db.add(
        Consent(
            person_id=person.id,
            consent_type="whatsapp_messaging",
            granted=payload.consent_whatsapp,
            granted_at=now if payload.consent_whatsapp else None,
            method="assisted" if payload.assisted_registration else "web_form",
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
