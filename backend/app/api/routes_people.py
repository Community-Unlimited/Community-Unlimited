"""People and their tiers."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select

from app.api.routes_public import create_person
from app.deps import CurrentStaff, DbSession
from app.models import Person
from app.schemas import (
    PersonDetailOut,
    PersonOut,
    RegistrationRequest,
    TierOut,
)
from app.services.launch_control import deployable_person_ids
from app.services.qualification import evaluate_tier

router = APIRouter(prefix="/api/people", tags=["people"])


@router.get("", response_model=list[PersonDetailOut])
def list_people(
    db: DbSession,
    _user: CurrentStaff,
    search: str | None = None,
    deployable: bool | None = None,
    missing_module: str | None = Query(
        default=None,
        description="Return only people missing this module code, e.g. CB4. "
        "Answers 27.2: 'who is missing only one CB module?'",
    ),
    limit: int = Query(default=200, le=1000),
) -> list[PersonDetailOut]:
    stmt = select(Person).order_by(Person.preferred_name)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Person.preferred_name.ilike(pattern),
                Person.full_name.ilike(pattern),
                Person.phone_e164.ilike(pattern),
            )
        )

    people = list(db.scalars(stmt.limit(limit)))
    deployable_ids = deployable_person_ids(db) if deployable is not None else set()

    out: list[PersonDetailOut] = []
    for person in people:
        if deployable is not None and (person.id in deployable_ids) != deployable:
            continue
        tier = evaluate_tier(db, person)
        if missing_module and missing_module.upper() not in tier.core_missing:
            continue
        detail = PersonDetailOut.model_validate(person)
        detail.tier = TierOut(**tier.as_dict)  # type: ignore[arg-type]
        out.append(detail)
    return out


@router.get("/{person_id}", response_model=PersonDetailOut)
def get_person(person_id: int, db: DbSession, _user: CurrentStaff) -> PersonDetailOut:
    person = db.get(Person, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="person not found")
    detail = PersonDetailOut.model_validate(person)
    detail.tier = TierOut(**evaluate_tier(db, person).as_dict)  # type: ignore[arg-type]
    return detail


@router.post("", response_model=PersonDetailOut, status_code=status.HTTP_201_CREATED)
def register_on_behalf(
    payload: RegistrationRequest, db: DbSession, user: CurrentStaff
) -> PersonDetailOut:
    """18: assisted registration - staff registering someone who is present."""
    existing = db.scalar(select(Person).where(Person.phone_e164 == payload.phone))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{payload.phone} is already registered (person {existing.id})",
        )
    payload.assisted_registration = True
    payload.assisted_by = payload.assisted_by or user.full_name
    person = create_person(db, payload)
    db.commit()
    db.refresh(person)

    detail = PersonDetailOut.model_validate(person)
    detail.tier = TierOut(**evaluate_tier(db, person).as_dict)  # type: ignore[arg-type]
    return detail


@router.patch("/{person_id}/disciple", response_model=PersonDetailOut)
def set_disciple_status(
    person_id: int,
    db: DbSession,
    _user: CurrentStaff,
    disciple_status: str | None = None,
    target_next_level: str | None = None,
) -> PersonDetailOut:
    """4.2: Disciple is a parallel development status, not a CB level."""
    person = db.get(Person, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="person not found")
    person.disciple_status = disciple_status
    person.target_next_level = target_next_level
    db.commit()
    db.refresh(person)

    detail = PersonDetailOut.model_validate(person)
    detail.tier = TierOut(**evaluate_tier(db, person).as_dict)  # type: ignore[arg-type]
    return detail


@router.get("-summary/pipeline")
def pipeline_summary(db: DbSession, _user: CurrentStaff) -> dict[str, object]:
    """16 View 3: the funnel, plus the non-linear 'missing module' cut."""
    people = list(db.scalars(select(Person)))
    counts: dict[str, int] = {}
    missing_one: list[dict[str, object]] = []

    for person in people:
        tier = evaluate_tier(db, person)
        for code in tier.core_completed:
            counts[code] = counts.get(code, 0) + 1
        for code in tier.leadership_held:
            counts[code] = counts.get(code, 0) + 1
        if len(tier.core_missing) == 1:
            missing_one.append(
                {
                    "person_id": person.id,
                    "preferred_name": person.preferred_name,
                    "missing": tier.core_missing[0],
                }
            )

    return {
        "registered": len(people),
        "by_module": counts,
        "deployable": len(deployable_person_ids(db)),
        "missing_exactly_one_module": missing_one,
        "disciples": sum(1 for p in people if p.disciple_status),
    }
