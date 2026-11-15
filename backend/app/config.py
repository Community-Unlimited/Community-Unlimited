"""Application settings.

Everything is read from the environment with a ``CU_`` prefix so the same
image can run in dev and production without code changes.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEFAULT_SQLITE_URL = "sqlite:///./cuos.db"


def normalize_database_url(url: str) -> str:
    """Ensure PostgreSQL URLs use the psycopg v3 SQLAlchemy dialect."""
    cleaned = url.strip()
    if cleaned.startswith("postgres://"):
        return "postgresql+psycopg://" + cleaned[len("postgres://") :]
    if cleaned.startswith("postgresql://"):
        return "postgresql+psycopg://" + cleaned[len("postgresql://") :]
    return cleaned


def to_libpq_url(url: str) -> str:
    """Strip SQLAlchemy driver suffixes (+psycopg) for libpq tools like pg_dump."""
    cleaned = url.strip()
    if cleaned.startswith("postgresql+psycopg://"):
        return "postgresql://" + cleaned[len("postgresql+psycopg://") :]
    if cleaned.startswith("postgres://"):
        return "postgresql://" + cleaned[len("postgres://") :]
    return cleaned


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CU_",
        env_file=(".env", ".env.local", "../.env", "../.env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    env: str = "development"
    database_url: str = DEFAULT_SQLITE_URL
    direct_database_url: str = ""
    neon_database_url_pooled: str = Field(
        default="",
        validation_alias=AliasChoices("CU_DATABASE_URL_POOLED", "DATABASE_URL_POOLED"),
    )
    neon_database_url_unpooled: str = Field(
        default="",
        validation_alias=AliasChoices("CU_DATABASE_URL_UNPOOLED", "DATABASE_URL_UNPOOLED"),
    )
    neon_database_url: str = Field(
        default="",
        validation_alias=AliasChoices("DATABASE_URL",),
    )

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
    # credentials at all; "oracle" is the persistent WhatsApp Web bridge
    # on Oracle Cloud; "cloud" is Meta's WhatsApp Cloud API; "twilio" is
    # Twilio's WhatsApp channel; "waha" / "openwa" is a self-hosted bridge.
    # See app/whatsapp/provider.py.
    whatsapp_provider: str = "oracle"
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_verify_token: str = "cu-os-verify"

    # --- Oracle Cloud WhatsApp Bridge ---------------------------------------
    oracle_whatsapp_url: str = "https://whatsapp.rejey-services.tech"
    oracle_whatsapp_token: str = ""
    oracle_whatsapp_user_id: str = ""

    # --- Open WhatsApp (WAHA / Baileys) -------------------------------------
    openwa_url: str = "http://localhost:3000"
    openwa_api_key: str = ""
    openwa_webhook_secret: str = ""

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

    # --- WAHA (unofficial, linked-device) -----------------------------------
    # A self-hosted WAHA container (https://waha.devlike.pro) logged in to an
    # ordinary WhatsApp number as a *linked device*, the way WhatsApp Web is.
    # The phone keeps working normally. This is a stop-gap while Meta business
    # verification is pending: it is against WhatsApp's terms, and the number
    # can be banned for bulk sending. See app/whatsapp/waha_webhook.py.
    waha_base_url: str = ""
    waha_api_key: str = ""
    waha_session: str = "default"
    # Must equal WHATSAPP_HOOK_HMAC_KEY on the WAHA container. Inbound webhooks
    # are refused (503) until it is set, never accepted unsigned.
    waha_webhook_hmac_key: str = ""
    # Pause after every send. Bursts of messages to new contacts are what gets
    # an unofficial number banned, so this errs slow.
    waha_send_interval_seconds: float = 3.0

    @field_validator("whatsapp_provider")
    @classmethod
    def _known_provider(cls, v: str) -> str:
        # Fail loudly. Falling back to "fake" on a typo means every invite is
        # silently discarded in production with a 200 and no error anywhere.
        allowed = {"fake", "cloud", "twilio", "waha", "openwa", "oracle"}
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

    @model_validator(mode="after")
    def _validate_production_settings(self) -> Settings:
        if not self.is_production:
            return self
        if not self.jwt_secret or self.jwt_secret == "dev-only-change-me":
            raise ValueError(
                "CU_JWT_SECRET must be set to a strong non-default secret when CU_ENV=production"
            )
        if self.whatsapp_provider == "fake":
            raise ValueError(
                "CU_WHATSAPP_PROVIDER='fake' is not permitted when CU_ENV=production"
            )
        if "*" in self.cors_origins:
            raise ValueError(
                "Wildcard '*' in CU_CORS_ORIGINS is not permitted when CU_ENV=production"
            )
        return self

    @property
    def is_production(self) -> bool:
        return self.env.strip().lower() == "production"

    @property
    def effective_database_url(self) -> str:
        """Runtime database URL (prefers Neon pooled URL for app traffic)."""
        if self.database_url and self.database_url != DEFAULT_SQLITE_URL:
            return normalize_database_url(self.database_url)
        if self.neon_database_url_pooled:
            return normalize_database_url(self.neon_database_url_pooled)
        if self.neon_database_url:
            return normalize_database_url(self.neon_database_url)
        if self.neon_database_url_unpooled:
            return normalize_database_url(self.neon_database_url_unpooled)
        return normalize_database_url(self.database_url or DEFAULT_SQLITE_URL)

    @property
    def effective_direct_database_url(self) -> str:
        """Direct (non-pooled) database URL for Alembic DDL and pg_dump."""
        if self.direct_database_url:
            return normalize_database_url(self.direct_database_url)
        if self.database_url and self.database_url != DEFAULT_SQLITE_URL:
            if (
                self.database_url.startswith("sqlite")
                or "-pooler." not in self.database_url
            ):
                return normalize_database_url(self.database_url)
        if self.neon_database_url_unpooled:
            return normalize_database_url(self.neon_database_url_unpooled)
        if self.neon_database_url and "-pooler." not in self.neon_database_url:
            return normalize_database_url(self.neon_database_url)
        return self.effective_database_url

    @property
    def is_sqlite(self) -> bool:
        return self.effective_database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
