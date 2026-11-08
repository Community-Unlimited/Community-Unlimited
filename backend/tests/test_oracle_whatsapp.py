"""Tests for Oracle Cloud WhatsApp Bridge integration and Admin API endpoints."""

from __future__ import annotations

import httpx
from fastapi.testclient import TestClient

from app.whatsapp.oracle_client import OracleWhatsAppClient
from app.whatsapp.oracle_provider import OracleWhatsAppProvider


def test_oracle_client_get_status_connected(monkeypatch):
    def fake_get(url, headers, timeout):
        assert "v1/users/" in url
        return httpx.Response(
            200,
            json={
                "connected": True,
                "state": "connected",
                "phone": "6592700407",
                "displayName": "Rejey Ezekiel",
                "qrDataUrl": None,
                "error": None,
                "sessionGeneration": "gen_123",
            },
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx, "get", fake_get)

    client = OracleWhatsAppClient(base_url="https://mock.bridge", user_id="user_123", token="tok_123")
    status = client.get_status()

    assert status["ok"] is True
    assert status["connected"] is True
    assert status["state"] == "connected"
    assert status["phone"] == "6592700407"
    assert status["displayName"] == "Rejey Ezekiel"
    assert status["sessionGeneration"] == "gen_123"


def test_oracle_client_connect_returns_qr(monkeypatch):
    def fake_post(url, headers, json, timeout):
        return httpx.Response(
            200,
            json={
                "connected": False,
                "state": "qr",
                "phone": None,
                "displayName": None,
                "qrDataUrl": "data:image/png;base64,mockqrdata",
                "error": None,
                "sessionGeneration": "gen_new",
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    client = OracleWhatsAppClient(base_url="https://mock.bridge", user_id="user_123", token="tok_123")
    result = client.connect()

    assert result["ok"] is True
    assert result["connected"] is False
    assert result["state"] == "qr"
    assert result["qrDataUrl"] == "data:image/png;base64,mockqrdata"


def test_oracle_client_send(monkeypatch):
    def fake_get(url, headers, timeout):
        return httpx.Response(
            200,
            json={"connected": True, "sessionGeneration": "gen_123"},
            request=httpx.Request("GET", url),
        )

    def fake_post(url, headers, json, timeout):
        assert json["chatId"] == "6598765432@c.us"
        assert json["sessionGeneration"] == "gen_123"
        return httpx.Response(
            200,
            json={"ok": True, "messageId": "msg_oracle_999"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "get", fake_get)
    monkeypatch.setattr(httpx, "post", fake_post)

    provider = OracleWhatsAppProvider(base_url="https://mock.bridge", user_id="user_123", token="tok_123")
    res = provider.send({"to": "+6598765432", "type": "text", "text": {"body": "Hello!"}})

    assert res.ok is True
    assert res.provider_message_id == "msg_oracle_999"


def test_admin_api_endpoints(client: TestClient, auth: dict, monkeypatch):
    def fake_get(url, headers, timeout):
        return httpx.Response(
            200,
            json={"connected": True, "state": "connected", "phone": "6592700407", "displayName": "Rejey"},
            request=httpx.Request("GET", url),
        )

    def fake_post(url, headers, json, timeout):
        if "connect" in url:
            return httpx.Response(
                200,
                json={"connected": False, "state": "qr", "qrDataUrl": "data:image/png;base64,test"},
                request=httpx.Request("POST", url),
            )
        return httpx.Response(200, json={"connected": False, "state": "disconnected"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "get", fake_get)
    monkeypatch.setattr(httpx, "post", fake_post)

    # Status
    res = client.get("/api/whatsapp/admin/status", headers=auth)
    assert res.status_code == 200
    assert res.json()["connected"] is True
    assert res.json()["phone"] == "6592700407"

    # Connect
    res = client.post("/api/whatsapp/admin/connect", headers=auth)
    assert res.status_code == 200
    assert res.json()["state"] == "qr"
    assert "data:image/png;base64" in res.json()["qrDataUrl"]

    # Disconnect
    res = client.post("/api/whatsapp/admin/disconnect", headers=auth)
    assert res.status_code == 200
    assert res.json()["connected"] is False
