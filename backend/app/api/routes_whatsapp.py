"""Meta WhatsApp webhook.

Not active until credentials are configured, but the route exists now so the
next session is configuration rather than new code.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.config import get_settings
from app.deps import DbSession
from app.whatsapp import webhook_handler

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


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
