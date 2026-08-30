"""The qualification rule engine - a person's tier / level.

4.1 LOCKED:  deployable Community Barista = CB1 AND CB2 AND CB3 AND CB4.
4.1 LOCKED:  the four modules need not be consecutive sessions.
11.3:        the machine computes readiness; a human awards the qualification.
4.3:         permission logic keys off the module *code*. ``tier_label`` is a
             display string and must never be used to decide what someone may
             do - the public naming ladder is still unconfirmed.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Module, Pathway, Person, Qualification, StaffUser, utcnow
from app.services import audit

COMMUNITY_BARISTA = "community_barista"


@dataclass(frozen=True, slots=True)
class TierStatus:
    """Everything the UI needs to show where a person stands."""

    person_id: int
    core_completed: list[str] = field(default_factory=list)
    core_missing: list[str] = field(default_factory=list)
    leadership_held: list[str] = field(default_factory=list)
    pending_approval: list[str] = field(default_factory=list)
    highest_qualification: str | None = None
    deployable: bool = False
    can_lead: bool = False
    tier_label: str = "Registered"
    disciple_status: str | None = None
    next_module: str | None = None

    @property
    def as_dict(self) -> dict[str, object]:
        return {
            "person_id": self.person_id,
            "core_completed": self.core_completed,
            "core_missing": self.core_missing,
            "leadership_held": self.leadership_held,
            "pending_approval": self.pending_approval,
            "highest_qualification": self.highest_qualification,
            "deployable": self.deployable,
            "can_lead": self.can_lead,
            "tier_label": self.tier_label,
            "disciple_status": self.disciple_status,
            "next_module": self.next_module,
        }


def _tier_label(core_done: int, core_total: int, leadership: list[str]) -> str:
    """Display only. Never branch on this."""
    if leadership:
        highest = sorted(leadership)[-1]
        return {
            "CB5": "Team Leader",
            "CB6": "Precinct Leader",
            "CB7": "Zone Leader",
        }.get(highest, highest)
    if core_total and core_done >= core_total:
        return "Deployable Community Barista"
    if core_done:
        return f"In training ({core_done} of {core_total})"
    return "Registered"


def evaluate_tier(
    db: Session, person: Person, pathway_code: str = COMMUNITY_BARISTA
) -> TierStatus:
    """Compute a person's current tier from their approved qualifications."""
    modules = list(
        db.scalars(
            select(Module)
            .join(Pathway)
            .where(Pathway.code == pathway_code)
            .order_by(Module.sequence)
        )
    )
    core = [m for m in modules if m.required_for_deployment]
    by_id = {m.id: m for m in modules}

    quals = list(
        db.scalars(select(Qualification).where(Qualification.person_id == person.id))
    )

    effective_codes: set[str] = set()
    pending: list[str] = []
    for q in quals:
        module = by_id.get(q.module_id)
        if module is None:
            continue
        if q.is_effective:
            effective_codes.add(module.code)
        elif q.status == "pending_approval":
            pending.append(module.code)

    core_codes = [m.code for m in core]
    core_completed = [c for c in core_codes if c in effective_codes]
    core_missing = [c for c in core_codes if c not in effective_codes]
    leadership_held = sorted(
        m.code for m in modules if m.kind == "leadership" and m.code in effective_codes
    )

    deployable = bool(core_codes) and not core_missing
    highest = sorted(effective_codes)[-1] if effective_codes else None

    # What to do next: finish the core first, then the next leadership rung.
    next_module: str | None = None
    if core_missing:
        next_module = core_missing[0]
    elif deployable:
        remaining_leadership = [
            m.code
            for m in modules
            if m.kind == "leadership" and m.code not in effective_codes
        ]
        next_module = remaining_leadership[0] if remaining_leadership else None

    return TierStatus(
        person_id=person.id,
        core_completed=core_completed,
        core_missing=core_missing,
        leadership_held=leadership_held,
        pending_approval=sorted(pending),
        highest_qualification=highest,
        deployable=deployable,
        # 7: leading a cafe shift requires CB5 Team Leader training.
        can_lead="CB5" in effective_codes,
        tier_label=_tier_label(len(core_completed), len(core_codes), leadership_held),
        disciple_status=person.disciple_status,
        next_module=next_module,
    )


def record_completion(
    db: Session,
    person: Person,
    module: Module,
    *,
    assessed_by: StaffUser | None = None,
) -> Qualification:
    """Register that a person finished a module. Starts as pending approval.

    This never awards the qualification. 11.3 and 17.2 both require a human to
    approve before it counts toward deployability.
    """
    existing = db.scalar(
        select(Qualification).where(
            Qualification.person_id == person.id,
            Qualification.module_id == module.id,
        )
    )
    if existing is not None:
        if existing.status == "revoked":
            existing.status = "pending_approval"
            existing.achieved_at = utcnow()
        return existing

    qualification = Qualification(
        person_id=person.id,
        module_id=module.id,
        status="pending_approval",
        achieved_at=utcnow(),
    )
    db.add(qualification)
    audit.record(
        db,
        action="qualification.completed",
        entity_type="qualification",
        actor=assessed_by,
        summary=f"{person.preferred_name} completed {module.code}",
        detail={"person_id": person.id, "module": module.code},
    )
    return qualification


def approve(
    db: Session,
    qualification: Qualification,
    approver: StaffUser,
    *,
    is_override: bool = False,
    reason: str | None = None,
) -> Qualification:
    """Human approval. An override without a reason is refused.

    11.3: any override must record who approved it, why, when, and any expiry.
    """
    if is_override and not (reason and reason.strip()):
        raise ValueError("an override requires a written reason")

    qualification.status = "approved"
    qualification.approved_by_id = approver.id
    qualification.approved_at = utcnow()
    qualification.is_override = is_override
    qualification.override_reason = reason

    audit.record(
        db,
        action="qualification.override" if is_override else "qualification.approved",
        entity_type="qualification",
        entity_id=qualification.id,
        actor=approver,
        summary=(
            f"{'OVERRIDE: ' if is_override else ''}approved qualification "
            f"{qualification.id}"
        ),
        detail={
            "person_id": qualification.person_id,
            "module_id": qualification.module_id,
            "is_override": is_override,
            "reason": reason,
        },
    )
    return qualification
