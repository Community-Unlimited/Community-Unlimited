"""Twilio transport: payload translation, signature checking, inbound replies.

All offline. The point of these tests is the seam - a Meta-shaped body going
out becomes Twilio form fields, and Twilio form fields coming back become the
same envelope the Meta handler already knows how to process.
"""

from __future__ import annotations

import base64
import hashlib
import hmac

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.models import EventAcknowledgment, InboundMessage, OutboundMessage
from app.models.messaging import ACK_YES
from app.whatsapp import templates, twilio_webhook
from app.whatsapp.provider import TwilioProvider, channel_address, content_variables

from tests.test_whatsapp import invite, make_event, register

AUTH_TOKEN = "test-auth-token"
WEBHOOK_URL = "https://cu-os.example.org/api/whatsapp/twilio/webhook"
STATUS_URL = "https://cu-os.example.org/api/whatsapp/twilio/status"


# --------------------------------------------------------------------------
# outbound translation
# --------------------------------------------------------------------------


def make_provider(**overrides) -> TwilioProvider:
    kwargs = {
        "account_sid": "AC" + "0" * 32,
        "whatsapp_from": "whatsapp:+14155238886",
        "auth_token": AUTH_TOKEN,
        "content_sid_event_invite": "HXpinnedtemplatesid",
    }
    kwargs.update(overrides)
    return TwilioProvider(**kwargs)


def test_channel_address_accepts_either_form() -> None:
    assert channel_address("6591230001") == "whatsapp:+6591230001"
    assert channel_address("+6591230001") == "whatsapp:+6591230001"
    assert channel_address("whatsapp:+6591230001") == "whatsapp:+6591230001"


def test_template_body_becomes_content_variables() -> None:
    payload = templates.event_invite(
        "6591230001",
        preferred_name="Ah Huat",
        event_title="Community coffee morning",
        when_text="Mon 05 Oct 2026, 9:00am-11:00am",
        venue="Blk 209 Boon Lay",
    )
    assert content_variables(payload["template"]) == {
        "1": "Ah Huat",
        "2": "Community coffee morning",
        "3": "Mon 05 Oct 2026, 9:00am-11:00am",
        "4": "Blk 209 Boon Lay",
    }


def test_invite_translates_to_a_twilio_request() -> None:
    """The Meta body the outbox stores must post as ContentSid + variables."""
    payload = templates.event_invite(
        "6591230001",
        preferred_name="Ah Huat",
        event_title="Community coffee morning",
        when_text="Mon 05 Oct 2026, 9:00am-11:00am",
        venue="Blk 209 Boon Lay",
    )
    request = make_provider().build_request(payload)

    assert request["From"] == "whatsapp:+14155238886"
    assert request["To"] == "whatsapp:+6591230001"
    # Pinned, so no network lookup is needed here.
    assert request["ContentSid"] == "HXpinnedtemplatesid"
    assert '"1": "Ah Huat"' in request["ContentVariables"]
    assert '"4": "Blk 209 Boon Lay"' in request["ContentVariables"]
    # Button payloads live in the Twilio template, not the send.
    assert "ack_yes" not in request["ContentVariables"]


def test_free_text_translates_to_a_body() -> None:
    request = make_provider().build_request(
        templates.free_text("6591230001", "See you tomorrow")
    )
    assert request["Body"] == "See you tomorrow"
    assert "ContentSid" not in request


def test_status_callback_is_attached_only_when_configured() -> None:
    payload = templates.free_text("6591230001", "hi")
    assert "StatusCallback" not in make_provider().build_request(payload)
    with_callback = make_provider(status_callback_url=STATUS_URL)
    assert with_callback.build_request(payload)["StatusCallback"] == STATUS_URL


@pytest.mark.parametrize(
    "payload, expected",
    [
        ({"type": "text", "text": {"body": "hi"}}, "no recipient"),
        ({"to": "6591230001", "type": "image"}, "unsupported payload type"),
        ({"to": "6591230001", "type": "text", "text": {"body": "  "}}, "empty body"),
    ],
)
def test_unsendable_payloads_are_reported_not_sent(payload, expected) -> None:
    """A shape Twilio cannot express must fail loudly.

    The alternative - posting a message with no body - delivers a blank
    WhatsApp message to a real person and still looks like success.
    """
    result = make_provider().send(payload)
    assert result.ok is False
    assert expected in result.error


def test_api_key_is_preferred_over_the_auth_token() -> None:
    provider = make_provider(api_key_sid="SK123", api_key_secret="secret")
    assert provider._auth == ("SK123", "secret")
    assert make_provider()._auth == ("AC" + "0" * 32, AUTH_TOKEN)


def test_twilio_provider_requires_a_sender() -> None:
    with pytest.raises(RuntimeError, match="CU_TWILIO_WHATSAPP_FROM"):
        make_provider(whatsapp_from="")


def test_twilio_provider_requires_some_credential() -> None:
    with pytest.raises(RuntimeError, match="CU_TWILIO_AUTH_TOKEN"):
        make_provider(auth_token="")


# --------------------------------------------------------------------------
# signature
# --------------------------------------------------------------------------


def test_signed_string_matches_twilios_documented_example() -> None:
    """Pin the concatenation against Twilio's own worked example.

    Ordering and the absence of separators are the parts that are easy to get
    subtly wrong and impossible to debug from a 401.
    """
    url = "https://example.com/myapp?foo=1&bar=2"
    params = {
        "CallSid": "CA1234567890ABCDE",
        "Caller": "+14158675310",
        "Digits": "1234",
        "From": "+14158675310",
        "To": "+18005551212",
    }
    expected_string = (
        "https://example.com/myapp?foo=1&bar=2"
        "CallSidCA1234567890ABCDECaller+14158675310Digits1234"
        "From+14158675310To+18005551212"
    )
    expected = base64.b64encode(
        hmac.new(b"token", expected_string.encode("utf-8"), hashlib.sha1).digest()
    ).decode("ascii")
    assert twilio_webhook.compute_signature(url, params, "token") == expected


def test_signature_is_independent_of_dict_order() -> None:
    params = {"B": "2", "A": "1", "C": "3"}
    reordered = {"C": "3", "A": "1", "B": "2"}
    url = "https://example.org/hook"
    assert twilio_webhook.compute_signature(
        url, params, "t"
    ) == twilio_webhook.compute_signature(url, reordered, "t")


def test_tampered_params_fail_verification() -> None:
    url = "https://example.org/hook"
    params = {"Body": "yes"}
    signature = twilio_webhook.compute_signature(url, params, "t")
    assert twilio_webhook.verify_signature(url, params, signature, "t")
    assert not twilio_webhook.verify_signature(url, {"Body": "no"}, signature, "t")
    assert not twilio_webhook.verify_signature(url, params, signature, "other-token")
    assert not twilio_webhook.verify_signature(
        "https://evil.example/hook", params, signature, "t"
    )


def test_missing_signature_or_token_never_passes() -> None:
    assert not twilio_webhook.verify_signature("u", {}, None, "t")
    assert not twilio_webhook.verify_signature("u", {}, "", "t")
    assert not twilio_webhook.verify_signature("u", {}, "abc", "")


def test_configured_url_wins_over_the_request() -> None:
    assert (
        twilio_webhook.public_url(
            scheme="http",
            netloc="internal:8010",
            path="/api/whatsapp/twilio/webhook",
            query="",
            headers={},
            configured=WEBHOOK_URL,
        )
        == WEBHOOK_URL
    )


def test_forwarded_headers_restore_the_public_scheme() -> None:
    """Behind a TLS proxy the request looks like http; Twilio signed https."""
    assert twilio_webhook.public_url(
        scheme="http",
        netloc="10.0.0.4:8010",
        path="/api/whatsapp/twilio/webhook",
        query="",
        headers={
            "x-forwarded-proto": "https",
            "x-forwarded-host": "cu-os.example.org",
            "host": "10.0.0.4:8010",
        },
    ) == WEBHOOK_URL


def test_forwarded_header_lists_take_the_first_hop() -> None:
    assert twilio_webhook.public_url(
        scheme="http",
        netloc="internal",
        path="/hook",
        query="a=1",
        headers={"x-forwarded-proto": "https, http", "x-forwarded-host": "pub.example"},
    ) == "https://pub.example/hook?a=1"


# --------------------------------------------------------------------------
# inbound webhook
# --------------------------------------------------------------------------


@pytest.fixture
def twilio_auth(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "twilio_auth_token", AUTH_TOKEN, raising=False)
    monkeypatch.setattr(settings, "twilio_webhook_url", WEBHOOK_URL, raising=False)
    return settings


def post_twilio(client: TestClient, params: dict[str, str], *, url: str = WEBHOOK_URL, path: str = "/api/whatsapp/twilio/webhook"):
    signature = twilio_webhook.compute_signature(url, params, AUTH_TOKEN)
    return client.post(path, data=params, headers={"X-Twilio-Signature": signature})


def sent_invite_sid(db) -> str:
    db.expire_all()
    message = db.scalar(select(OutboundMessage))
    return message.provider_message_id


def test_button_press_records_an_acknowledgment(
    client: TestClient, auth, db, twilio_auth
) -> None:
    person_id = register(client, "Mary", "91230101")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [person_id])

    response = post_twilio(
        client,
        {
            "MessageSid": "SM0000000000000000000000000000001",
            "From": "whatsapp:+6591230101",
            "To": "whatsapp:+14155238886",
            "WaId": "6591230101",
            "ProfileName": "Mary",
            "Body": "Yes, I'll come",
            "ButtonText": "Yes, I'll come",
            "ButtonPayload": ACK_YES,
            "OriginalRepliedMessageSid": sent_invite_sid(db),
        },
    )
    assert response.status_code == 200
    assert "<Response>" in response.text

    db.expire_all()
    ack = db.scalar(select(EventAcknowledgment))
    assert ack is not None
    assert ack.response == "yes"
    assert ack.event_id == event_id
    assert ack.person_id == person_id


def test_inbound_keeps_the_raw_twilio_fields(
    client: TestClient, auth, db, twilio_auth
) -> None:
    """The original form fields have to survive for debugging."""
    register(client, "Mary", "91230102")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [1])

    post_twilio(
        client,
        {
            "MessageSid": "SM0000000000000000000000000000002",
            "From": "whatsapp:+6591230102",
            "To": "whatsapp:+14155238886",
            "WaId": "6591230102",
            "ButtonPayload": ACK_YES,
            "Body": "Yes, I'll come",
        },
    )

    db.expire_all()
    inbound = db.scalar(select(InboundMessage))
    assert inbound.raw["twilio"]["MessageSid"] == "SM0000000000000000000000000000002"
    assert inbound.from_wa_id == "6591230102"
    assert inbound.button_payload == ACK_YES


def test_redelivery_is_absorbed(client: TestClient, auth, db, twilio_auth) -> None:
    """Twilio retries on a non-2xx; the UNIQUE message id makes it a no-op."""
    register(client, "Mary", "91230103")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [1])

    params = {
        "MessageSid": "SM0000000000000000000000000000003",
        "From": "whatsapp:+6591230103",
        "To": "whatsapp:+14155238886",
        "WaId": "6591230103",
        "ButtonPayload": ACK_YES,
    }
    assert post_twilio(client, params).status_code == 200
    assert post_twilio(client, params).status_code == 200

    db.expire_all()
    assert len(list(db.scalars(select(InboundMessage)))) == 1


def test_plain_text_reply_is_stored_without_an_acknowledgment(
    client: TestClient, auth, db, twilio_auth
) -> None:
    register(client, "Chatty", "91230104")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [1])

    post_twilio(
        client,
        {
            "MessageSid": "SM0000000000000000000000000000004",
            "From": "whatsapp:+6591230104",
            "To": "whatsapp:+14155238886",
            "WaId": "6591230104",
            "Body": "sorry who is this",
        },
    )

    db.expire_all()
    inbound = db.scalar(select(InboundMessage))
    assert inbound.kind == "text"
    assert inbound.text_body == "sorry who is this"
    assert db.scalar(select(EventAcknowledgment)) is None


def test_bad_signature_is_rejected(client: TestClient, twilio_auth) -> None:
    response = client.post(
        "/api/whatsapp/twilio/webhook",
        data={"MessageSid": "SM1", "From": "whatsapp:+6591230105"},
        headers={"X-Twilio-Signature": "not-the-signature"},
    )
    assert response.status_code == 401


def test_unsigned_request_is_rejected(client: TestClient, twilio_auth) -> None:
    response = client.post(
        "/api/whatsapp/twilio/webhook", data={"MessageSid": "SM1"}
    )
    assert response.status_code == 401


def test_webhook_refuses_when_no_auth_token_is_configured(
    client: TestClient, monkeypatch
) -> None:
    """503, not 401: an unconfigured service is not a rejected caller, and
    validation is never skipped just because the key is missing."""
    monkeypatch.setattr(get_settings(), "twilio_auth_token", "", raising=False)
    response = client.post(
        "/api/whatsapp/twilio/webhook",
        data={"MessageSid": "SM1"},
        headers={"X-Twilio-Signature": "anything"},
    )
    assert response.status_code == 503


# --------------------------------------------------------------------------
# delivery receipts
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "current, twilio_status, expected",
    [
        ("sent", "delivered", "delivered"),
        ("delivered", "read", "read"),
        ("sent", "read", "read"),
        # Out-of-order callbacks must not walk a message backwards.
        ("read", "delivered", None),
        ("read", "sent", None),
        ("delivered", "delivered", None),
        # Failure is terminal and always wins.
        ("sent", "failed", "failed"),
        ("read", "undelivered", "failed"),
        ("failed", "delivered", None),
        ("cancelled", "delivered", None),
        ("sent", "something-new", None),
    ],
)
def test_delivery_receipts_only_move_forward(current, twilio_status, expected) -> None:
    assert twilio_webhook.advance_status(current, twilio_status) == expected


def post_status(client: TestClient, params: dict[str, str], monkeypatch):
    monkeypatch.setattr(
        get_settings(), "twilio_webhook_url", STATUS_URL, raising=False
    )
    signature = twilio_webhook.compute_signature(STATUS_URL, params, AUTH_TOKEN)
    return client.post(
        "/api/whatsapp/twilio/status",
        data=params,
        headers={"X-Twilio-Signature": signature},
    )


def test_status_callback_updates_the_outbound_row(
    client: TestClient, auth, db, twilio_auth, monkeypatch
) -> None:
    register(client, "Mary", "91230106")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [1])
    sid = sent_invite_sid(db)

    response = post_status(
        client, {"MessageSid": sid, "MessageStatus": "delivered"}, monkeypatch
    )
    assert response.status_code == 200

    db.expire_all()
    assert db.scalar(select(OutboundMessage)).status == "delivered"


def test_status_callback_records_a_failure_reason(
    client: TestClient, auth, db, twilio_auth, monkeypatch
) -> None:
    register(client, "Mary", "91230107")
    event_id = make_event(client, auth)
    invite(client, auth, event_id, [1])
    sid = sent_invite_sid(db)

    post_status(
        client,
        {
            "MessageSid": sid,
            "MessageStatus": "failed",
            "ErrorCode": "63016",
            "ErrorMessage": "outside the session window",
        },
        monkeypatch,
    )

    db.expire_all()
    message = db.scalar(select(OutboundMessage))
    assert message.status == "failed"
    assert "63016" in message.error


def test_status_callback_for_an_unknown_message_is_ignored(
    client: TestClient, twilio_auth, monkeypatch
) -> None:
    response = post_status(
        client, {"MessageSid": "SMunknown", "MessageStatus": "delivered"}, monkeypatch
    )
    assert response.status_code == 200
