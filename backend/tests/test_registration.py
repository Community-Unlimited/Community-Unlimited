"""Public and assisted registration."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import Consent, Person


def _payload(**overrides) -> dict:
    base = {
        "preferred_name": "Ah Huat",
        "phone": "9123 4567",
        "consent_participation": True,
        "consent_whatsapp": True,
        "interests": ["coffee"],
        "age_band": "60-69",
        "availability": [{"weekday": 0, "start_time": "09:00", "end_time": "12:00"}],
    }
    base.update(overrides)
    return base


def test_registration_normalises_the_phone_number(client: TestClient, db) -> None:
    response = client.post("/api/register", json=_payload())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["already_registered"] is False
    assert body["person"]["phone_e164"] == "+6591234567"


def test_registration_records_both_consents_separately(client: TestClient, db) -> None:
    client.post("/api/register", json=_payload(consent_whatsapp=False))
    db.expire_all()
    person = db.scalar(select(Person).where(Person.phone_e164 == "+6591234567"))
    consents = {c.consent_type: c for c in person.consents}

    assert consents["participation"].granted is True
    assert consents["participation"].granted_at is not None
    # Declining messaging must not block registration.
    assert consents["whatsapp_messaging"].granted is False
    assert consents["whatsapp_messaging"].granted_at is None


def test_participation_consent_is_mandatory(client: TestClient) -> None:
    response = client.post("/api/register", json=_payload(consent_participation=False))
    assert response.status_code == 422


def test_invalid_phone_is_rejected_with_a_useful_message(client: TestClient) -> None:
    response = client.post("/api/register", json=_payload(phone="12345"))
    assert response.status_code == 422
    assert "Singapore" in response.text


def test_unknown_interest_is_rejected(client: TestClient) -> None:
    response = client.post("/api/register", json=_payload(interests=["knitting"]))
    assert response.status_code == 422


def test_duplicate_registration_does_not_leak_the_existing_record(
    client: TestClient,
) -> None:
    client.post("/api/register", json=_payload())
    second = client.post("/api/register", json=_payload(preferred_name="Someone Else"))

    assert second.status_code == 200
    body = second.json()
    assert body["already_registered"] is True
    # No person payload for an anonymous caller probing a number.
    assert body["person"] is None
    assert body["tier"] is None


def test_duplicate_does_not_create_a_second_person(client: TestClient, db) -> None:
    client.post("/api/register", json=_payload())
    client.post("/api/register", json=_payload(phone="+65 9123 4567"))
    db.expire_all()
    assert db.scalar(select(Person).where(Person.phone_e164 == "+6591234567")) is not None
    assert len(list(db.scalars(select(Person)))) == 1


def test_new_registrant_starts_at_the_registered_tier(client: TestClient, pathway) -> None:
    body = client.post("/api/register", json=_payload()).json()
    tier = body["tier"]
    assert tier["deployable"] is False
    assert tier["can_lead"] is False
    assert tier["tier_label"] == "Registered"
    assert tier["core_missing"] == ["CB1", "CB2", "CB3", "CB4"]
    assert tier["next_module"] == "CB1"


def test_availability_is_stored(client: TestClient, db) -> None:
    client.post("/api/register", json=_payload())
    db.expire_all()
    person = db.scalar(select(Person).where(Person.phone_e164 == "+6591234567"))
    assert len(person.availability) == 1
    assert person.availability[0].weekday == 0


def test_assisted_registration_by_staff(client: TestClient, auth, db) -> None:
    response = client.post(
        "/api/people",
        json=_payload(phone="98887777", assisted_by="Volunteer Mary"),
        headers=auth,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["assisted_registration"] is True
    assert body["registration_source"] == "assisted"


def test_assisted_registration_rejects_a_duplicate_loudly(
    client: TestClient, auth
) -> None:
    client.post("/api/register", json=_payload())
    response = client.post("/api/people", json=_payload(), headers=auth)
    # Staff are authenticated, so a clear conflict is the right answer here.
    assert response.status_code == 409


def test_people_list_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/people").status_code == 401
