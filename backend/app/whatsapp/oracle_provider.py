"""Oracle Cloud Unify WhatsApp Transport.

Sends messages through the persistent WhatsApp Web instance hosted on Oracle Cloud
(OCI). Matches the WhatsAppProvider protocol and reuses formatted message bodies.
"""

from __future__ import annotations

from typing import Any

from app.whatsapp.openwa_provider import OpenWhatsAppProvider
from app.whatsapp.oracle_client import OracleWhatsAppClient
from app.whatsapp.provider import SendResult


class OracleWhatsAppProvider:
    name = "oracle"

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        user_id: str | None = None,
    ) -> None:
        self.client = OracleWhatsAppClient(base_url=base_url, token=token, user_id=user_id)

    def send(self, payload: dict[str, Any]) -> SendResult:
        recipient = payload.get("to")
        if not recipient:
            return SendResult(ok=False, error="payload has no recipient")

        try:
            body = OpenWhatsAppProvider.render_body(payload)
        except ValueError as exc:
            return SendResult(ok=False, error=str(exc))

        result = self.client.send(chat_id=recipient, text=body)
        if not result.get("ok"):
            return SendResult(ok=False, error=result.get("error", "send failed"))

        msg_id = result.get("messageId") or result.get("operationId")
        return SendResult(ok=True, provider_message_id=msg_id)
