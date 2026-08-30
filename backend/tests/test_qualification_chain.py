"""The spine: register -> enrol -> attend -> approve -> deployable.

26 lists this chain as what the MVP must prove, and 27 turns it into the
success test. These are the assertions that matter most.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

SGT = timezone(timedelta(hours=8))


def register(client: TestClient, name: str, phone: str) -> int:
    response = client.post(
        "/api/register",
        json={
            "preferred_name": name,
            "phone": phone,
            "consent_participation": True,
            "consent_whatsapp": True,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["person"]["id"]


def create_session(client: TestClient, auth: dict, module_code: str, day: int = 5) -> int:
    starts = datetime(2026, 10, day, 9, 0, tzinfo=SGT)
    response = client.post(
        "/api/events",
        json={
            "title": f"{module_code} class",
            "kind": "training",
            "module_code": module_code,
            "venue": "BLCC Culinary Studio",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=3)).isoformat(),
            "capacity": 10,
        },
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def complete_module(
    client: TestClient, auth: dict, person_id: int, module_code: str, day: int
) -> None:
    event_id = create_session(client, auth, module_code, day=day)
    assert (
        client.post(
            f"/api/events/{event_id}/enroll",
            json={"person_id": person_id},
            headers=auth,
        ).status_code
        == 200
    )
    marked = client.post(
        f"/api/events/{event_id}/attendance",
        json={"person_id": person_id, "attended": True, "assessment_outcome": "pass"},
        headers=auth,
    )
    assert marked.status_code == 200, marked.text


def tier_of(client: TestClient, auth: dict, person_id: int) -> dict:
    response = client.get(f"/api/people/{person_id}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()["tier"]


def test_attendance_alone_does_not_make_someone_deployable(
    client: TestClient, auth, pathway
) -> None:
    """11.3: the machine computes readiness, a human awards it."""
    person_id = register(client, "Ah Huat", "91230001")
    for index, code in enumerate(["CB1", "CB2", "CB3", "CB4"]):
        complete_module(client, auth, person_id, code, day=5 + index)

    tier = tier_of(client, auth, person_id)
    assert tier["deployable"] is False, "unapproved completions must not count"
    assert sorted(tier["pending_approval"]) == ["CB1", "CB2", "CB3", "CB4"]
    assert tier["core_completed"] == []


def test_full_chain_to_deployable(client: TestClient, auth, pathway) -> None:
    person_id = register(client, "Mary Tan", "91230002")
    for index, code in enumerate(["CB1", "CB2", "CB3", "CB4"]):
        complete_module(client, auth, person_id, code, day=5 + index)
        approve = client.post(
            "/api/qualifications/approve",
            json={"person_id": person_id, "module_code": code},
            headers=auth,
        )
        assert approve.status_code == 200, approve.text

    tier = tier_of(client, auth, person_id)
    assert tier["deployable"] is True
    assert tier["core_missing"] == []
    assert tier["tier_label"] == "Deployable Community Barista"
    # 4.1: CB1-CB4 is the gate. Leadership is separate and not implied.
    assert tier["can_lead"] is False
    assert tier["next_module"] == "CB5"


def test_three_of_four_modules_is_not_deployable(
    client: TestClient, auth, pathway
) -> None:
    """27.2: 'who is missing only one CB module?'"""
    person_id = register(client, "Siti", "91230003")
    for index, code in enumerate(["CB1", "CB2", "CB3"]):
        complete_module(client, auth, person_id, code, day=5 + index)
        client.post(
            "/api/qualifications/approve",
            json={"person_id": person_id, "module_code": code},
            headers=auth,
        )

    tier = tier_of(client, auth, person_id)
    assert tier["deployable"] is False
    assert tier["core_missing"] == ["CB4"]
    assert tier["next_module"] == "CB4"
    assert tier["tier_label"] == "In training (3 of 4)"

    listed = client.get("/api/people?missing_module=CB4", headers=auth).json()
    assert person_id in [p["id"] for p in listed]


def test_modules_need_not_be_consecutive(client: TestClient, auth, pathway) -> None:
    """4.1 LOCKED: CB1-CB4 need not be four consecutive sessions."""
    person_id = register(client, "Raj", "91230004")
    for index, code in enumerate(["CB3", "CB1", "CB4", "CB2"]):
        complete_module(client, auth, person_id, code, day=5 + index)
        client.post(
            "/api/qualifications/approve",
            json={"person_id": person_id, "module_code": code},
            headers=auth,
        )
    assert tier_of(client, auth, person_id)["deployable"] is True


def test_failed_assessment_blocks_completion(client: TestClient, auth, pathway) -> None:
    person_id = register(client, "Lim", "91230005")
    event_id = create_session(client, auth, "CB1")
    client.post(
        f"/api/events/{event_id}/enroll", json={"person_id": person_id}, headers=auth
    )
    response = client.post(
        f"/api/events/{event_id}/attendance",
        json={"person_id": person_id, "attended": True, "assessment_outcome": "fail"},
        headers=auth,
    )
    assert response.json()["status"] == "requires_reassessment"
    assert tier_of(client, auth, person_id)["core_completed"] == []


def test_no_show_records_nothing(client: TestClient, auth, pathway) -> None:
    person_id = register(client, "Grace", "91230006")
    event_id = create_session(client, auth, "CB1")
    client.post(
        f"/api/events/{event_id}/enroll", json={"person_id": person_id}, headers=auth
    )
    response = client.post(
        f"/api/events/{event_id}/attendance",
        json={"person_id": person_id, "attended": False},
        headers=auth,
    )
    assert response.json()["status"] == "no_show"
    assert client.get("/api/qualifications/pending", headers=auth).json() == []


def test_cb5_grants_leadership_but_is_not_required_for_deployment(
    client: TestClient, auth, pathway
) -> None:
    person_id = register(client, "Leader", "91230007")
    for index, code in enumerate(["CB1", "CB2", "CB3", "CB4", "CB5"]):
        complete_module(client, auth, person_id, code, day=5 + index)
        client.post(
            "/api/qualifications/approve",
            json={"person_id": person_id, "module_code": code},
            headers=auth,
        )

    tier = tier_of(client, auth, person_id)
    assert tier["deployable"] is True
    assert tier["can_lead"] is True
    assert tier["leadership_held"] == ["CB5"]
    assert tier["tier_label"] == "Team Leader"


def test_override_without_a_reason_is_refused(client: TestClient, auth, pathway) -> None:
    """11.3: an override must record who, why and when."""
    person_id = register(client, "Shortcut", "91230008")
    response = client.post(
        "/api/qualifications/approve",
        json={"person_id": person_id, "module_code": "CB1", "is_override": True},
        headers=auth,
    )
    assert response.status_code == 422
    assert "reason" in response.text


def test_override_with_a_reason_is_recorded_and_audited(
    client: TestClient, auth, pathway, db
) -> None:
    from sqlalchemy import select

    from app.models import AuditEvent, Qualification

    person_id = register(client, "Prior Learning", "91230009")
    response = client.post(
        "/api/qualifications/approve",
        json={
            "person_id": person_id,
            "module_code": "CB3",
            "is_override": True,
            "reason": "Holds an external WSQ food hygiene certificate",
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text

    db.expire_all()
    record = db.scalar(
        select(Qualification).where(Qualification.person_id == person_id)
    )
    assert record.is_override is True
    assert record.approved_by_id is not None
    assert record.approved_at is not None
    assert "WSQ" in record.override_reason

    audit = db.scalar(
        select(AuditEvent).where(AuditEvent.action == "qualification.override")
    )
    assert audit is not None
    assert audit.actor_id is not None


def test_approving_without_a_completion_is_refused(
    client: TestClient, auth, pathway
) -> None:
    person_id = register(client, "Nobody", "91230010")
    response = client.post(
        "/api/qualifications/approve",
        json={"person_id": person_id, "module_code": "CB1"},
        headers=auth,
    )
    assert response.status_code == 404
    assert "override" in response.text


def test_pipeline_summary_counts_the_funnel(client: TestClient, auth, pathway) -> None:
    person_id = register(client, "Funnel", "91230011")
    for index, code in enumerate(["CB1", "CB2"]):
        complete_module(client, auth, person_id, code, day=5 + index)
        client.post(
            "/api/qualifications/approve",
            json={"person_id": person_id, "module_code": code},
            headers=auth,
        )

    summary = client.get("/api/people-summary/pipeline", headers=auth).json()
    assert summary["registered"] == 1
    assert summary["by_module"]["CB1"] == 1
    assert summary["by_module"]["CB2"] == 1
    assert summary["deployable"] == 0
