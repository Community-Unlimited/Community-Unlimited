"""Application settings.

Everything is read from the environment with a ``CU_`` prefix so the same
image can run in dev and production without code changes.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CU_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./cuos.db"

    # Directory holding the compiled SPA. When set and present, the API serves
    # the frontend from the same origin — one service, no CORS. Unset locally,
    # where Vite serves the UI on :5173 and proxies /api here.
    static_dir: str = ""
    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720

    # NoDecode is load-bearing. pydantic-settings treats a `list` field as a
    # "complex" type and runs json.loads() on the raw env value *before* any
    # field_validator, so a plain `CU_CORS_ORIGINS=https://a.com,https://b.com`
    # dies with a JSONDecodeError at import time — the app never starts. Local
    # dev hid this because the default was used and no env var was set.
    # NoDecode suppresses that pre-parse and hands the raw string to the
    # validator below, which is what accepts the comma-separated form.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    # WhatsApp transport. "fake" keeps the whole app runnable with no
    # credentials at all; "cloud" is Meta's WhatsApp Cloud API; "twilio" is
    # Twilio's WhatsApp channel. See app/whatsapp/provider.py.
    whatsapp_provider: str = "fake"
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_verify_token: str = "cu-os-verify"

    # --- Twilio ------------------------------------------------------------
    # Sends prefer the API key pair (revocable without rotating the account
    # password) and fall back to the auth token. The auth token is still
    # required regardless: X-Twilio-Signature on inbound webhooks is keyed on
    # the *auth token* and an API key secret will never validate it.
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_api_key_sid: str = ""
    twilio_api_key_secret: str = ""
    # Sender, in Twilio's channel-address form, e.g. "whatsapp:+14155238886".
    twilio_whatsapp_from: str = ""
    # The exact public URL registered with Twilio for the inbound webhook.
    # Signature validation hashes the URL Twilio *called*, so behind Render's
    # TLS proxy a reconstructed URL can come back as http:// and never match.
    # Setting this removes the guesswork; leave empty to reconstruct from the
    # X-Forwarded-* headers.
    twilio_webhook_url: str = ""
    # Delivery receipts. Set to the public URL of
    # POST /api/whatsapp/twilio/status to have Twilio report sent/delivered/
    # read/failed back onto the outbound row. Empty disables them, and the
    # outbox then reports only that Twilio accepted the message.
    twilio_status_callback_url: str = ""
    # Optional pin. Left empty, the ContentSid is looked up by template name
    # through the Content API, so a template re-created after a rejected
    # approval (which mints a *new* SID) needs no config change.
    twilio_content_sid_event_invite: str = ""

    @field_validator("whatsapp_provider")
    @classmethod
    def _known_provider(cls, v: str) -> str:
        # Fail loudly. Falling back to "fake" on a typo means every invite is
        # silently discarded in production with a 200 and no error anywhere.
        allowed = {"fake", "cloud", "twilio"}
        if v not in allowed:
            raise ValueError(
                f"CU_WHATSAPP_PROVIDER={v!r} is not one of {sorted(allowed)}"
            )
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        # Accept "a,b" from the environment as well as a real list.
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
