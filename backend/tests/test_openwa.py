"""Tests for Open WhatsApp (WAHA / Baileys) integration.

Tests outbound sending format, inbound text normalization (e.g. "1" -> ack_yes),
webhook translation into canonical Meta envelopes, and end-to-end database RSVP
processing.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import EventAcknowledgment, OutboundMessage
from app.models.messaging import ACK_MAYBE, ACK_NO, ACK_PAYLOADS, ACK_YES
from app.whatsapp import openwa_webhook, templates
from app.whatsapp.openwa_provider import OpenWhatsAppProvider

SGT = timezone(timedelta(hours=8))


def test_openwa_render_template_body():
    payload = templates.event_invite(
        "6591234567",
        preferred_name="Alice",
        event_title="Coffee Morning",
        when_text="Mon 05 Oct 2026, 09:00am-11:00am",
        venue="Blk 209 Boon Lay",
    )
    rendered = OpenWhatsAppProvider.render_body(payload)

    assert "Hi Alice!" in rendered
    assert "Coffee Morning" in rendered
    assert "Blk 209 Boon Lay" in rendered
    assert "1 - Yes, I'll come" in rendered
    assert "2 - Can't make it" in rendered
    assert "3 - Maybe" in rendered


def test_openwa_render_text_body():
    payload = {"type": "text", "text": {"body": "Hello world"}}
    assert OpenWhatsAppProvider.render_body(payload) == "Hello world"


def test_openwa_send_success(monkeypatch):
    def fake_post(url, headers, json, timeout):
        assert json["chatId"] == "6591234567@c.us"
        assert "Coffee Morning" in json["text"]
        return httpx.Response(
            200,
            json={"id": "true_6591234567@c.us_3EB0123456789"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    provider = OpenWhatsAppProvider(base_url="http://fake-waha:3000", api_key="secret123")
    payload = templates.event_invite(
        "+6591234567",
        preferred_name="Alice",
        event_title="Coffee Morning",
        when_text="Mon 05 Oct 2026, 09:00am-11:00am",
        venue="Blk 209 Boon Lay",
    )
    result = provider.send(payload)

    assert result.ok is True
    assert result.provider_message_id == "true_6591234567@c.us_3EB0123456789"
    assert result.error is None


def test_openwa_send_error(monkeypatch):
    def fake_post(url, headers, json, timeout):
        return httpx.Response(
            500,
            text="Internal Server Error",
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    provider = OpenWhatsAppProvider(base_url="http://fake-waha:3000")
    payload = {"type": "text", "to": "6591234567", "text": {"body": "Test"}}
    result = provider.send(payload)

    assert result.ok is False
    assert "waha 500" in result.error


def test_openwa_text_ack_normalization():
    assert openwa_webhook.match_ack_response("1") == ACK_YES
    assert openwa_webhook.match_ack_response("yes") == ACK_YES
    assert openwa_webhook.match_ack_response("YES") == ACK_YES
    assert openwa_webhook.match_ack_response("Confirm") == ACK_YES
    assert openwa_webhook.match_ack_response("1. I will come") == ACK_YES

    assert openwa_webhook.match_ack_response("2") == ACK_NO
    assert openwa_webhook.match_ack_response("no") == ACK_NO
    assert openwa_webhook.match_ack_response("cannot") == ACK_NO
    assert openwa_webhook.match_ack_response("2 can't make it") == ACK_NO

    assert openwa_webhook.match_ack_response("3") == ACK_MAYBE
    assert openwa_webhook.match_ack_response("maybe") == ACK_MAYBE
    assert openwa_webhook.match_ack_response("tentative") == ACK_MAYBE

    assert openwa_webhook.match_ack_response("hello there") is None


def test_openwa_webhook_ignores_from_me():
    payload = {
        "event": "message",
        "payload": {
            "id": "true_6591234567@c.us_123",
            "fromMe": True,
            "body": "1",
        },
    }
    envelope = openwa_webhook.to_meta_envelope(payload)
    assert envelope["entry"] == []


def test_openwa_webhook_end_to_end_rsvp(client: TestClient, auth: dict, db):
    # 1. Register a person
    reg_res = client.post(
        "/api/register",
        json={
            "preferred_name": "Bob",
            "phone": "+6598765432",
            "consent_participation": True,
            "consent_whatsapp": True,
        },
    )
    assert reg_res.status_code == 200
    person_id = reg_res.json()["person"]["id"]

    # 2. Create an event
    starts = datetime(2026, 11, 10, 10, 0, tzinfo=SGT)
    event_res = client.post(
        "/api/events",
        json={
            "title": "Community Coffee",
            "kind": "community",
            "venue": "Blk 123 Jurong",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=2)).isoformat(),
            "capacity": 20,
        },
        headers=auth,
    )
    assert event_res.status_code == 201
    event_id = event_res.json()["id"]

    # 3. Queue an invite
    invite_res = client.post(
        f"/api/events/{event_id}/invite",
        json={"person_ids": [person_id], "send_now": True},
        headers=auth,
    )
    assert invite_res.status_code == 200

    outbound = db.scalar(
        select(OutboundMessage).where(
            OutboundMessage.person_id == person_id,
            OutboundMessage.event_id == event_id,
        )
    )
    assert outbound is not None
    outbound.provider_message_id = "msg_invite_12345"
    db.commit()

    # 4. Inbound webhook from WAHA: volunteer replies "1" (quoting the invite)
    waha_webhook_payload = {
        "event": "message",
        "session": "default",
        "payload": {
            "id": "false_6598765432@c.us_reply_111",
            "timestamp": 1700000000,
            "from": "6598765432@c.us",
            "fromMe": False,
            "body": "1",
            "replyTo": {
                "id": "msg_invite_12345",
            },
        },
    }

    post_res = client.post("/api/whatsapp/open/webhook", json=waha_webhook_payload)
    assert post_res.status_code == 200
    res_data = post_res.json()
    assert res_data["stored"] == 1
    assert res_data["acknowledged"] == 1

    ack = db.scalar(
        select(EventAcknowledgment).where(
            EventAcknowledgment.event_id == event_id,
            EventAcknowledgment.person_id == person_id,
        )
    )
    assert ack is not None
    assert ack.response == "yes"

    # 5. Volunteer changes mind: sends "2 - can't make it" (without quoting)
    waha_webhook_change = {
        "event": "message",
        "session": "default",
        "payload": {
            "id": "false_6598765432@c.us_reply_222",
            "timestamp": 1700000100,
            "from": "6598765432@c.us",
            "fromMe": False,
            "body": "2",
        },
    }
    post_res2 = client.post("/api/whatsapp/open/webhook", json=waha_webhook_change)
    assert post_res2.status_code == 200

    db.refresh(ack)
    assert ack.response == "no"
