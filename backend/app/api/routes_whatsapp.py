"""WhatsApp webhooks and admin session management.

Transports:
- Oracle Cloud persistent WhatsApp Web bridge
- Open WhatsApp (WAHA)
- Meta WhatsApp Cloud API
- Twilio WhatsApp channel
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.config import get_settings
from app.deps import CurrentStaff, DbSession
from app.models import OutboundMessage, Person, utcnow
from app.whatsapp import openwa_webhook, twilio_webhook, waha_webhook, webhook_handler
from app.whatsapp.oracle_client import OracleWhatsAppClient
from app.whatsapp.provider import waha_from_settings

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])

# Twilio logs a warning for any non-TwiML 200 on a messaging webhook. An empty
# Response element is the documented way to say "received, reply nothing".
EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'


def _twiml() -> Response:
    return Response(content=EMPTY_TWIML, media_type="application/xml")


# ---------------------------------------------------------------------------
# WhatsApp Admin Management (Oracle VM Session Connect, QR & Status)
# ---------------------------------------------------------------------------


@router.get("/admin/status")
def get_whatsapp_admin_status(user: CurrentStaff) -> dict[str, Any]:
    """Fetch live status of the WhatsApp session from the Oracle Cloud bridge."""
    client = OracleWhatsAppClient()
    return client.get_status()


@router.post("/admin/connect")
def connect_whatsapp_admin(user: CurrentStaff) -> dict[str, Any]:
    """Start the WhatsApp session or request a fresh pairing QR code."""
    client = OracleWhatsAppClient()
    return client.connect()


@router.post("/admin/disconnect")
def disconnect_whatsapp_admin(user: CurrentStaff) -> dict[str, Any]:
    """Disconnect session and remove profile to link a new WhatsApp account."""
    client = OracleWhatsAppClient()
    return client.disconnect()


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

    return webhook_handler.handle_payload(db, payload)


# ---------------------------------------------------------------------------
# Twilio
# ---------------------------------------------------------------------------


async def _validated_form(request: Request) -> dict[str, str]:
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
    params = await _validated_form(request)
    envelope = twilio_webhook.to_meta_envelope(params)
    webhook_handler.handle_payload(db, envelope)
    return _twiml()


@router.post("/twilio/status")
async def receive_twilio_status(request: Request, db: DbSession) -> Response:
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

    if event.get("event") == "message":
        message = envelope["entry"][0]["changes"][0]["value"]["messages"][0]
        known = db.scalar(
            select(Person.id).where(Person.phone_e164 == f"+{message['from']}")
        )
        if known is None:
            return {"ignored": 1}

    return webhook_handler.handle_payload(db, envelope)


# ---------------------------------------------------------------------------
# Open WhatsApp (WAHA / Baileys alternative)
# ---------------------------------------------------------------------------


@router.post("/open/webhook")
async def receive_open_whatsapp_webhook(
    request: Request, db: DbSession
) -> dict[str, object]:
    settings = get_settings()

    if settings.openwa_webhook_secret:
        provided = (
            request.headers.get("X-Webhook-Secret")
            or request.headers.get("X-Api-Key")
            or request.query_params.get("secret")
        )
        if provided != settings.openwa_webhook_secret:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="bad webhook secret"
            )

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="malformed JSON") from exc

    envelope = openwa_webhook.to_meta_envelope(payload)
    return webhook_handler.handle_payload(db, envelope)
