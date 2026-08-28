"""Launch Control - the challenge function.

15: "Its role is not to cheerlead. Its role is to ask: does the plan actually
work?" Every finding below is computed from live data plus the locked calendar
rules. Nothing is asserted, so changing a rule changes the verdict.

Severity is red / amber / green. The frontend maps those onto accessible
status tokens - the raw brand greens and ambers fail WCAG on white, so the
colour decision lives in the design system, not here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Asset,
    Enrollment,
    Module,
    Pathway,
    Person,
    Qualification,
    ScheduledEvent,
    Shift,
    utcnow,
)
from app.models.academy import SEAT_HOLDING_STATUSES
from app.models.roster import SHIFT_ROLES
from app.services.calendar import (
    FULL_ROLLOUT_TARGET,
    MODULES_REQUIRED_FOR_DEPLOYMENT,
    SG_PUBLIC_HOLIDAYS,
    TARGET_ASSET_COUNT,
    TARGET_DEPLOYABLE_PEOPLE,
    calendar_capacity,
    generate_training_slots,
)
from app.services.qualification import COMMUNITY_BARISTA

# 3.3 LOCKED: one leader + one operator, every day, at every asset.
DAYS_PER_WEEK = 7
LEADER_ROLE = "team_leader"


@dataclass(frozen=True, slots=True)
class Finding:
    code: str
    severity: str  # red | amber | green
    title: str
    detail: str
    metrics: dict[str, object] = field(default_factory=dict)

    @property
    def as_dict(self) -> dict[str, object]:
        return {
            "code": self.code,
            "severity": self.severity,
            "title": self.title,
            "detail": self.detail,
            "metrics": self.metrics,
        }


@dataclass(frozen=True, slots=True)
class LaunchControlReport:
    generated_at: str
    headline: dict[str, object]
    findings: list[Finding]

    @property
    def as_dict(self) -> dict[str, object]:
        return {
            "generated_at": self.generated_at,
            "headline": self.headline,
            "findings": [f.as_dict for f in self.findings],
            "worst_severity": self.worst_severity,
        }

    @property
    def worst_severity(self) -> str:
        for level in ("red", "amber", "green"):
            if any(f.severity == level for f in self.findings):
                return level
        return "green"


# --------------------------------------------------------------------------
# building blocks
# --------------------------------------------------------------------------


def _core_module_ids(db: Session, pathway_code: str = COMMUNITY_BARISTA) -> set[int]:
    return set(
        db.scalars(
            select(Module.id)
            .join(Pathway)
            .where(Pathway.code == pathway_code, Module.required_for_deployment.is_(True))
        )
    )


def _effective_qualification_rows(db: Session, module_ids: set[int]):
    if not module_ids:
        return []
    now = utcnow()
    return db.execute(
        select(Qualification.person_id, Qualification.module_id).where(
            Qualification.status == "approved",
            Qualification.module_id.in_(module_ids),
            or_(Qualification.expires_at.is_(None), Qualification.expires_at > now),
        )
    ).all()


def deployable_person_ids(db: Session) -> set[int]:
    """People holding every core module, approved and unexpired."""
    core_ids = _core_module_ids(db)
    if not core_ids:
        return set()
    held: dict[int, set[int]] = {}
    for person_id, module_id in _effective_qualification_rows(db, core_ids):
        held.setdefault(person_id, set()).add(module_id)
    return {pid for pid, mods in held.items() if mods >= core_ids}


def leader_qualified_person_ids(db: Session, code: str = "CB5") -> set[int]:
    module_ids = set(
        db.scalars(
            select(Module.id).join(Pathway).where(
                Pathway.code == COMMUNITY_BARISTA, Module.code == code
            )
        )
    )
    return {pid for pid, _ in _effective_qualification_rows(db, module_ids)}


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------


def check_training_capacity(db: Session) -> Finding:
    """5.3 / 15 - the headline contradiction, derived rather than stated."""
    capacity = calendar_capacity()
    demand = TARGET_DEPLOYABLE_PEOPLE * MODULES_REQUIRED_FOR_DEPLOYMENT
    gap = demand - capacity.total_learner_seats

    seats_taken = (
        db.scalar(
            select(func.count(Enrollment.id))
            .join(ScheduledEvent, Enrollment.event_id == ScheduledEvent.id)
            .where(
                ScheduledEvent.kind == "training",
                Enrollment.status.in_(SEAT_HOLDING_STATUSES),
            )
        )
        or 0
    )

    metrics = {
        **capacity.as_dict,
        "target_people": TARGET_DEPLOYABLE_PEOPLE,
        "learner_seats_required": demand,
        "learner_seat_gap": gap,
        "seats_already_taken": seats_taken,
        "seats_remaining": capacity.total_learner_seats - seats_taken,
    }

    if gap > 0:
        return Finding(
            code="training_capacity",
            severity="red",
            title="Training capacity intervention required",
            detail=(
                f"{TARGET_DEPLOYABLE_PEOPLE} people x "
                f"{MODULES_REQUIRED_FOR_DEPLOYMENT} modules = {demand} learner-seats "
                f"required, but the locked calendar yields {capacity.total_slots} slots "
                f"x {capacity.seats_per_slot} = {capacity.total_learner_seats}. "
                f"Short by {gap}. Under one class per slot the ceiling is "
                f"{capacity.max_people_completing_pathway} people completing CB1-CB4."
            ),
            metrics=metrics,
        )
    return Finding(
        code="training_capacity",
        severity="green",
        title="Training capacity sufficient",
        detail=(
            f"{capacity.total_learner_seats} learner-seats available against "
            f"{demand} required."
        ),
        metrics=metrics,
    )


def check_leader_coverage(db: Session) -> Finding:
    """7 - a network can have 300 baristas and still fail on leaders."""
    live_assets = db.scalar(
        select(func.count(Asset.id)).where(Asset.status == "live")
    ) or 0
    leaders = len(leader_qualified_person_ids(db))

    duties_at_full_rollout = TARGET_ASSET_COUNT * DAYS_PER_WEEK
    duties_now = live_assets * DAYS_PER_WEEK

    metrics = {
        "cb5_qualified_people": leaders,
        "live_assets": live_assets,
        "leader_duties_per_week_now": duties_now,
        "leader_duties_per_week_at_full_rollout": duties_at_full_rollout,
        "shortfall_at_full_rollout": max(0, duties_at_full_rollout - leaders),
    }

    if leaders < duties_at_full_rollout:
        severity = "red" if leaders < duties_now or leaders == 0 else "amber"
        return Finding(
            code="leader_coverage",
            severity=severity,
            title="Team-leader coverage below full-rollout requirement",
            detail=(
                f"{TARGET_ASSET_COUNT} assets x {DAYS_PER_WEEK} days = "
                f"{duties_at_full_rollout} team-leader duties per week at full "
                f"rollout. {leaders} people currently hold CB5. If each leader "
                f"takes one shift a week, {duties_at_full_rollout - leaders} duties "
                "are uncovered."
            ),
            metrics=metrics,
        )
    return Finding(
        code="leader_coverage",
        severity="green",
        title="Team-leader coverage sufficient",
        detail=f"{leaders} CB5-qualified people against {duties_at_full_rollout} weekly duties.",
        metrics=metrics,
    )


def check_deployable_progress(db: Session) -> Finding:
    deployable = len(deployable_person_ids(db))
    registered = db.scalar(select(func.count(Person.id))) or 0
    pct = round(deployable / TARGET_DEPLOYABLE_PEOPLE * 100, 1) if TARGET_DEPLOYABLE_PEOPLE else 0.0
    metrics = {
        "deployable": deployable,
        "registered": registered,
        "target": TARGET_DEPLOYABLE_PEOPLE,
        "percent_of_target": pct,
        "shortfall": max(0, TARGET_DEPLOYABLE_PEOPLE - deployable),
    }
    severity = "green" if deployable >= TARGET_DEPLOYABLE_PEOPLE else (
        "amber" if deployable else "red"
    )
    return Finding(
        code="deployable_progress",
        severity=severity,
        title=f"{deployable} of {TARGET_DEPLOYABLE_PEOPLE} deployment-ready",
        detail=(
            f"{registered} people registered; {deployable} hold all four core "
            f"modules approved ({pct}% of the CNY 2027 target)."
        ),
        metrics=metrics,
    )


def check_asset_rollout(db: Session) -> Finding:
    assets = list(db.scalars(select(Asset)))
    live = [a for a in assets if a.status == "live"]
    ready = [a for a in assets if a.is_ready_to_launch and a.status != "live"]
    blocked = [a for a in assets if a.blockers and a.status not in ("live", "retired")]

    days_left = (FULL_ROLLOUT_TARGET - date.today()).days
    metrics = {
        "assets_total": len(assets),
        "assets_live": len(live),
        "assets_ready_not_live": len(ready),
        "assets_blocked": len(blocked),
        "target_assets": TARGET_ASSET_COUNT,
        "rollout_deadline": FULL_ROLLOUT_TARGET.isoformat(),
        "days_to_deadline": days_left,
    }
    severity = "green" if len(live) >= TARGET_ASSET_COUNT else ("amber" if live else "red")
    return Finding(
        code="asset_rollout",
        severity=severity,
        title=f"{len(live)} of {TARGET_ASSET_COUNT} assets live",
        detail=(
            f"{len(ready)} sites pass all 12 readiness gates but are not live; "
            f"{len(blocked)} have open blockers. "
            f"{days_left} days to the {FULL_ROLLOUT_TARGET:%d %b %Y} rollout target."
        ),
        metrics=metrics,
    )


def check_class_capacity(db: Session) -> Finding | None:
    """15 - "class over capacity" contradiction."""
    over: list[dict[str, object]] = []
    for event in db.scalars(
        select(ScheduledEvent).where(ScheduledEvent.status != "cancelled")
    ):
        if event.seats_taken > event.capacity:
            over.append(
                {
                    "event_id": event.id,
                    "title": event.title,
                    "capacity": event.capacity,
                    "booked": event.seats_taken,
                }
            )
    if not over:
        return None
    return Finding(
        code="class_over_capacity",
        severity="red",
        title=f"{len(over)} session(s) over capacity",
        detail="A session has more seat-holding enrollments than its capacity allows.",
        metrics={"sessions": over},
    )


def check_holiday_conflicts(db: Session) -> Finding | None:
    """5.1 LOCKED - no training on public holidays."""
    from app.services.calendar import SGT

    clashes: list[dict[str, object]] = []
    for event in db.scalars(
        select(ScheduledEvent).where(
            ScheduledEvent.kind == "training", ScheduledEvent.status != "cancelled"
        )
    ):
        local_date = event.starts_at.astimezone(SGT).date()
        if local_date in SG_PUBLIC_HOLIDAYS:
            clashes.append(
                {
                    "event_id": event.id,
                    "title": event.title,
                    "date": local_date.isoformat(),
                }
            )
    if not clashes:
        return None
    return Finding(
        code="holiday_conflict",
        severity="red",
        title=f"{len(clashes)} training session(s) on a public holiday",
        detail="Section 5.1 locks no training on public holidays.",
        metrics={"sessions": clashes},
    )


def check_uncovered_shifts(db: Session, horizon_days: int = 14) -> Finding | None:
    today = date.today()
    horizon = today + timedelta(days=horizon_days)
    uncovered: list[dict[str, object]] = []

    for shift in db.scalars(
        select(Shift).where(
            Shift.service_date >= today,
            Shift.service_date <= horizon,
            Shift.status != "cancelled",
        )
    ):
        missing = shift.uncovered_roles
        if missing:
            uncovered.append(
                {
                    "shift_id": shift.id,
                    "asset_id": shift.asset_id,
                    "date": shift.service_date.isoformat(),
                    "missing_roles": missing,
                }
            )
    if not uncovered:
        return None

    missing_leaders = sum(
        1 for u in uncovered if LEADER_ROLE in u["missing_roles"]  # type: ignore[operator]
    )
    return Finding(
        code="uncovered_shifts",
        severity="red" if missing_leaders else "amber",
        title=f"{len(uncovered)} uncovered shift(s) in the next {horizon_days} days",
        detail=(
            f"{missing_leaders} are missing a team leader. Each shift needs "
            f"{' + '.join(SHIFT_ROLES)}."
        ),
        metrics={"horizon_days": horizon_days, "shifts": uncovered[:50]},
    )


def check_assets_ready_without_leaders(db: Session) -> Finding | None:
    """15 - "asset ready but no CB5 coverage"."""
    leaders = len(leader_qualified_person_ids(db))
    if leaders:
        return None
    ready = list(
        db.scalars(select(Asset).where(Asset.status.in_(("ready", "preparing", "live"))))
    )
    if not ready:
        return None
    return Finding(
        code="ready_without_leaders",
        severity="red",
        title="Sites progressing with no CB5-qualified leader anywhere",
        detail=(
            f"{len(ready)} site(s) are preparing, ready or live but nobody holds "
            "CB5 Team Leader training, so no compliant shift can be staffed."
        ),
        metrics={"assets": [a.code for a in ready], "cb5_qualified_people": leaders},
    )


# --------------------------------------------------------------------------
# report
# --------------------------------------------------------------------------


def run(db: Session) -> LaunchControlReport:
    findings: list[Finding] = [
        check_training_capacity(db),
        check_deployable_progress(db),
        check_leader_coverage(db),
        check_asset_rollout(db),
    ]
    for optional in (
        check_class_capacity(db),
        check_holiday_conflicts(db),
        check_uncovered_shifts(db),
        check_assets_ready_without_leaders(db),
    ):
        if optional is not None:
            findings.append(optional)

    severity_rank = {"red": 0, "amber": 1, "green": 2}
    findings.sort(key=lambda f: severity_rank.get(f.severity, 3))

    capacity = calendar_capacity()
    by_code = {f.code: f for f in findings}
    headline = {
        "deployable": by_code["deployable_progress"].metrics["deployable"],
        "deployable_target": TARGET_DEPLOYABLE_PEOPLE,
        "registered": by_code["deployable_progress"].metrics["registered"],
        "cb5_leaders": by_code["leader_coverage"].metrics["cb5_qualified_people"],
        "leader_duties_per_week": by_code["leader_coverage"].metrics[
            "leader_duties_per_week_at_full_rollout"
        ],
        "assets_live": by_code["asset_rollout"].metrics["assets_live"],
        "assets_target": TARGET_ASSET_COUNT,
        "training_slots": capacity.total_slots,
        "learner_seats_total": capacity.total_learner_seats,
        "learner_seats_remaining": by_code["training_capacity"].metrics[
            "seats_remaining"
        ],
        "learner_seat_gap": by_code["training_capacity"].metrics["learner_seat_gap"],
        "red_findings": sum(1 for f in findings if f.severity == "red"),
        "amber_findings": sum(1 for f in findings if f.severity == "amber"),
    }

    return LaunchControlReport(
        generated_at=utcnow().isoformat(),
        headline=headline,
        findings=findings,
    )
