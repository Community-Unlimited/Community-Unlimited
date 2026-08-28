"""Offline development helpers.

These exist so the whole WhatsApp round trip - invite out, button press back,
acknowledgment recorded - can be exercised with no Meta account. The simulator
builds a Cloud-API-shaped envelope, signs it, and pushes it through the *same*
:func:`app.whatsapp.webhook_handler.handle_payload` the live route uses, so
passing here means the real path works too.

Disabled automatically whenever a real provider is configured.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.config import get_settings
from app.deps import DbSession
from app.models import OutboundMessage, Person, utcnow
from app.models.messaging import ACK_MAYBE, ACK_NO, ACK_YES
from app.schemas import SimulateReplyRequest
from app.whatsapp import outbox, webhook_handler
from app.whatsapp.provider import get_fake_provider

router = APIRouter(prefix="/api/dev", tags=["dev"])

_PAYLOAD_FOR = {"yes": ACK_YES, "no": ACK_NO, "maybe": ACK_MAYBE}


def _guard_dev_only() -> None:
    if get_settings().whatsapp_provider != "fake":
        raise HTTPException(
            status_code=404,
            detail="dev endpoints are disabled when a real WhatsApp provider is configured",
        )


@router.post("/simulate-reply")
def simulate_reply(payload: SimulateReplyRequest, db: DbSession) -> dict[str, object]:
    """Replay a quick-reply button press as if Meta had delivered it."""
    _guard_dev_only()

    person = db.scalar(select(Person).where(Person.phone_e164 == payload.phone))
    if person is None:
        raise HTTPException(status_code=404, detail=f"no person with {payload.phone}")

    # Point the reply at the invite it answers, exactly as a real quick-reply
    # does through context.id.
    stmt = (
        select(OutboundMessage)
        .where(
            OutboundMessage.person_id == person.id,
            OutboundMessage.kind == "event_invite",
            OutboundMessage.provider_message_id.is_not(None),
        )
        .order_by(OutboundMessage.id.desc())
    )
    if payload.event_id is not None:
        stmt = stmt.where(OutboundMessage.event_id == payload.event_id)
    invite = db.scalar(stmt)
    if invite is None:
        raise HTTPException(
            status_code=409,
            detail="no sent invite to reply to - invite the person first",
        )

    wa_id = person.phone_e164.lstrip("+")
    timestamp = payload.timestamp or int(utcnow().timestamp())
    message_id = (
        payload.provider_message_id
        or f"wamid.sim.{invite.id}.{payload.response}.{timestamp}"
    )

    envelope = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "SIMULATED",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"display_phone_number": "0000000000"},
                            "contacts": [
                                {
                                    "profile": {"name": person.preferred_name},
                                    "wa_id": wa_id,
                                }
                            ],
                            "messages": [
                                {
                                    "from": wa_id,
                                    "id": message_id,
                                    "timestamp": str(timestamp),
                                    "type": "button",
                                    "context": {"id": invite.provider_message_id},
                                    "button": {
                                        "payload": _PAYLOAD_FOR[payload.response],
                                        "text": payload.response,
                                    },
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }

    # Sign it the way Meta would, and verify, so the signature path is covered
    # offline too rather than only in production.
    raw = json.dumps(envelope).encode("utf-8")
    secret = get_settings().whatsapp_app_secret or "dev-secret"
    header = webhook_handler.sign(raw, secret)
    if not webhook_handler.verify_signature(raw, header, secret):
        raise HTTPException(status_code=500, detail="simulator signature check failed")

    result = webhook_handler.handle_payload(db, json.loads(raw))
    return {"simulated_message_id": message_id, **result}


@router.post("/flush-outbox")
def flush_outbox(db: DbSession) -> dict[str, int]:
    _guard_dev_only()
    return outbox.flush(db)


@router.get("/outbox")
def read_outbox(db: DbSession, limit: int = 50) -> list[dict[str, object]]:
    _guard_dev_only()
    rows = db.scalars(
        select(OutboundMessage).order_by(OutboundMessage.id.desc()).limit(limit)
    )
    return [
        {
            "id": m.id,
            "kind": m.kind,
            "status": m.status,
            "to_wa_id": m.to_wa_id,
            "dedupe_key": m.dedupe_key,
            "provider_message_id": m.provider_message_id,
            "event_id": m.event_id,
            "payload": m.payload,
            "error": m.error,
        }
        for m in rows
    ]


@router.get("/sent-messages")
def sent_messages() -> list[dict[str, object]]:
    """Exactly what the fake provider 'sent' - the real Cloud API bodies."""
    _guard_dev_only()
    return get_fake_provider().sent
