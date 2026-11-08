"""Client for Oracle Cloud Unify WhatsApp Bridge.

Interacts with the persistent WhatsApp Web instance hosted on the Oracle Cloud
Infrastructure (OCI) VM at https://whatsapp.rejey-services.tech.
Provides status checks, QR pairing generation, disconnects, and message sends.
"""

from __future__ import annotations

import hashlib
import time
from typing import Any

import httpx

from app.config import get_settings


class OracleWhatsAppClient:
    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        user_id: str | None = None,
        timeout: float = 20.0,
    ) -> None:
        settings = get_settings()
        self._url = (base_url or settings.oracle_whatsapp_url).rstrip("/")
        self._token = token or settings.oracle_whatsapp_token
        self._user_id = user_id or settings.oracle_whatsapp_user_id
        self._timeout = timeout

    @property
    def headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers

    def get_status(self) -> dict[str, Any]:
        """Fetch current session status, phone number, and QR code if pairing."""
        if not self._user_id:
            return {
                "ok": False,
                "connected": False,
                "state": "unconfigured",
                "error": "Oracle WhatsApp user ID is not configured",
            }

        endpoint = f"{self._url}/v1/users/{self._user_id}/status"
        try:
            res = httpx.get(endpoint, headers=self.headers, timeout=self._timeout)
        except httpx.HTTPError as exc:
            return {
                "ok": False,
                "connected": False,
                "state": "error",
                "error": f"Failed to connect to Oracle bridge: {exc}",
            }

        if res.status_code >= 400:
            return {
                "ok": False,
                "connected": False,
                "state": "error",
                "error": f"Bridge error ({res.status_code}): {res.text[:300]}",
            }

        data = res.json()
        return {
            "ok": True,
            "provider": "oracle",
            "connected": bool(data.get("connected")),
            "state": data.get("state", "disconnected"),
            "phone": data.get("phone"),
            "displayName": data.get("displayName"),
            "qrDataUrl": data.get("qrDataUrl"),
            "error": data.get("error"),
            "sessionGeneration": data.get("sessionGeneration"),
        }

    def connect(self) -> dict[str, Any]:
        """Request session startup / generate QR code if unlinked."""
        endpoint = f"{self._url}/v1/users/{self._user_id}/connect"
        try:
            res = httpx.post(endpoint, headers=self.headers, json={}, timeout=self._timeout)
        except httpx.HTTPError as exc:
            return {
                "ok": False,
                "connected": False,
                "state": "error",
                "error": f"Failed to initiate connect: {exc}",
            }

        if res.status_code >= 400:
            return {
                "ok": False,
                "connected": False,
                "state": "error",
                "error": f"Bridge connect error ({res.status_code}): {res.text[:300]}",
            }

        data = res.json()
        return {
            "ok": True,
            "provider": "oracle",
            "connected": bool(data.get("connected")),
            "state": data.get("state", "starting"),
            "phone": data.get("phone"),
            "displayName": data.get("displayName"),
            "qrDataUrl": data.get("qrDataUrl"),
            "error": data.get("error"),
            "sessionGeneration": data.get("sessionGeneration"),
        }

    def disconnect(self) -> dict[str, Any]:
        """Disconnect session and remove profile."""
        endpoint = f"{self._url}/v1/users/{self._user_id}/disconnect"
        try:
            res = httpx.post(endpoint, headers=self.headers, json={}, timeout=self._timeout)
        except httpx.HTTPError as exc:
            return {
                "ok": False,
                "connected": False,
                "state": "error",
                "error": f"Failed to initiate disconnect: {exc}",
            }

        if res.status_code >= 400:
            return {
                "ok": False,
                "connected": False,
                "state": "error",
                "error": f"Bridge disconnect error ({res.status_code}): {res.text[:300]}",
            }

        data = res.json()
        return {
            "ok": True,
            "provider": "oracle",
            "connected": False,
            "state": data.get("state", "disconnected"),
            "phone": None,
            "displayName": None,
            "qrDataUrl": None,
            "error": None,
        }

    def send(self, chat_id: str, text: str, reply_to: str | None = None) -> dict[str, Any]:
        """Send a message through the connected WhatsApp account."""
        # 1. Fetch current status to get sessionGeneration
        status = self.get_status()
        if not status.get("connected"):
            return {"ok": False, "error": "WhatsApp account is not connected on Oracle bridge"}

        generation = status.get("sessionGeneration")
        # Format stable operationId
        op_seed = f"{self._user_id}:{chat_id}:{text}:{time.time()}"
        operation_id = hashlib.sha256(op_seed.encode("utf-8")).hexdigest()

        # Format chatId to @c.us if needed
        clean_chat = chat_id.replace("+", "").replace("whatsapp:", "").strip()
        if not ("@" in clean_chat):
            clean_chat = f"{clean_chat}@c.us"

        endpoint = f"{self._url}/v1/users/{self._user_id}/send"
        payload = {
            "chatId": clean_chat,
            "text": text,
            "operationId": operation_id,
            "sessionGeneration": generation,
        }
        if reply_to:
            payload["replyTo"] = reply_to

        try:
            res = httpx.post(endpoint, headers=self.headers, json=payload, timeout=self._timeout)
        except httpx.HTTPError as exc:
            return {"ok": False, "error": f"Transport send error: {exc}"}

        if res.status_code >= 400:
            return {"ok": False, "error": f"Send error ({res.status_code}): {res.text[:300]}"}

        return res.json()
