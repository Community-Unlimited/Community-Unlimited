"""Inbound Open WhatsApp (WAHA / Baileys) webhook translation.

WAHA posts JSON message events over HTTP. This module normalises volunteer
responses (such as typing "1", "YES", or clicking buttons) and translates
WAHA's payload shape into the canonical Meta Cloud API envelope expected by
:func:`app.whatsapp.webhook_handler.handle_payload`.
"""

from __future__ import annotations

import re
import time
from typing import Any

from app.models.messaging import ACK_MAYBE, ACK_NO, ACK_YES

# Normalize casual text responses into canonical acknowledgment keys
_TEXT_TO_ACK: dict[str, str] = {
    "1": ACK_YES,
    "yes": ACK_YES,
    "y": ACK_YES,
    "confirm": ACK_YES,
    "confirmed": ACK_YES,
    "attending": ACK_YES,
    "coming": ACK_YES,
    "yes, i'll come": ACK_YES,
    "yes i will come": ACK_YES,
    "2": ACK_NO,
    "no": ACK_NO,
    "n": ACK_NO,
    "decline": ACK_NO,
    "declined": ACK_NO,
    "cannot": ACK_NO,
    "can't": ACK_NO,
    "cant make it": ACK_NO,
    "can't make it": ACK_NO,
    "3": ACK_MAYBE,
    "maybe": ACK_MAYBE,
    "tentative": ACK_MAYBE,
    "not sure": ACK_MAYBE,
}


def normalize_wa_id(raw_address: str) -> str:
    """Strip '@c.us', '@s.whatsapp.net', and '+' to get bare numeric wa_id."""
    cleaned = raw_address.split("@")[0].strip()
    return cleaned.lstrip("+")


def match_ack_response(text: str | None) -> str | None:
    """Map user reply text (e.g. '1', 'yes', 'no') to canonical ACK key."""
    if not text:
        return None
    normalized = text.strip().lower()
    # Direct dictionary match
    if normalized in _TEXT_TO_ACK:
        return _TEXT_TO_ACK[normalized]

    # Regex search for leading '1', '2', or '3' (e.g. '1. Yes' or '1 yes')
    match = re.match(r"^([123])\b", normalized)
    if match:
        digit = match.group(1)
        return _TEXT_TO_ACK.get(digit)

    return None


def to_meta_envelope(payload: dict[str, Any]) -> dict[str, Any]:
    """Translate WAHA webhook JSON into the canonical Meta webhook shape."""
    # WAHA wraps message details inside 'payload'
    data = payload.get("payload") if "payload" in payload else payload

    # If this is our own outbound message echoing back, skip it
    if data.get("fromMe", False):
        return {"object": "whatsapp_business_account", "entry": []}

    raw_from = data.get("from") or ""
    wa_id = normalize_wa_id(raw_from)
    if not wa_id:
        return {"object": "whatsapp_business_account", "entry": []}

    message_id = str(data.get("id") or "")
    if not message_id:
        message_id = f"openwa.{int(time.time() * 1000)}"

    raw_timestamp = data.get("timestamp")
    timestamp_str = str(int(raw_timestamp)) if raw_timestamp else str(int(time.time()))

    # Text body or selected button
    body = (data.get("body") or data.get("text") or "").strip()
    selected_button_id = (
        data.get("selectedButtonId")
        or (data.get("buttonReply") or {}).get("id")
        or (data.get("listReply") or {}).get("id")
    )

    button_payload = selected_button_id or match_ack_response(body)

    if button_payload:
        msg_obj: dict[str, Any] = {
            "type": "button",
            "button": {
                "payload": button_payload,
                "text": body,
            },
        }
    elif body:
        msg_obj = {
            "type": "text",
            "text": {"body": body},
        }
    else:
        msg_obj = {"type": "other"}

    msg_obj.update(
        {
            "from": wa_id,
            "id": message_id,
            "timestamp": timestamp_str,
            "openwa": data,
        }
    )

    # If user quoted/replied to an invite, attach context.id
    reply_to = data.get("replyTo") or {}
    reply_id = reply_to.get("id")
    if reply_id:
        msg_obj["context"] = {"id": str(reply_id)}

    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "OPENWA",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "messages": [msg_obj],
                        },
                    }
                ],
            }
        ],
    }
