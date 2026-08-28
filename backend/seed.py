"""Seed reference data.

    python seed.py                 # reference data only
    python seed.py --demo          # + clearly-fake people to populate the dashboard
    python seed.py --no-calendar   # skip generating the 72 training slots

Idempotent: safe to re-run. Reference data is upserted by code, never duplicated.

Section 2.2 is explicit that the authoritative list of 17 Boon Lay assets does
not exist yet, so this seeds 17 *placeholders* with no invented site names or
addresses. The six candidate Kopi Corner locations named in the March 2026
mapping are printed for a human to assign - they are candidates, not the
register.
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import (
    Asset,
    Consent,
    Module,
    Pathway,
    Person,
    ScheduledEvent,
    StaffUser,
    utcnow,
)
from app.security import hash_password
from app.services.calendar import (
    MAX_CLASS_SIZE,
    TRAINING_VENUE,
    generate_training_slots,
)
from app.services.qualification import COMMUNITY_BARISTA

# 4.1 LOCKED. Display titles are deliberately absent: 4.3 says the public
# naming ladder (Brew Kaki / Cafe Maestro / ...) is NOT yet decided, and must
# never be baked into permission logic.
MODULES = [
    ("CB1", "Brew Techniques", 1, "core", True, None),
    ("CB2", "Espresso Techniques", 2, "core", True, None),
    ("CB3", "Food Safety and Ops", 3, "core", True, None),
    ("CB4", "Deployment and Advanced Skills", 4, "core", True, None),
    ("CB5", "Team Leader Training", 5, "leadership", False, "team_leader"),
    ("CB6", "Precinct Leader Training", 6, "leadership", False, "precinct_leader"),
    ("CB7", "Zone Leader Training", 7, "leadership", False, "zone_leader"),
]

# 2.2 [HISTORICAL / CANDIDATE] - printed for assignment, deliberately not seeded
# as the operational register.
CANDIDATE_SITES = [
    "Void Deck Blk 622 Jurong West St 65",
    "Void Deck Blk 673A Jurong West St 65",
    "Void Deck Blk 667D Jurong West St 65",
    "Void Deck Blk 682C Jurong West Central 1",
    "Void Deck Blk 261 Boon Lay Drive",
    "Void Deck Blk 218A Boon Lay Avenue",
]

TARGET_ASSETS = 17

DEMO_PEOPLE = [
    ("Ah Huat", "+6591000001", "60-69", "en"),
    ("Mary Tan", "+6591000002", "60-69", "en"),
    ("Siti Rahman", "+6591000003", "70-79", "ms"),
    ("Raj Kumar", "+6591000004", "60-69", "ta"),
    ("Lim Ah Kow", "+6591000005", "70-79", "zh"),
    ("Grace Wong", "+6591000006", "50-59", "en"),
]


def seed_pathway(db: Session) -> Pathway:
    pathway = db.scalar(select(Pathway).where(Pathway.code == COMMUNITY_BARISTA))
    if pathway is None:
        pathway = Pathway(
            code=COMMUNITY_BARISTA,
            name="Community Barista",
            description=(
                "CB1-CB4 are required for deployment. CB5-CB7 are optional "
                "leadership progression. Coffee is the first proof case; the "
                "engine is reusable for other pathways."
            ),
        )
        db.add(pathway)
        db.flush()

    for code, name, sequence, kind, required, grants in MODULES:
        module = db.scalar(
            select(Module).where(Module.pathway_id == pathway.id, Module.code == code)
        )
        if module is None:
            module = Module(pathway_id=pathway.id, code=code)
            db.add(module)
        module.name = name
        module.sequence = sequence
        module.kind = kind
        module.required_for_deployment = required
        module.grants_role = grants
        module.default_capacity = MAX_CLASS_SIZE
        module.assessment_required = True
    return pathway


def seed_assets(db: Session) -> int:
    created = 0
    for index in range(1, TARGET_ASSETS + 1):
        code = f"A{index:02d}"
        if db.scalar(select(Asset).where(Asset.code == code)) is not None:
            continue
        db.add(
            Asset(
                code=code,
                name=f"Asset {index:02d} - site to be confirmed",
                zone="Boon Lay",
                status="not_started",
                notes=(
                    "Placeholder. Section 2.2: the authoritative 17-asset register "
                    "(site, address, zone, precinct, owner, partner, readiness, "
                    "launch sequence) has not been established. Replace this row "
                    "with the confirmed site - do not treat the placeholder as real."
                ),
            )
        )
        created += 1
    return created


def seed_admin(db: Session, email: str, password: str) -> StaffUser:
    user = db.scalar(select(StaffUser).where(StaffUser.email == email))
    if user is None:
        user = StaffUser(
            email=email,
            full_name="CU Operations Admin",
            password_hash=hash_password(password),
            role="ops_admin",
        )
        db.add(user)
    return user


def seed_calendar(db: Session) -> int:
    """Create the locked training slots as draft events awaiting a module."""
    created = 0
    for slot in generate_training_slots():
        starts = slot.start_utc()
        exists = db.scalar(
            select(ScheduledEvent).where(
                ScheduledEvent.starts_at == starts,
                ScheduledEvent.venue == TRAINING_VENUE,
            )
        )
        if exists is not None:
            continue
        db.add(
            ScheduledEvent(
                kind="training",
                title=f"Training slot - {slot.weekday_name} (module TBC)",
                venue=TRAINING_VENUE,
                starts_at=starts,
                ends_at=slot.end_utc(),
                capacity=MAX_CLASS_SIZE,
                status="draft",
                notes="Generated from the locked 5.2 calendar. Assign a module to open it.",
            )
        )
        created += 1
    return created


def seed_demo_people(db: Session) -> int:
    created = 0
    now = utcnow()
    for name, phone, age_band, language in DEMO_PEOPLE:
        if db.scalar(select(Person).where(Person.phone_e164 == phone)) is not None:
            continue
        person = Person(
            preferred_name=name,
            phone_e164=phone,
            age_band=age_band,
            preferred_language=language,
            home_zone="Boon Lay",
            status="registered",
            registration_source="import",
            notes="DEMO DATA - not a real person.",
        )
        db.add(person)
        db.flush()
        for consent_type in ("participation", "whatsapp_messaging"):
            db.add(
                Consent(
                    person_id=person.id,
                    consent_type=consent_type,
                    granted=True,
                    granted_at=now,
                    method="paper",
                )
            )
        created += 1
    return created


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed CU-OS reference data")
    parser.add_argument("--demo", action="store_true", help="add fake demo people")
    parser.add_argument(
        "--no-calendar", action="store_true", help="skip the 72 training slots"
    )
    parser.add_argument("--admin-email", default="admin@communityunlimited.sg")
    parser.add_argument("--admin-password", default="cuos-admin")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        seed_pathway(db)
        assets = seed_assets(db)
        seed_admin(db, args.admin_email.lower(), args.admin_password)
        slots = 0 if args.no_calendar else seed_calendar(db)
        demo = seed_demo_people(db) if args.demo else 0
        db.commit()
    finally:
        db.close()

    print("Seeded:")
    print(f"  pathway        community_barista with {len(MODULES)} modules (CB1-CB7)")
    print(f"  assets         {assets} placeholder site(s) created (target {TARGET_ASSETS})")
    print(f"  training slots {slots} draft event(s) from the locked calendar")
    print(f"  demo people    {demo}")
    print(f"  admin          {args.admin_email}")
    print()
    print("TO CONFIRM - candidate sites from the March 2026 mapping, for a human")
    print("to assign to the register (2.2 - these are candidates, not the 17):")
    for site in CANDIDATE_SITES:
        print(f"    - {site}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
