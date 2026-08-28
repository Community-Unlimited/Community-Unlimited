"""Event scheduling, enrollment, attendance and qualification approval."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.deps import CurrentStaff, DbSession
from app.models import (
    Enrollment,
    EventAcknowledgment,
    Module,
    Pathway,
    Person,
    Qualification,
    ScheduledEvent,
    utcnow,
)
from app.models.academy import SEAT_HOLDING_STATUSES
from app.schemas import (
    ApproveQualificationRequest,
    AttendanceMark,
    EnrollmentOut,
    EnrollRequest,
    EventCreate,
    EventOut,
    EventUpdate,
    InviteRequest,
)
from app.services import audit, qualification as qual_service
from app.services.calendar import SG_PUBLIC_HOLIDAYS, SGT
from app.whatsapp import outbox

router = APIRouter(prefix="/api", tags=["academy"])


def _event_out(db: DbSession, event: ScheduledEvent) -> EventOut:
    acks = dict(
        db.execute(
            select(EventAcknowledgment.response, func.count(EventAcknowledgment.id))
            .where(EventAcknowledgment.event_id == event.id)
            .group_by(EventAcknowledgment.response)
        ).all()
    )
    invited = db.scalar(
        select(func.count(Enrollment.id)).where(Enrollment.event_id == event.id)
    ) or 0
    replied = sum(acks.values())

    out = EventOut.model_validate(event)
    out.module_code = event.module.code if event.module else None
    out.seats_taken = event.seats_taken
    out.seats_available = event.seats_available
    out.acknowledged_yes = acks.get("yes", 0)
    out.acknowledged_no = acks.get("no", 0)
    out.acknowledged_maybe = acks.get("maybe", 0)
    out.awaiting_reply = max(0, invited - replied)
    return out


# --------------------------------------------------------------------------
# modules
# --------------------------------------------------------------------------


@router.get("/modules")
def list_modules(db: DbSession, _user: CurrentStaff) -> list[dict[str, object]]:
    modules = db.scalars(
        select(Module).join(Pathway).order_by(Module.sequence)
    )
    return [
        {
            "id": m.id,
            "code": m.code,
            "name": m.name,
            "sequence": m.sequence,
            "kind": m.kind,
            "required_for_deployment": m.required_for_deployment,
            "display_title": m.display_title,
            "default_capacity": m.default_capacity,
        }
        for m in modules
    ]


# --------------------------------------------------------------------------
# events
# --------------------------------------------------------------------------


@router.get("/events", response_model=list[EventOut])
def list_events(
    db: DbSession,
    _user: CurrentStaff,
    kind: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    upcoming_only: bool = False,
    limit: int = Query(default=200, le=1000),
) -> list[EventOut]:
    stmt = select(ScheduledEvent).order_by(ScheduledEvent.starts_at)
    if kind:
        stmt = stmt.where(ScheduledEvent.kind == kind)
    if status_filter:
        stmt = stmt.where(ScheduledEvent.status == status_filter)
    if upcoming_only:
        stmt = stmt.where(ScheduledEvent.starts_at >= utcnow())
    return [_event_out(db, e) for e in db.scalars(stmt.limit(limit))]


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, db: DbSession, user: CurrentStaff) -> EventOut:
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=422, detail="ends_at must be after starts_at")

    module = None
    if payload.module_code:
        module = db.scalar(
            select(Module).where(Module.code == payload.module_code.upper())
        )
        if module is None:
            raise HTTPException(
                status_code=422, detail=f"unknown module {payload.module_code}"
            )

    # 5.1 LOCKED: no training on public holidays. Refuse rather than warn later.
    local_date = payload.starts_at.astimezone(SGT).date()
    if payload.kind == "training" and local_date in SG_PUBLIC_HOLIDAYS:
        raise HTTPException(
            status_code=422,
            detail=f"{local_date:%d %b %Y} is a public holiday - no training is scheduled",
        )

    event = ScheduledEvent(
        kind=payload.kind,
        module_id=module.id if module else None,
        title=payload.title,
        venue=payload.venue,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        capacity=payload.capacity,
        status="open",
        assessment_required=payload.assessment_required
        or (module.assessment_required if module else False),
        notes=payload.notes,
        trainer_id=user.id,
    )
    db.add(event)
    audit.record(
        db,
        action="event.created",
        entity_type="scheduled_event",
        actor=user,
        summary=f"created {payload.kind} event {payload.title!r}",
    )
    db.commit()
    db.refresh(event)
    return _event_out(db, event)


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: int, payload: EventUpdate, db: DbSession, user: CurrentStaff
) -> EventOut:
    event = db.get(ScheduledEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if isinstance(value, datetime) and value.tzinfo is None:
            raise HTTPException(
                status_code=422, detail=f"{field} needs a timezone offset"
            )
        setattr(event, field, value)

    if event.ends_at <= event.starts_at:
        raise HTTPException(status_code=422, detail="ends_at must be after starts_at")

    audit.record(
        db,
        action="event.updated",
        entity_type="scheduled_event",
        entity_id=event.id,
        actor=user,
        detail=payload.model_dump(exclude_unset=True, mode="json"),
    )
    db.commit()
    db.refresh(event)
    return _event_out(db, event)


@router.get("/events/{event_id}/enrollments", response_model=list[EnrollmentOut])
def list_enrollments(
    event_id: int, db: DbSession, _user: CurrentStaff
) -> list[EnrollmentOut]:
    event = db.get(ScheduledEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    out: list[EnrollmentOut] = []
    for enrollment in event.enrollments:
        item = EnrollmentOut.model_validate(enrollment)
        item.preferred_name = enrollment.person.preferred_name
        out.append(item)
    return out


@router.post("/events/{event_id}/enroll", response_model=EnrollmentOut)
def enroll(
    event_id: int, payload: EnrollRequest, db: DbSession, user: CurrentStaff
) -> EnrollmentOut:
    event = db.get(ScheduledEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    person = db.get(Person, payload.person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="person not found")
    if event.status == "cancelled":
        raise HTTPException(status_code=409, detail="event is cancelled")

    existing = db.scalar(
        select(Enrollment).where(
            Enrollment.event_id == event_id, Enrollment.person_id == person.id
        )
    )
    if existing is not None:
        item = EnrollmentOut.model_validate(existing)
        item.preferred_name = person.preferred_name
        return item

    # 5.2 LOCKED capacity. Over-capacity requests go to the waitlist rather
    # than being silently accepted.
    waitlisted = event.seats_taken >= event.capacity
    enrollment = Enrollment(
        event_id=event_id,
        person_id=person.id,
        status="waitlisted" if waitlisted else "registered",
        source=payload.source,
    )
    db.add(enrollment)
    if not waitlisted and event.seats_taken + 1 >= event.capacity:
        event.status = "full"
    db.commit()
    db.refresh(enrollment)

    item = EnrollmentOut.model_validate(enrollment)
    item.preferred_name = person.preferred_name
    return item


@router.post("/events/{event_id}/attendance", response_model=EnrollmentOut)
def mark_attendance(
    event_id: int, payload: AttendanceMark, db: DbSession, user: CurrentStaff
) -> EnrollmentOut:
    """Mark attendance and, for a passed training module, record completion.

    Completion starts as ``pending_approval`` - 11.3 requires a human to
    approve before it counts toward deployability.
    """
    enrollment = db.scalar(
        select(Enrollment).where(
            Enrollment.event_id == event_id, Enrollment.person_id == payload.person_id
        )
    )
    if enrollment is None:
        raise HTTPException(status_code=404, detail="enrollment not found")

    event = enrollment.event
    enrollment.marked_by_id = user.id

    if not payload.attended:
        enrollment.status = "no_show"
        enrollment.attended_at = None
    else:
        enrollment.attended_at = utcnow()
        outcome = payload.assessment_outcome or (
            "not_required" if not event.assessment_required else None
        )
        enrollment.assessment_outcome = outcome

        if event.assessment_required and outcome is None:
            raise HTTPException(
                status_code=422,
                detail="this session requires an assessment outcome (pass/fail)",
            )

        if outcome == "fail":
            enrollment.status = "requires_reassessment"
        else:
            enrollment.status = "completed"
            if event.module is not None:
                qual_service.record_completion(
                    db, enrollment.person, event.module, assessed_by=user
                )

    audit.record(
        db,
        action="attendance.marked",
        entity_type="enrollment",
        entity_id=enrollment.id,
        actor=user,
        summary=f"{enrollment.person.preferred_name}: {enrollment.status}",
    )
    db.commit()
    db.refresh(enrollment)

    item = EnrollmentOut.model_validate(enrollment)
    item.preferred_name = enrollment.person.preferred_name
    return item


@router.post("/events/{event_id}/invite")
def invite(
    event_id: int, payload: InviteRequest, db: DbSession, user: CurrentStaff
) -> dict[str, object]:
    """Queue WhatsApp invites for an event.

    Only people who granted WhatsApp messaging consent are messaged.
    """
    event = db.get(ScheduledEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")

    if payload.person_ids:
        people = list(
            db.scalars(select(Person).where(Person.id.in_(payload.person_ids)))
        )
    else:
        people = [e.person for e in event.enrollments]

    queued = skipped_no_consent = 0
    for person in people:
        consented = any(
            c.consent_type == "whatsapp_messaging" and c.granted
            for c in person.consents
        )
        if not consented:
            skipped_no_consent += 1
            continue
        if outbox.queue_event_invite(db, event, person) is not None:
            queued += 1

    audit.record(
        db,
        action="event.invited",
        entity_type="scheduled_event",
        entity_id=event.id,
        actor=user,
        summary=f"queued {queued} invite(s)",
    )
    db.commit()

    result: dict[str, object] = {
        "queued": queued,
        "skipped_no_consent": skipped_no_consent,
        "considered": len(people),
    }
    if payload.send_now:
        result["flush"] = outbox.flush(db)
    return result


# --------------------------------------------------------------------------
# qualification approval
# --------------------------------------------------------------------------


@router.get("/qualifications/pending")
def pending_qualifications(db: DbSession, _user: CurrentStaff) -> list[dict[str, object]]:
    rows = db.scalars(
        select(Qualification).where(Qualification.status == "pending_approval")
    )
    return [
        {
            "qualification_id": q.id,
            "person_id": q.person_id,
            "preferred_name": q.person.preferred_name,
            "module_code": q.module.code,
            "module_name": q.module.name,
            "achieved_at": q.achieved_at.isoformat() if q.achieved_at else None,
        }
        for q in rows
    ]


@router.post("/qualifications/approve")
def approve_qualification(
    payload: ApproveQualificationRequest, db: DbSession, user: CurrentStaff
) -> dict[str, object]:
    module = db.scalar(select(Module).where(Module.code == payload.module_code.upper()))
    if module is None:
        raise HTTPException(status_code=404, detail="module not found")
    person = db.get(Person, payload.person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="person not found")

    record = db.scalar(
        select(Qualification).where(
            Qualification.person_id == person.id, Qualification.module_id == module.id
        )
    )
    if record is None:
        if not payload.is_override:
            raise HTTPException(
                status_code=404,
                detail="no completion recorded - use is_override with a reason to award anyway",
            )
        record = qual_service.record_completion(db, person, module, assessed_by=user)
        db.flush()

    try:
        qual_service.approve(
            db, record, user, is_override=payload.is_override, reason=payload.reason
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.commit()
    tier = qual_service.evaluate_tier(db, person)
    return {"approved": True, "tier": tier.as_dict}
