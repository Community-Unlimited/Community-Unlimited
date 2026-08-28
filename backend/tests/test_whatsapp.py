"""WhatsApp invite, acknowledgment and webhook handling.

All offline: the fake provider renders the real Cloud API body and the dev
simulator pushes a signed, Meta-shaped envelope through the same handler the
live webhook uses.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import EventAcknowledgment, InboundMessage, OutboundMessage
from app.whatsapp import webhook_handler
from app.whatsapp.provider import get_fake_provider

SGT = timezone(timedelta(hours=8))


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def register(client: TestClient, name: str, phone: str, consent: bool = True) -> int:
    response = client.post(
        "/api/register",
        json={
            "preferred_name": name,
            "phone": phone,
            "consent_participation": True,
            "consent_whatsapp": consent,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["person"]["id"]


def make_event(client: TestClient, auth: dict, title: str = "Community coffee morning") -> int:
    starts = datetime(2026, 10, 5, 9, 0, tzinfo=SGT)
    response = client.post(
        "/api/events",
        json={
            "title": title,
            "kind": "community",
            "venue": "Blk 209 Boon Lay",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=2)).isoformat(),
            "capacity": 30,
        },
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def invite(client: TestClient, auth: dict, event_id: int, person_ids: list[int]) -> dict:
    response = client.post(
        f"/api/events/{event_id}/invite",
        json={"person_ids": person_ids, "send_now": True},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    return response.json()


# --------------------------------------------------------------------------
# outbound
# --------------------------------------------------------------------------


def test_invite_renders_a_real_cloud_api_template_body(
    client: TestClient, auth
) -> None:
    person_id = register(client, "Ah Huat", "91230001")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [person_id])

    sent = get_fake_provider().sent
    assert len(sent) == 1
    body = sent[0]
    assert body["messaging_product"] == "whatsapp"
    assert body["to"] == "6591230001"
    assert body["type"] == "template"
    assert body["template"]["name"] == "cu_event_invite"

    buttons = [c for c in body["template"]["components"] if c["type"] == "button"]
    assert len(buttons) == 3
    payloads = [b["parameters"][0]["payload"] for b in buttons]
    assert payloads == ["ack_yes", "ack_no", "ack_maybe"]


def test_invite_is_skipped_without_messaging_consent(client: TestClient, auth) -> None:
    person_id = register(client, "No Consent", "91230002", consent=False)
    event_id = make_event(client, auth)
    result = invite(client, auth, event_id, [person_id])

    assert result["queued"] == 0
    assert result["skipped_no_consent"] == 1
    assert get_fake_provider().sent == []


def test_inviting_twice_does_not_send_twice(client: TestClient, auth, db) -> None:
    person_id = register(client, "Ah Huat", "91230003")
    event_id = make_event(client, auth)

    first = invite(client, auth, event_id, [person_id])
    second = invite(client, auth, event_id, [person_id])

    assert first["queued"] == 1
    assert second["queued"] == 0, "the dedupe key must prevent a second queue"
    assert len(get_fake_provider().sent) == 1

    db.expire_all()
    rows = list(db.scalars(select(OutboundMessage)))
    assert len(rows) == 1
    assert rows[0].status == "sent"
    assert rows[0].provider_message_id is not None


def test_cancelling_frees_the_dedupe_key(client: TestClient, auth, db) -> None:
    """A cancelled row must not block the same message forever."""
    person_id = register(client, "Ah Huat", "91230004")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [person_id])

    db.expire_all()
    message = db.scalar(select(OutboundMessage))
    original_key = message.dedupe_key
    message.cancel()
    db.commit()

    assert message.status == "cancelled"
    assert message.dedupe_key != original_key
    assert original_key in message.dedupe_key

    # The key is free again, so a fresh invite can be queued.
    again = invite(client, auth, event_id, [person_id])
    assert again["queued"] == 1


# --------------------------------------------------------------------------
# inbound
# --------------------------------------------------------------------------


def test_button_reply_records_an_acknowledgment(client: TestClient, auth, db) -> None:
    person_id = register(client, "Mary", "91230005")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [person_id])

    response = client.post(
        "/api/dev/simulate-reply", json={"phone": "91230005", "response": "yes"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["acknowledged"] == 1

    db.expire_all()
    ack = db.scalar(select(EventAcknowledgment))
    assert ack.response == "yes"
    assert ack.event_id == event_id
    assert ack.person_id == person_id


def test_acknowledgment_counts_appear_on_the_event(client: TestClient, auth) -> None:
    yes_id = register(client, "Yes Person", "91230006")
    no_id = register(client, "No Person", "91230007")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [yes_id, no_id])

    client.post("/api/dev/simulate-reply", json={"phone": "91230006", "response": "yes"})
    client.post("/api/dev/simulate-reply", json={"phone": "91230007", "response": "no"})

    events = client.get("/api/events", headers=auth).json()
    event = next(e for e in events if e["id"] == event_id)
    assert event["acknowledged_yes"] == 1
    assert event["acknowledged_no"] == 1
    assert event["acknowledged_maybe"] == 0


def test_exact_redelivery_is_absorbed(client: TestClient, auth, db) -> None:
    """Meta retries on any non-200; the UNIQUE message id must make it a no-op."""
    register(client, "Mary", "91230008")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [1])

    first = client.post(
        "/api/dev/simulate-reply",
        json={
            "phone": "91230008",
            "response": "yes",
            "provider_message_id": "wamid.fixed.1",
            "timestamp": 1790000000,
        },
    ).json()
    second = client.post(
        "/api/dev/simulate-reply",
        json={
            "phone": "91230008",
            "response": "no",
            "provider_message_id": "wamid.fixed.1",
            "timestamp": 1790000000,
        },
    ).json()

    assert first["stored"] == 1
    assert second["stored"] == 0
    assert second["duplicates"] == 1

    db.expire_all()
    assert len(list(db.scalars(select(InboundMessage)))) == 1
    # The replay must NOT have flipped yes to no.
    assert db.scalar(select(EventAcknowledgment)).response == "yes"


def test_change_of_mind_later_wins(client: TestClient, auth, db) -> None:
    register(client, "Mind Changer", "91230009")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [1])

    client.post(
        "/api/dev/simulate-reply",
        json={"phone": "91230009", "response": "no", "timestamp": 1790000000},
    )
    client.post(
        "/api/dev/simulate-reply",
        json={"phone": "91230009", "response": "yes", "timestamp": 1790000060},
    )

    db.expire_all()
    assert db.scalar(select(EventAcknowledgment)).response == "yes"


def test_change_of_mind_within_the_same_second_is_kept(
    client: TestClient, auth, db
) -> None:
    """The guard rejects only strictly-older messages.

    Meta timestamps are whole seconds. Two distinct taps inside one second carry
    the same timestamp, so requiring a strictly greater timestamp would discard
    the correction and leave the wrong answer on record.
    """
    register(client, "Fast Tapper", "91230010")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [1])

    same_second = 1790000000
    client.post(
        "/api/dev/simulate-reply",
        json={
            "phone": "91230010",
            "response": "no",
            "timestamp": same_second,
            "provider_message_id": "wamid.tap.1",
        },
    )
    client.post(
        "/api/dev/simulate-reply",
        json={
            "phone": "91230010",
            "response": "yes",
            "timestamp": same_second,
            "provider_message_id": "wamid.tap.2",
        },
    )

    db.expire_all()
    assert db.scalar(select(EventAcknowledgment)).response == "yes"


def test_out_of_order_redelivery_is_discarded(client: TestClient, auth, db) -> None:
    register(client, "Out Of Order", "91230011")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [1])

    client.post(
        "/api/dev/simulate-reply",
        json={
            "phone": "91230011",
            "response": "yes",
            "timestamp": 1790000060,
            "provider_message_id": "wamid.new",
        },
    )
    late = client.post(
        "/api/dev/simulate-reply",
        json={
            "phone": "91230011",
            "response": "no",
            "timestamp": 1790000000,
            "provider_message_id": "wamid.old",
        },
    ).json()

    assert late["stale"] == 1
    db.expire_all()
    assert db.scalar(select(EventAcknowledgment)).response == "yes"


def test_reply_without_an_invite_is_refused(client: TestClient, auth) -> None:
    register(client, "Unprompted", "91230012")
    response = client.post(
        "/api/dev/simulate-reply", json={"phone": "91230012", "response": "yes"}
    )
    assert response.status_code == 409


# --------------------------------------------------------------------------
# signature
# --------------------------------------------------------------------------


def test_signature_is_computed_over_raw_bytes() -> None:
    secret = "app-secret"
    body = json.dumps({"a": 1, "b": [2, 3]}).encode("utf-8")
    header = webhook_handler.sign(body, secret)
    assert webhook_handler.verify_signature(body, header, secret)


def test_reserialised_body_fails_verification() -> None:
    """Hashing a re-serialised model never matches what Meta signed."""
    secret = "app-secret"
    original = b'{"b":[2,3],"a":1}'
    header = webhook_handler.sign(original, secret)

    reserialised = json.dumps(json.loads(original)).encode("utf-8")
    assert reserialised != original
    assert not webhook_handler.verify_signature(reserialised, header, secret)


def test_tampered_body_fails_verification() -> None:
    secret = "app-secret"
    body = b'{"amount": 1}'
    header = webhook_handler.sign(body, secret)
    assert not webhook_handler.verify_signature(b'{"amount": 999}', header, secret)


def test_malformed_signature_headers_are_rejected() -> None:
    secret = "app-secret"
    body = b"{}"
    for header in (None, "", "sha1=abc", "abc", "sha256=", "sha256"):
        assert not webhook_handler.verify_signature(body, header, secret)


def test_webhook_rejects_a_bad_signature(client: TestClient, monkeypatch) -> None:
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "whatsapp_app_secret", "real-secret", raising=False)

    response = client.post(
        "/api/whatsapp/webhook",
        content=b'{"entry":[]}',
        headers={
            "X-Hub-Signature-256": "sha256=deadbeef",
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 401


def test_webhook_verification_handshake(client: TestClient) -> None:
    response = client.get(
        "/api/whatsapp/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "cu-os-verify",
            "hub.challenge": "12345",
        },
    )
    assert response.status_code == 200
    assert response.text == "12345"


def test_webhook_handshake_rejects_a_wrong_token(client: TestClient) -> None:
    response = client.get(
        "/api/whatsapp/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong",
            "hub.challenge": "12345",
        },
    )
    assert response.status_code == 403
