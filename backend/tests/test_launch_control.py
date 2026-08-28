"""Launch Control - the challenge function (15).

The point of these tests is that the warnings are *derived*. The 480-seat gap
and the 180-completer ceiling must fall out of the locked calendar rules, so
that changing a rule changes the verdict.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import Asset, Module, Person, Qualification, utcnow
from app.services import launch_control

SGT = timezone(timedelta(hours=8))


def report(client: TestClient, auth: dict) -> dict:
    response = client.get("/api/launch-control", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def finding(data: dict, code: str) -> dict:
    match = [f for f in data["findings"] if f["code"] == code]
    assert match, f"no finding {code!r} in {[f['code'] for f in data['findings']]}"
    return match[0]


# --------------------------------------------------------------------------
# the headline contradiction
# --------------------------------------------------------------------------


def test_training_capacity_gap_is_red_and_derived(client: TestClient, auth) -> None:
    data = report(client, auth)
    capacity = finding(data, "training_capacity")

    assert capacity["severity"] == "red"
    metrics = capacity["metrics"]
    assert metrics["total_slots"] == 72
    assert metrics["total_learner_seats"] == 720
    assert metrics["learner_seats_required"] == 1200
    assert metrics["learner_seat_gap"] == 480
    assert metrics["max_people_completing_pathway"] == 180
    # The wording a coordinator reads must carry the numbers.
    assert "480" in capacity["detail"]
    assert "180" in capacity["detail"]


def test_overall_status_is_red_while_the_gap_exists(client: TestClient, auth) -> None:
    assert report(client, auth)["worst_severity"] == "red"


def test_red_findings_sort_first(client: TestClient, auth) -> None:
    findings = report(client, auth)["findings"]
    severities = [f["severity"] for f in findings]
    order = {"red": 0, "amber": 1, "green": 2}
    assert severities == sorted(severities, key=lambda s: order[s])


# --------------------------------------------------------------------------
# leadership maths
# --------------------------------------------------------------------------


def test_leader_coverage_uses_119_weekly_duties(client: TestClient, auth) -> None:
    """7: 17 assets x 7 days = 119 team-leader duties per week."""
    coverage = finding(report(client, auth), "leader_coverage")
    assert coverage["metrics"]["leader_duties_per_week_at_full_rollout"] == 119
    assert coverage["metrics"]["cb5_qualified_people"] == 0
    assert coverage["metrics"]["shortfall_at_full_rollout"] == 119
    assert coverage["severity"] == "red"


def test_leader_coverage_improves_as_cb5_is_awarded(
    client: TestClient, auth, db, pathway
) -> None:
    cb5 = db.scalar(select(Module).where(Module.code == "CB5"))
    for index in range(3):
        person = Person(
            preferred_name=f"Leader {index}", phone_e164=f"+659900000{index}"
        )
        db.add(person)
        db.flush()
        db.add(
            Qualification(
                person_id=person.id,
                module_id=cb5.id,
                status="approved",
                approved_at=utcnow(),
            )
        )
    db.commit()

    coverage = finding(report(client, auth), "leader_coverage")
    assert coverage["metrics"]["cb5_qualified_people"] == 3
    assert coverage["metrics"]["shortfall_at_full_rollout"] == 116


def test_expired_qualification_stops_counting(client: TestClient, auth, db, pathway) -> None:
    cb5 = db.scalar(select(Module).where(Module.code == "CB5"))
    person = Person(preferred_name="Lapsed", phone_e164="+6599111111")
    db.add(person)
    db.flush()
    db.add(
        Qualification(
            person_id=person.id,
            module_id=cb5.id,
            status="approved",
            approved_at=utcnow() - timedelta(days=800),
            expires_at=utcnow() - timedelta(days=1),
        )
    )
    db.commit()

    coverage = finding(report(client, auth), "leader_coverage")
    assert coverage["metrics"]["cb5_qualified_people"] == 0


def test_pending_qualification_does_not_count(client: TestClient, auth, db, pathway) -> None:
    cb5 = db.scalar(select(Module).where(Module.code == "CB5"))
    person = Person(preferred_name="Awaiting", phone_e164="+6599222222")
    db.add(person)
    db.flush()
    db.add(
        Qualification(
            person_id=person.id, module_id=cb5.id, status="pending_approval"
        )
    )
    db.commit()
    assert (
        finding(report(client, auth), "leader_coverage")["metrics"][
            "cb5_qualified_people"
        ]
        == 0
    )


# --------------------------------------------------------------------------
# assets
# --------------------------------------------------------------------------


def test_asset_rollout_targets_17(client: TestClient, auth, db) -> None:
    db.add(Asset(code="A01", name="Placeholder"))
    db.commit()
    rollout = finding(report(client, auth), "asset_rollout")
    assert rollout["metrics"]["target_assets"] == 17
    assert rollout["metrics"]["assets_live"] == 0
    assert rollout["metrics"]["rollout_deadline"] == "2027-03-31"


def test_blockers_are_visible_not_a_black_box_score(client: TestClient, auth, db) -> None:
    """2.3 / 6.3: the readiness score must expose its reasons."""
    asset = Asset(code="A02", name="Partly ready", place_confirmed=True, power_confirmed=True)
    db.add(asset)
    db.commit()

    listed = client.get("/api/assets", headers=auth).json()
    row = next(a for a in listed if a["code"] == "A02")
    assert row["gates_met"] == 2
    assert row["is_ready_to_launch"] is False
    assert "Water not confirmed" in row["blockers"]
    assert "Partner / owner not confirmed" in row["blockers"]
    assert len(row["blockers"]) == 10


def test_all_twelve_gates_makes_a_site_ready(client: TestClient, auth, db) -> None:
    from app.models.asset import READINESS_GATES

    asset = Asset(code="A03", name="Ready site")
    for gate, _ in READINESS_GATES:
        setattr(asset, gate, True)
    db.add(asset)
    db.commit()

    row = next(a for a in client.get("/api/assets", headers=auth).json() if a["code"] == "A03")
    assert row["is_ready_to_launch"] is True
    assert row["blockers"] == []
    assert row["gates_met"] == 12


def test_setting_a_gate_advances_status(client: TestClient, auth, db) -> None:
    asset = Asset(code="A04", name="Site")
    db.add(asset)
    db.commit()
    db.refresh(asset)

    response = client.patch(
        f"/api/assets/{asset.id}/gate",
        json={"gate": "place_confirmed", "value": True},
        headers=auth,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "preparing"


def test_unknown_gate_is_rejected(client: TestClient, auth, db) -> None:
    asset = Asset(code="A05", name="Site")
    db.add(asset)
    db.commit()
    db.refresh(asset)
    response = client.patch(
        f"/api/assets/{asset.id}/gate",
        json={"gate": "vibes_confirmed", "value": True},
        headers=auth,
    )
    assert response.status_code == 422


def test_ready_site_with_no_leaders_is_flagged(client: TestClient, auth, db) -> None:
    """15: 'asset ready but no CB5 coverage'."""
    db.add(Asset(code="A06", name="Eager site", status="ready"))
    db.commit()
    flagged = finding(report(client, auth), "ready_without_leaders")
    assert flagged["severity"] == "red"
    assert "A06" in flagged["metrics"]["assets"]


# --------------------------------------------------------------------------
# scheduling contradictions
# --------------------------------------------------------------------------


def test_training_on_a_public_holiday_is_refused(client: TestClient, auth, pathway) -> None:
    """5.1 LOCKED. Deepavali, 9 Nov 2026."""
    starts = datetime(2026, 11, 9, 9, 0, tzinfo=SGT)
    response = client.post(
        "/api/events",
        json={
            "title": "CB1 on Deepavali",
            "kind": "training",
            "module_code": "CB1",
            "venue": "BLCC Culinary Studio",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=3)).isoformat(),
        },
        headers=auth,
    )
    assert response.status_code == 422
    assert "public holiday" in response.text


def test_over_capacity_enrollment_goes_to_the_waitlist(
    client: TestClient, auth, pathway
) -> None:
    """5.2 LOCKED: max 10 per session."""
    starts = datetime(2026, 10, 5, 9, 0, tzinfo=SGT)
    event_id = client.post(
        "/api/events",
        json={
            "title": "Small class",
            "kind": "training",
            "module_code": "CB1",
            "venue": "BLCC Culinary Studio",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=3)).isoformat(),
            "capacity": 2,
        },
        headers=auth,
    ).json()["id"]

    statuses = []
    for index in range(3):
        person_id = client.post(
            "/api/register",
            json={
                "preferred_name": f"P{index}",
                "phone": f"9155000{index}",
                "consent_participation": True,
            },
        ).json()["person"]["id"]
        statuses.append(
            client.post(
                f"/api/events/{event_id}/enroll",
                json={"person_id": person_id},
                headers=auth,
            ).json()["status"]
        )

    assert statuses == ["registered", "registered", "waitlisted"]
    # And capacity is therefore never exceeded.
    assert not [
        f for f in report(client, auth)["findings"] if f["code"] == "class_over_capacity"
    ]


def test_events_must_end_after_they_start(client: TestClient, auth) -> None:
    starts = datetime(2026, 10, 5, 9, 0, tzinfo=SGT)
    response = client.post(
        "/api/events",
        json={
            "title": "Backwards",
            "kind": "community",
            "venue": "Somewhere",
            "starts_at": starts.isoformat(),
            "ends_at": (starts - timedelta(hours=1)).isoformat(),
        },
        headers=auth,
    )
    assert response.status_code == 422


def test_naive_datetimes_are_refused(client: TestClient, auth) -> None:
    """Ambiguous local time is the root of the whole timezone class of bug."""
    response = client.post(
        "/api/events",
        json={
            "title": "No timezone",
            "kind": "community",
            "venue": "Somewhere",
            "starts_at": "2026-10-05T09:00:00",
            "ends_at": "2026-10-05T11:00:00",
        },
        headers=auth,
    )
    assert response.status_code == 422
    assert "timezone" in response.text


# --------------------------------------------------------------------------
# headline
# --------------------------------------------------------------------------


def test_headline_carries_the_command_centre_numbers(client: TestClient, auth) -> None:
    headline = report(client, auth)["headline"]
    for key in (
        "deployable",
        "deployable_target",
        "registered",
        "cb5_leaders",
        "leader_duties_per_week",
        "assets_live",
        "assets_target",
        "training_slots",
        "learner_seats_total",
        "learner_seats_remaining",
        "learner_seat_gap",
        "red_findings",
    ):
        assert key in headline, f"missing headline key {key}"

    assert headline["deployable_target"] == 300
    assert headline["assets_target"] == 17
    assert headline["training_slots"] == 72
    assert headline["red_findings"] >= 1


def test_launch_control_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/launch-control").status_code == 401


def test_seats_remaining_falls_as_people_enrol(client: TestClient, auth, pathway) -> None:
    before = report(client, auth)["headline"]["learner_seats_remaining"]

    starts = datetime(2026, 10, 5, 9, 0, tzinfo=SGT)
    event_id = client.post(
        "/api/events",
        json={
            "title": "CB1",
            "kind": "training",
            "module_code": "CB1",
            "venue": "BLCC Culinary Studio",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=3)).isoformat(),
        },
        headers=auth,
    ).json()["id"]
    person_id = client.post(
        "/api/register",
        json={
            "preferred_name": "Enrollee",
            "phone": "91560000",
            "consent_participation": True,
        },
    ).json()["person"]["id"]
    client.post(
        f"/api/events/{event_id}/enroll", json={"person_id": person_id}, headers=auth
    )

    after = report(client, auth)["headline"]["learner_seats_remaining"]
    assert after == before - 1
