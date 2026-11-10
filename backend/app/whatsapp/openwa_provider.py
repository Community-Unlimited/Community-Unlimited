"""Open WhatsApp (WAHA / Baileys) transport.

Sends messages through a self-hosted WAHA (WhatsApp HTTP API) instance.
Translates canonical Meta-shaped template bodies into friendly, readable text
with 1/2/3 reply options.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.whatsapp.provider import SendResult


class OpenWhatsAppProvider:
    name = "openwa"

    def __init__(self, base_url: str, api_key: str = "", timeout: float = 20.0) -> None:
        self._url = base_url.rstrip("/")
        self._headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            self._headers["X-Api-Key"] = api_key
        self._timeout = timeout

    @staticmethod
    def format_chat_id(recipient: str) -> str:
        """Convert any phone representation to WAHA's chatId ('6591234567@c.us')."""
        clean = recipient.replace("whatsapp:", "").replace("+", "").strip()
        if "@" in clean:
            return clean
        return f"{clean}@c.us"

    @staticmethod
    def render_body(payload: dict[str, Any]) -> str:
        """Render a Meta template or text payload into formatted WhatsApp text."""
        kind = payload.get("type")

        if kind == "template":
            template = payload.get("template") or {}
            params: list[str] = []
            for component in template.get("components") or []:
                if component.get("type") == "body":
                    for param in component.get("parameters") or []:
                        params.append(str(param.get("text", "")))

            # If template has 4 parameters (preferred_name, event_title, when, venue)
            if len(params) >= 4:
                name, title, when, venue = params[:4]
                return (
                    f"Hi {name}!\n\n"
                    f"You're invited to *{title}*.\n"
                    f"📅 {when}\n"
                    f"📍 {venue}\n\n"
                    f"Please reply to this message:\n"
                    f"1 - Yes, I'll come\n"
                    f"2 - Can't make it\n"
                    f"3 - Maybe"
                )
            elif params:
                return "\n".join(params) + "\n\nReply 1 for Yes, 2 for No, 3 for Maybe"

            return f"You have an event invite. Reply 1 for Yes, 2 for No, 3 for Maybe."

        if kind == "text":
            return ((payload.get("text") or {}).get("body") or "").strip()

        raise ValueError(f"unsupported payload type {kind!r}")

    def send(self, payload: dict[str, Any]) -> SendResult:
        recipient = payload.get("to")
        if not recipient:
            return SendResult(ok=False, error="payload has no recipient")

        try:
            body = self.render_body(payload)
        except ValueError as exc:
            return SendResult(ok=False, error=str(exc))

        chat_id = self.format_chat_id(recipient)
        post_url = f"{self._url}/api/sendText"
        request_body = {
            "chatId": chat_id,
            "text": body,
            "session": "default",
        }

        try:
            response = httpx.post(
                post_url,
                headers=self._headers,
                json=request_body,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            return SendResult(ok=False, error=f"transport error: {exc}")

        if response.status_code >= 400:
            return SendResult(
                ok=False,
                error=f"waha {response.status_code}: {response.text[:500]}",
            )

        resp_data = response.json()
        # WAHA sendText returns { id: "true_...", ... } or { message: { id: "..." } }
        message_id = (
            resp_data.get("id")
            or (resp_data.get("message") or {}).get("id")
            or resp_data.get("messageId")
        )

        return SendResult(ok=True, provider_message_id=message_id)
