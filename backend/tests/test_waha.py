"""WAHA transport: invites as polls, poll votes as acknowledgments.

All offline. Sends go through a stubbed ``httpx.post``; inbound events are
posted to the real route, signed the way WAHA signs them.
"""

from __future__ import annotations

import hashlib
import hmac
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.models import EventAcknowledgment, InboundMessage, OutboundMessage
from app.models.messaging import ACK_NO, ACK_YES
from app.whatsapp import templates, waha_webhook
from app.whatsapp.provider import POLL_QUESTION_MAX, WahaProvider

from tests.test_whatsapp import invite, make_event, register

HMAC_KEY = "test-waha-hmac"


def invite_payload(**overrides) -> dict:
    kwargs = {
        "preferred_name": "Ah Huat",
        "event_title": "Community coffee morning",
        "when_text": "Mon 05 Oct 2026, 09:00am-11:00am",
        "venue": "Blk 209 Boon Lay",
    }
    kwargs.update(overrides)
    return templates.event_invite("6591230001", **kwargs)


# --------------------------------------------------------------------------
# outbound translation
# --------------------------------------------------------------------------


def test_invite_becomes_a_single_choice_poll() -> None:
    requests = WahaProvider(base_url="http://waha:3000").build_requests(invite_payload())

    assert len(requests) == 1
    path, body = requests[0]
    assert path == "/api/sendPoll"
    assert body["session"] == "default"
    assert body["chatId"] == "6591230001@c.us"
    assert body["poll"]["multipleAnswers"] is False
    assert body["poll"]["options"] == ["Yes, I'll come", "Can't make it", "Maybe"]
    question = body["poll"]["name"]
    assert "Ah Huat" in question
    assert "Community coffee morning" in question
    assert "Blk 209 Boon Lay" in question


def test_a_long_invite_sends_details_first_and_a_short_poll() -> None:
    """WAHA rejects a poll question over 255 characters."""
    requests = WahaProvider(base_url="http://waha:3000").build_requests(
        invite_payload(venue="Very long venue name " * 20)
    )

    assert [path for path, _ in requests] == ["/api/sendText", "/api/sendPoll"]
    assert "Very long venue name" in requests[0][1]["text"]
    assert len(requests[1][1]["poll"]["name"]) <= POLL_QUESTION_MAX


def test_free_text_becomes_send_text() -> None:
    requests = WahaProvider(base_url="http://waha:3000").build_requests(
        templates.free_text("6591230001", "  See you there  ")
    )
    assert requests == [
        ("/api/sendText", {"session": "default", "chatId": "6591230001@c.us", "text": "See you there"})
    ]


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({"type": "text", "text": {"body": "x"}}, "no recipient"),
        ({"to": "65", "type": "text", "text": {"body": "  "}}, "empty body"),
        ({"to": "65", "type": "image"}, "unsupported payload type"),
        ({"to": "65", "type": "template", "template": {"name": "other"}}, "no WAHA rendering"),
    ],
)
def test_unsendable_payloads_are_reported_not_sent(payload, expected, monkeypatch) -> None:
    def fail(*args, **kwargs):
        raise AssertionError("nothing should be posted")

    monkeypatch.setattr(httpx, "post", fail)
    result = WahaProvider(base_url="http://waha:3000").send(payload)
    assert not result.ok
    assert expected in result.error


def test_waha_provider_requires_a_base_url() -> None:
    with pytest.raises(RuntimeError, match="CU_WAHA_BASE_URL"):
        WahaProvider(base_url="")


def test_send_stores_the_bare_key_id_and_paces_itself(monkeypatch) -> None:
    posted: list[tuple[str, dict, dict]] = []

    def fake_post(url, *, headers, json, timeout):
        posted.append((url, headers, json))
        return httpx.Response(
            201,
            json={"id": f"true_6591230001@c.us_3EB0POLL{len(posted)}"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    pauses: list[float] = []
    provider = WahaProvider(
        base_url="http://waha:3000/",
        api_key="secret",
        send_interval_seconds=2.5,
        sleep=pauses.append,
    )

    first = provider.send(invite_payload())
    second = provider.send(invite_payload())

    assert first.ok and first.provider_message_id == "3EB0POLL1"
    assert second.provider_message_id == "3EB0POLL2"
    assert posted[0][0] == "http://waha:3000/api/sendPoll"
    assert posted[0][1] == {"X-Api-Key": "secret"}
    # No pause before the first send, one before every send after it.
    assert pauses == [2.5]


def test_send_reports_a_waha_error(monkeypatch) -> None:
    monkeypatch.setattr(
        httpx,
        "post",
        lambda url, **kw: httpx.Response(
            422, text="session not WORKING", request=httpx.Request("POST", url)
        ),
    )
    result = WahaProvider(base_url="http://waha:3000").send(invite_payload())
    assert not result.ok
    assert "422" in result.error


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"id": "true_6591230001@c.us_3EB0AAA"}, "3EB0AAA"),
        ({"id": {"_serialized": "true_6591230001@c.us_3EB0BBB", "fromMe": True}}, "3EB0BBB"),
        ({"key": {"id": "3EB0CCC", "remoteJid": "6591230001@s.whatsapp.net"}}, "3EB0CCC"),
        ({"id": "true_120363@g.us_3EB0DDD_6591230001@c.us"}, "3EB0DDD"),
        ({}, None),
    ],
)
def test_sent_message_id_across_engines(body, expected) -> None:
    assert waha_webhook.sent_message_id(body) == expected


# --------------------------------------------------------------------------
# signatures and translation
# --------------------------------------------------------------------------


def test_signature_is_sha512_hex_over_raw_bytes() -> None:
    raw = b'{"event":"poll.vote"}'
    expected = hmac.new(HMAC_KEY.encode(), raw, hashlib.sha512).hexdigest()
    assert waha_webhook.verify_signature(raw, expected, HMAC_KEY, "sha512")
    assert waha_webhook.verify_signature(raw, expected, HMAC_KEY, None)
    assert not waha_webhook.verify_signature(raw + b" ", expected, HMAC_KEY)
    assert not waha_webhook.verify_signature(raw, expected, "other-key")
    assert not waha_webhook.verify_signature(raw, None, HMAC_KEY)
    assert not waha_webhook.verify_signature(raw, expected, "")
    assert not waha_webhook.verify_signature(raw, expected, HMAC_KEY, "md5")


def test_chat_ids() -> None:
    assert waha_webhook.chat_id("+6591230001") == "6591230001@c.us"
    assert waha_webhook.wa_id_from_chat_id("6591230001@c.us") == "6591230001"
    assert waha_webhook.wa_id_from_chat_id("6591230001@s.whatsapp.net") == "6591230001"
    assert waha_webhook.wa_id_from_chat_id("6591230001:12@s.whatsapp.net") == "6591230001"
    assert waha_webhook.wa_id_from_chat_id("123456789012345@lid") is None


def vote_event(
    *,
    poll_id: str,
    voter: str = "6591230101@c.us",
    options: list[str] | None = None,
    vote_id: str = "false_6591230101@c.us_3EB0VOTE1",
    timestamp: int = 1_790_000_000_000,
    from_me: bool = False,
) -> dict:
    return {
        "id": "evt_01aaaaaaaaaaaaaaaaaaaaaaaa",
        "timestamp": timestamp,
        "session": "default",
        "engine": "GOWS",
        "event": "poll.vote",
        "payload": {
            "vote": {
                "id": vote_id,
                "from": voter,
                "to": "6598765432@c.us",
                "fromMe": from_me,
                "selectedOptions": ["Yes, I'll come"] if options is None else options,
                "timestamp": timestamp,
            },
            "poll": {
                "id": f"true_{voter}_{poll_id}",
                "to": voter,
                "from": "6598765432@c.us",
                "fromMe": True,
            },
            "_data": {"large": "engine blob"},
        },
    }


def test_vote_translates_to_a_button_reply() -> None:
    envelope = waha_webhook.to_meta_envelope(
        vote_event(poll_id="3EB0POLL"), resolve_wa_id=lambda s, p: "6591230101"
    )
    message = envelope["entry"][0]["changes"][0]["value"]["messages"][0]
    assert message["type"] == "button"
    assert message["button"]["payload"] == ACK_YES
    assert message["context"] == {"id": "3EB0POLL"}
    assert message["from"] == "6591230101"
    # Votes are in milliseconds; the handler expects whole seconds.
    assert message["timestamp"] == "1790000000"
    assert "_data" not in message["waha"]["payload"]


@pytest.mark.parametrize(
    "event",
    [
        vote_event(poll_id="P", from_me=True),
        vote_event(poll_id="P", voter="120363000000@g.us"),
        {"event": "message", "payload": {"id": "x", "from": "6591230101@c.us", "fromMe": True, "body": "hi"}},
        {"event": "message", "payload": {"id": "x", "from": "status@broadcast", "body": "hi"}},
        {"event": "session.status", "payload": {"status": "WORKING"}},
    ],
)
def test_irrelevant_events_are_ignored(event) -> None:
    assert waha_webhook.to_meta_envelope(event, resolve_wa_id=lambda s, p: "65") is None


def test_a_changed_vote_gets_a_new_inbound_id_and_a_replay_does_not() -> None:
    def message_id(event: dict) -> str:
        envelope = waha_webhook.to_meta_envelope(event, resolve_wa_id=lambda s, p: "65")
        return envelope["entry"][0]["changes"][0]["value"]["messages"][0]["id"]

    first = message_id(vote_event(poll_id="P"))
    assert message_id(vote_event(poll_id="P")) == first
    assert message_id(vote_event(poll_id="P", options=["Can't make it"])) != first


# --------------------------------------------------------------------------
# inbound webhook, end to end
# --------------------------------------------------------------------------


@pytest.fixture
def waha_hmac(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "waha_webhook_hmac_key", HMAC_KEY, raising=False)
    monkeypatch.setattr(settings, "waha_base_url", "", raising=False)
    return settings


def post_waha(client: TestClient, event: dict, *, key: str = HMAC_KEY):
    raw = json.dumps(event).encode("utf-8")
    return client.post(
        "/api/whatsapp/waha/webhook",
        content=raw,
        headers={
            "content-type": "application/json",
            "X-Webhook-Hmac": waha_webhook.compute_signature(raw, key),
            "X-Webhook-Hmac-Algorithm": "sha512",
        },
    )


def invited_poll_id(db) -> str:
    db.expire_all()
    return db.scalar(select(OutboundMessage)).provider_message_id


def test_a_vote_records_an_acknowledgment(client: TestClient, auth, db, waha_hmac) -> None:
    person_id = register(client, "Mary", "91230101")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [person_id])

    response = post_waha(client, vote_event(poll_id=invited_poll_id(db)))
    assert response.status_code == 200, response.text
    assert response.json()["acknowledged"] == 1

    db.expire_all()
    ack = db.scalar(select(EventAcknowledgment))
    assert (ack.event_id, ack.person_id, ack.response) == (event_id, person_id, "yes")


def test_a_change_of_vote_wins(client: TestClient, auth, db, waha_hmac) -> None:
    person_id = register(client, "Mary", "91230101")
    invite(client, auth, make_event(client, auth), [person_id])
    poll_id = invited_poll_id(db)

    post_waha(client, vote_event(poll_id=poll_id))
    post_waha(
        client,
        vote_event(
            poll_id=poll_id,
            options=["Can't make it"],
            vote_id="false_6591230101@c.us_3EB0VOTE2",
            timestamp=1_790_000_005_000,
        ),
    )

    db.expire_all()
    assert db.scalar(select(EventAcknowledgment)).response == "no"


def test_a_retracted_vote_leaves_the_answer_alone(
    client: TestClient, auth, db, waha_hmac
) -> None:
    person_id = register(client, "Mary", "91230101")
    invite(client, auth, make_event(client, auth), [person_id])
    poll_id = invited_poll_id(db)

    post_waha(client, vote_event(poll_id=poll_id))
    post_waha(client, vote_event(poll_id=poll_id, options=[], timestamp=1_790_000_009_000))

    db.expire_all()
    assert db.scalar(select(EventAcknowledgment)).response == "yes"


def test_an_lid_voter_is_resolved_through_the_poll(
    client: TestClient, auth, db, waha_hmac
) -> None:
    """Privacy ids are not phone numbers; the poll's outbound row is."""
    person_id = register(client, "Mary", "91230101")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [person_id])

    response = post_waha(
        client,
        vote_event(poll_id=invited_poll_id(db), voter="123456789012345@lid"),
    )
    assert response.json()["acknowledged"] == 1

    db.expire_all()
    assert db.scalar(select(EventAcknowledgment)).person_id == person_id


def test_redelivery_is_absorbed(client: TestClient, auth, db, waha_hmac) -> None:
    person_id = register(client, "Mary", "91230101")
    invite(client, auth, make_event(client, auth), [person_id])
    event = vote_event(poll_id=invited_poll_id(db), options=["Can't make it"])

    assert post_waha(client, event).json()["acknowledged"] == 1
    assert post_waha(client, event).json()["duplicates"] == 1


def test_chat_from_strangers_is_never_stored(client: TestClient, db, waha_hmac) -> None:
    """The number is also a personal phone."""
    response = post_waha(
        client,
        {
            "event": "message",
            "payload": {
                "id": "false_6590000000@c.us_3EB0CHAT",
                "from": "6590000000@c.us",
                "fromMe": False,
                "body": "dinner tonight?",
                "timestamp": 1_790_000_000,
            },
        },
    )
    assert response.json() == {"ignored": 1}
    assert db.scalar(select(InboundMessage)) is None


def test_messages_from_registered_people_are_stored(
    client: TestClient, db, waha_hmac
) -> None:
    register(client, "Mary", "91230101")
    post_waha(
        client,
        {
            "event": "message",
            "payload": {
                "id": "false_6591230101@c.us_3EB0TEXT",
                "from": "6591230101@c.us",
                "fromMe": False,
                "body": "what should I bring?",
                "timestamp": 1_790_000_000,
            },
        },
    )
    db.expire_all()
    inbound = db.scalar(select(InboundMessage))
    assert inbound.text_body == "what should I bring?"
    assert inbound.from_wa_id == "6591230101"


def test_a_bad_signature_is_refused(client: TestClient, waha_hmac) -> None:
    response = post_waha(client, vote_event(poll_id="P"), key="wrong-key")
    assert response.status_code == 401


def test_an_unconfigured_key_refuses_rather_than_accepts(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(get_settings(), "waha_webhook_hmac_key", "", raising=False)
    response = post_waha(client, vote_event(poll_id="P"))
    assert response.status_code == 503


def test_an_ack_no_label_round_trips() -> None:
    assert waha_webhook.ack_for_option(templates.ACK_BUTTON_LABELS[ACK_NO]) == ACK_NO
    assert waha_webhook.ack_for_option("  can't   MAKE it ") == ACK_NO
    assert waha_webhook.ack_for_option("Perhaps") is None


def test_a_bare_host_port_base_url_gets_a_scheme(monkeypatch) -> None:
    """Render's fromService hostport has no scheme."""
    seen: list[str] = []

    def fake_post(url, **kwargs):
        seen.append(url)
        return httpx.Response(201, json={}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    WahaProvider(base_url="cu-os-waha:3000").send(invite_payload())
    assert seen == ["http://cu-os-waha:3000/api/sendPoll"]
