"""WhatsApp webhooks.

Three providers, three wire formats, one handler. Meta posts a signed JSON
envelope to ``/api/whatsapp/webhook``; Twilio posts form fields to
``/api/whatsapp/twilio/webhook`` and WAHA posts its own JSON events to
``/api/whatsapp/waha/webhook``. Both are rewritten into the Meta envelope so
:func:`app.whatsapp.webhook_handler.handle_payload` stays the only place that
knows what an acknowledgment means.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.config import get_settings
from app.deps import DbSession
from app.models import OutboundMessage, Person, utcnow
from app.whatsapp import twilio_webhook, waha_webhook, webhook_handler
from app.whatsapp.provider import waha_from_settings

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])

# Twilio logs a warning for any non-TwiML 200 on a messaging webhook. An empty
# Response element is the documented way to say "received, reply nothing".
EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'


def _twiml() -> Response:
    return Response(content=EMPTY_TWIML, media_type="application/xml")


# ---------------------------------------------------------------------------
# Meta WhatsApp Cloud API
# ---------------------------------------------------------------------------


@router.get("/webhook")
def verify_webhook(request: Request) -> Response:
    """Meta's subscription handshake."""
    settings = get_settings()
    params = request.query_params
    if (
        params.get("hub.mode") == "subscribe"
        and params.get("hub.verify_token") == settings.whatsapp_verify_token
    ):
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="verification failed")


@router.post("/webhook")
async def receive_webhook(request: Request, db: DbSession) -> dict[str, object]:
    settings = get_settings()

    # The signature covers the bytes exactly as sent. Parsing to JSON and
    # re-serialising produces different bytes and the HMAC will never match.
    raw = await request.body()

    if settings.whatsapp_app_secret:
        signature = request.headers.get("X-Hub-Signature-256")
        if not webhook_handler.verify_signature(
            raw, signature, settings.whatsapp_app_secret
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="bad signature"
            )

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="malformed JSON") from exc

    # Always 200 on a well-formed body: a non-200 makes Meta redeliver, and
    # redelivery of an already-processed message is pure noise.
    return webhook_handler.handle_payload(db, payload)


# ---------------------------------------------------------------------------
# Twilio
# ---------------------------------------------------------------------------


async def _validated_form(request: Request) -> dict[str, str]:
    """Parse the form and prove Twilio sent it.

    Refuses with 503 rather than 401 when no auth token is configured. The
    distinction matters: an unconfigured service must never be mistaken for a
    rejected caller, and validation is never skipped just because the key is
    missing.
    """
    settings = get_settings()
    if not settings.twilio_auth_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CU_TWILIO_AUTH_TOKEN is not configured; webhook cannot be verified",
        )

    form = await request.form()
    params = {key: str(value) for key, value in form.items()}

    url = twilio_webhook.public_url(
        scheme=request.url.scheme,
        netloc=request.url.netloc,
        path=request.url.path,
        query=request.url.query,
        headers={k.lower(): v for k, v in request.headers.items()},
        configured=settings.twilio_webhook_url,
    )
    if not twilio_webhook.verify_signature(
        url, params, request.headers.get("X-Twilio-Signature"), settings.twilio_auth_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="bad twilio signature"
        )
    return params


@router.post("/twilio/webhook")
async def receive_twilio_webhook(request: Request, db: DbSession) -> Response:
    """Inbound message or quick-reply button press from Twilio."""
    params = await _validated_form(request)
    envelope = twilio_webhook.to_meta_envelope(params)
    webhook_handler.handle_payload(db, envelope)
    # Always 200 on a validated body, for the same reason as Meta: Twilio
    # retries on a non-2xx and the replay is absorbed anyway.
    return _twiml()


@router.post("/twilio/status")
async def receive_twilio_status(request: Request, db: DbSession) -> Response:
    """Delivery receipt. Moves an outbound row forward, never backwards."""
    params = await _validated_form(request)

    message_sid = params.get("MessageSid") or params.get("SmsSid")
    twilio_status = params.get("MessageStatus") or params.get("SmsStatus") or ""
    if not message_sid or not twilio_status:
        return _twiml()

    message = db.scalar(
        select(OutboundMessage).where(
            OutboundMessage.provider_message_id == message_sid
        )
    )
    if message is None:
        # A receipt for something this database never queued - a message sent
        # from the Twilio console, say. Nothing to record.
        return _twiml()

    new_status = twilio_webhook.advance_status(message.status, twilio_status)
    if new_status is not None:
        message.status = new_status
        if new_status == "failed":
            message.error = (
                f"twilio {params.get('ErrorCode', '')}: "
                f"{params.get('ErrorMessage', twilio_status)}"
            ).strip()
        elif message.sent_at is None:
            message.sent_at = utcnow()
        db.commit()

    return _twiml()


# ---------------------------------------------------------------------------
# WAHA (linked-device bridge)
# ---------------------------------------------------------------------------


@router.post("/waha/webhook")
async def receive_waha_webhook(request: Request, db: DbSession) -> dict[str, object]:
    """A poll vote or an inbound message from the WAHA container.

    Like Twilio, an unconfigured HMAC key is a 503, never a pass: this URL is
    public and an unsigned body could otherwise record acknowledgments for
    anyone.
    """
    settings = get_settings()
    if not settings.waha_webhook_hmac_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CU_WAHA_WEBHOOK_HMAC_KEY is not configured; webhook cannot be verified",
        )

    raw = await request.body()
    if not waha_webhook.verify_signature(
        raw,
        request.headers.get("X-Webhook-Hmac"),
        settings.waha_webhook_hmac_key,
        request.headers.get("X-Webhook-Hmac-Algorithm"),
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="bad waha signature"
        )

    try:
        event = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="malformed JSON") from exc
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="expected a JSON object")

    def resolve_wa_id(sender: str, poll_key: str | None) -> str | None:
        wa_id = waha_webhook.wa_id_from_chat_id(sender)
        if wa_id:
            return wa_id
        # An @lid voter. The poll went to exactly one person in a 1:1 chat,
        # and the operator's own votes are already dropped, so the outbound
        # row names the voter without a network call.
        if poll_key:
            outbound = db.scalar(
                select(OutboundMessage).where(
                    OutboundMessage.provider_message_id == poll_key
                )
            )
            if outbound is not None:
                return outbound.to_wa_id
        if sender.endswith("@lid") and settings.waha_base_url:
            return waha_from_settings().phone_for_lid(sender)
        return None

    envelope = waha_webhook.to_meta_envelope(event, resolve_wa_id=resolve_wa_id)
    if envelope is None:
        return {"ignored": 1}

    # The number is also someone's personal phone. Chat from anyone who is
    # not a registered person is none of this database's business, so it is
    # dropped before anything is stored.
    if event.get("event") == "message":
        message = envelope["entry"][0]["changes"][0]["value"]["messages"][0]
        known = db.scalar(
            select(Person.id).where(Person.phone_e164 == f"+{message['from']}")
        )
        if known is None:
            return {"ignored": 1}

    # Always 200 on a verified body: WAHA retries a non-2xx up to 15 times,
    # and a replay is absorbed by the inbound dedupe anyway.
    return webhook_handler.handle_payload(db, envelope)
