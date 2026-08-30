"""Cloud API request bodies.

The fake and real providers post the *same* body, so what is stored in
``outbound_messages.payload`` during offline development is byte-for-byte what
production will send. Switching providers changes the transport, nothing else.

Meta requires an approved template for any business-initiated message outside
the 24-hour customer service window. Event invites are business-initiated, so
they must go out as a template. Getting a UTILITY template with three
quick-reply buttons approved is the long-lead external dependency - submit it
early; nothing else in the build is blocked by it.
"""

from __future__ import annotations

from typing import Any

from app.models.messaging import ACK_MAYBE, ACK_NO, ACK_YES

# Submit this name to Meta as a UTILITY template with three quick-reply buttons.
EVENT_INVITE_TEMPLATE = "cu_event_invite"
EVENT_REMINDER_TEMPLATE = "cu_event_reminder"

ACK_BUTTON_LABELS = {ACK_YES: "Yes, I'll come", ACK_NO: "Can't make it", ACK_MAYBE: "Maybe"}


def event_invite(
    to_wa_id: str,
    *,
    preferred_name: str,
    event_title: str,
    when_text: str,
    venue: str,
    language: str = "en",
) -> dict[str, Any]:
    """Business-initiated invite with three quick-reply buttons."""
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_wa_id,
        "type": "template",
        "template": {
            "name": EVENT_INVITE_TEMPLATE,
            "language": {"code": language},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": preferred_name},
                        {"type": "text", "text": event_title},
                        {"type": "text", "text": when_text},
                        {"type": "text", "text": venue},
                    ],
                },
                *[
                    {
                        "type": "button",
                        "sub_type": "quick_reply",
                        "index": str(index),
                        "parameters": [{"type": "payload", "payload": payload}],
                    }
                    for index, payload in enumerate((ACK_YES, ACK_NO, ACK_MAYBE))
                ],
            ],
        },
    }


def free_text(to_wa_id: str, body: str) -> dict[str, Any]:
    """Session message - only valid inside the 24-hour reply window."""
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_wa_id,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }
