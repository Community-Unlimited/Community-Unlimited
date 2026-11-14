"""Public and assisted registration."""

from __future__ import annotations

import pytest

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import Consent, Person


def _payload(**overrides) -> dict:
    base = {
        "preferred_name": "Ah Huat",
        "phone": "9123 4567",
        "nric_last4": "123a",
        "consent_participation": True,
        "consent_health_safety": True,
        "consent_whatsapp": True,
        "consent_photo_media": False,
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
    assert body["person"]["nric_last4"] == "123A"


def test_registration_records_all_consents_separately(client: TestClient, db) -> None:
    client.post(
        "/api/register",
        json=_payload(consent_whatsapp=False, consent_photo_media=True),
    )
    db.expire_all()
    person = db.scalar(select(Person).where(Person.phone_e164 == "+6591234567"))
    consents = {c.consent_type: c for c in person.consents}

    assert consents["participation"].granted is True
    assert consents["participation"].granted_at is not None
    assert consents["health_safety_declaration"].granted is True
    assert consents["health_safety_declaration"].granted_at is not None
    # Declining messaging must not block registration.
    assert consents["whatsapp_messaging"].granted is False
    assert consents["whatsapp_messaging"].granted_at is None
    assert consents["photo_media"].granted is True
    assert consents["photo_media"].granted_at is not None


def test_participation_consent_is_mandatory(client: TestClient) -> None:
    response = client.post("/api/register", json=_payload(consent_participation=False))
    assert response.status_code == 422


def test_health_safety_consent_is_mandatory(client: TestClient) -> None:
    response = client.post("/api/register", json=_payload(consent_health_safety=False))
    assert response.status_code == 422


def test_invalid_nric_last4_is_rejected(client: TestClient) -> None:
    response = client.post("/api/register", json=_payload(nric_last4="ABCD"))
    assert response.status_code == 422
    assert "NRIC" in response.text


def test_pmd_health_and_grassroots_fields_are_stored(
    client: TestClient, db
) -> None:
    response = client.post(
        "/api/register",
        json=_payload(
            mobility_aid="pmd",
            has_health_conditions=True,
            health_conditions=["epilepsy_seizures", "heart_blood_pressure"],
            health_notes="Needs seated breaks during kopi brewing.",
            emergency_contact_name="Tan Mei Ling",
            emergency_contact_phone="9876 5432",
            emergency_contact_relationship="Daughter",
            is_grassroots_volunteer=True,
            grassroots_organisation="Boon Lay Zone A RN",
        ),
    )
    assert response.status_code == 200, response.text
    person_out = response.json()["person"]
    assert person_out["requires_pmd"] is True
    assert person_out["mobility_aid"] == "pmd"
    assert person_out["has_health_conditions"] is True
    assert person_out["health_conditions"] == [
        "epilepsy_seizures",
        "heart_blood_pressure",
    ]
    assert person_out["health_notes"] == "Needs seated breaks during kopi brewing."
    assert person_out["emergency_contact_name"] == "Tan Mei Ling"
    assert person_out["emergency_contact_phone"] == "+6598765432"
    assert person_out["emergency_contact_relationship"] == "Daughter"
    assert person_out["is_grassroots_volunteer"] is True
    assert person_out["grassroots_organisation"] == "Boon Lay Zone A RN"


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


@pytest.mark.parametrize("age_band", ["<30", "30-40", "40-50", "50-59", "60-69", "70-79", "80+"])
def test_supported_age_bands_are_accepted(
    client: TestClient, age_band: str
) -> None:
    response = client.post("/api/register", json=_payload(age_band=age_band))
    assert response.status_code == 200, response.text
    assert response.json()["person"]["age_band"] == age_band


def test_unknown_age_band_is_rejected(client: TestClient) -> None:
    response = client.post("/api/register", json=_payload(age_band="10-20"))
    assert response.status_code == 422


def test_written_and_spoken_language_proficiency_stored_and_returned(
    client: TestClient, auth
) -> None:
    response = client.post(
        "/api/register",
        json=_payload(
            age_band="30-40",
            written_languages=["en", "zh", "en"],
            spoken_languages=["en", "zh", "ms", "other"],
        ),
    )
    assert response.status_code == 200, response.text
    person = response.json()["person"]
    assert person["age_band"] == "30-40"
    assert person["written_languages"] == ["en", "zh"]
    assert person["spoken_languages"] == ["en", "zh", "ms", "other"]

    listed = client.get("/api/people", headers=auth)
    assert listed.status_code == 200, listed.text
    people = listed.json()
    assert len(people) == 1
    assert people[0]["written_languages"] == ["en", "zh"]
    assert people[0]["spoken_languages"] == ["en", "zh", "ms", "other"]


def test_unknown_written_or_spoken_language_is_rejected(client: TestClient) -> None:
    res_written = client.post(
        "/api/register", json=_payload(written_languages=["fr"])
    )
    assert res_written.status_code == 422

    res_spoken = client.post(
        "/api/register", json=_payload(spoken_languages=["de"])
    )
    assert res_spoken.status_code == 422


def test_people_list_returns_signup_details_and_supports_sort_and_nric_search(
    client: TestClient, auth
) -> None:
    client.post(
        "/api/register",
        json=_payload(
            preferred_name="Zed",
            phone="91112222",
            nric_last4="456B",
            consent_whatsapp=False,
        ),
    )
    client.post(
        "/api/people",
        json=_payload(
            preferred_name="Amy",
            phone="93334444",
            nric_last4="789C",
            assisted_by="Staff Jane",
            consent_whatsapp=True,
        ),
        headers=auth,
    )

    newest = client.get("/api/people?sort=newest", headers=auth)
    assert newest.status_code == 200, newest.text
    rows = newest.json()
    assert [r["preferred_name"] for r in rows] == ["Amy", "Zed"]
    assert rows[0]["assisted_by"] == "Staff Jane"
    assert len(rows[0]["availability"]) == 1
    assert rows[0]["availability"][0]["weekday"] == 0
    consents_amy = {c["consent_type"]: c["granted"] for c in rows[0]["consents"]}
    assert consents_amy["whatsapp_messaging"] is True
    consents_zed = {c["consent_type"]: c["granted"] for c in rows[1]["consents"]}
    assert consents_zed["whatsapp_messaging"] is False

    oldest = client.get("/api/people?sort=oldest", headers=auth)
    assert oldest.status_code == 200
    assert [r["preferred_name"] for r in oldest.json()] == ["Zed", "Amy"]

    by_nric = client.get("/api/people?search=456B", headers=auth)
    assert by_nric.status_code == 200
    assert [r["preferred_name"] for r in by_nric.json()] == ["Zed"]
