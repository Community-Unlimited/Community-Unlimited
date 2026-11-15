"""Tests for database URL resolution, production hardening, headers, and backups."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import time

from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from app.config import (
    DEFAULT_SQLITE_URL,
    Settings,
    normalize_database_url,
    to_libpq_url,
)
from scripts import backup_db


def test_normalize_database_url_converts_postgres_schemes() -> None:
    assert (
        normalize_database_url("postgres://u:p@host/db?sslmode=require")
        == "postgresql+psycopg://u:p@host/db?sslmode=require"
    )
    assert (
        normalize_database_url("postgresql://u:p@host/db")
        == "postgresql+psycopg://u:p@host/db"
    )
    assert (
        normalize_database_url("postgresql+psycopg://u:p@host/db")
        == "postgresql+psycopg://u:p@host/db"
    )
    assert normalize_database_url("sqlite:///./cuos.db") == "sqlite:///./cuos.db"


def test_to_libpq_url_strips_sqlalchemy_driver() -> None:
    assert (
        to_libpq_url("postgresql+psycopg://u:p@host/db?sslmode=require")
        == "postgresql://u:p@host/db?sslmode=require"
    )
    assert to_libpq_url("postgres://u:p@host/db") == "postgresql://u:p@host/db"


def test_neon_env_precedence_neon_cli_layout(monkeypatch: pytest.MonkeyPatch) -> None:
    """`neon deploy` writes DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct)."""
    for var in (
        "CU_DATABASE_URL",
        "CU_DIRECT_DATABASE_URL",
        "CU_DATABASE_URL_POOLED",
        "DATABASE_URL_POOLED",
        "CU_DATABASE_URL_UNPOOLED",
        "DATABASE_URL_UNPOOLED",
        "DATABASE_URL",
    ):
        monkeypatch.delenv(var, raising=False)

    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@ep-abc-pooler.aws.neon.tech/neondb")
    monkeypatch.setenv("DATABASE_URL_UNPOOLED", "postgresql://u:p@ep-abc.aws.neon.tech/neondb")

    settings = Settings(_env_file=None)
    assert (
        settings.effective_database_url
        == "postgresql+psycopg://u:p@ep-abc-pooler.aws.neon.tech/neondb"
    )
    assert (
        settings.effective_direct_database_url
        == "postgresql+psycopg://u:p@ep-abc.aws.neon.tech/neondb"
    )
    assert settings.is_sqlite is False


def test_neon_env_precedence_pooled_and_explicit_overrides(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for var in (
        "CU_DATABASE_URL",
        "CU_DIRECT_DATABASE_URL",
        "CU_DATABASE_URL_POOLED",
        "DATABASE_URL_POOLED",
        "CU_DATABASE_URL_UNPOOLED",
        "DATABASE_URL_UNPOOLED",
        "DATABASE_URL",
    ):
        monkeypatch.delenv(var, raising=False)

    monkeypatch.setenv(
        "DATABASE_URL_POOLED", "postgres://u:p@ep-xyz-pooler.aws.neon.tech/neondb"
    )
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@ep-xyz.aws.neon.tech/neondb")

    settings = Settings(_env_file=None)
    assert (
        settings.effective_database_url
        == "postgresql+psycopg://u:p@ep-xyz-pooler.aws.neon.tech/neondb"
    )
    assert (
        settings.effective_direct_database_url
        == "postgresql+psycopg://u:p@ep-xyz.aws.neon.tech/neondb"
    )

    monkeypatch.setenv("CU_DATABASE_URL", "postgresql://override:pw@pooled/db")
    monkeypatch.setenv("CU_DIRECT_DATABASE_URL", "postgresql://override:pw@direct/db")
    overridden = Settings(_env_file=None)
    assert overridden.effective_database_url == "postgresql+psycopg://override:pw@pooled/db"
    assert overridden.effective_direct_database_url == "postgresql+psycopg://override:pw@direct/db"


def test_sqlite_default_and_explicit_sqlite_direct_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for var in (
        "CU_DATABASE_URL",
        "CU_DIRECT_DATABASE_URL",
        "DATABASE_URL_POOLED",
        "DATABASE_URL_UNPOOLED",
        "DATABASE_URL",
    ):
        monkeypatch.delenv(var, raising=False)

    default_settings = Settings(_env_file=None)
    assert default_settings.effective_database_url == DEFAULT_SQLITE_URL
    assert default_settings.effective_direct_database_url == DEFAULT_SQLITE_URL
    assert default_settings.is_sqlite is True

    monkeypatch.setenv("DATABASE_URL_UNPOOLED", "postgresql://u:p@ep.neon.tech/neondb")
    monkeypatch.setenv("CU_DATABASE_URL", "sqlite:///./custom.db")
    sqlite_override = Settings(_env_file=None)
    assert sqlite_override.effective_database_url == "sqlite:///./custom.db"
    assert sqlite_override.effective_direct_database_url == "sqlite:///./custom.db"


def test_oracle_defaults_are_empty() -> None:
    settings = Settings(_env_file=None)
    assert settings.oracle_whatsapp_token == ""
    assert settings.oracle_whatsapp_user_id == ""


def test_production_validation_rejects_unsafe_defaults() -> None:
    with pytest.raises(ValidationError, match="CU_JWT_SECRET"):
        Settings(
            _env_file=None,
            env="production",
            jwt_secret="dev-only-change-me",
            whatsapp_provider="oracle",
        )

    with pytest.raises(ValidationError, match="CU_JWT_SECRET"):
        Settings(
            _env_file=None,
            env="production",
            jwt_secret="",
            whatsapp_provider="oracle",
        )

    with pytest.raises(ValidationError, match="CU_WHATSAPP_PROVIDER"):
        Settings(
            _env_file=None,
            env="production",
            jwt_secret="super-strong-prod-secret",
            whatsapp_provider="fake",
        )

    with pytest.raises(ValidationError, match="CU_CORS_ORIGINS"):
        Settings(
            _env_file=None,
            env="production",
            jwt_secret="super-strong-prod-secret",
            whatsapp_provider="oracle",
            cors_origins=["*"],
        )

    valid = Settings(
        _env_file=None,
        env="production",
        jwt_secret="super-strong-prod-secret",
        whatsapp_provider="oracle",
        cors_origins=["https://cu-os.onrender.com"],
    )
    assert valid.is_production is True


def test_production_webhooks_fail_closed_without_secret(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "env", "production", raising=False)
    monkeypatch.setattr(settings, "whatsapp_app_secret", "", raising=False)
    monkeypatch.setattr(settings, "openwa_webhook_secret", "", raising=False)

    meta_res = client.post("/api/whatsapp/webhook", json={"entry": []})
    assert meta_res.status_code == 503

    openwa_res = client.post(
        "/api/whatsapp/open/webhook",
        json={"event": "message", "payload": {"fromMe": True, "body": "1"}},
    )
    assert openwa_res.status_code == 503


def test_security_headers_and_conditional_hsts(client: TestClient) -> None:
    plain = client.get("/api/health")
    assert plain.status_code == 200
    assert plain.headers["X-Content-Type-Options"] == "nosniff"
    assert plain.headers["X-Frame-Options"] == "DENY"
    assert plain.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "Strict-Transport-Security" not in plain.headers

    tls = client.get("/api/health", headers={"X-Forwarded-Proto": "https"})
    assert tls.status_code == 200
    assert (
        tls.headers["Strict-Transport-Security"]
        == "max-age=31536000; includeSubDomains"
    )


def test_backup_db_masking_dry_run_and_retention(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    masked = backup_db.mask_database_url(
        "postgresql://neondb_owner:supersecret123@ep-test.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
    )
    assert "supersecret123" not in masked
    assert "neondb_owner" not in masked
    assert masked == "postgresql://***:***@ep-test.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

    monkeypatch.setattr(
        backup_db,
        "get_settings",
        lambda: Settings(
            _env_file=None,
            direct_database_url="postgresql+psycopg://user:s3cr3t@ep-direct.aws.neon.tech/neondb",
        ),
    )
    monkeypatch.setenv("CU_BACKUP_S3_BUCKET", "cu-backups")
    monkeypatch.setenv("CU_BACKUP_S3_PREFIX", "weekly")

    rc = backup_db.main(["--dry-run", "--output-dir", "backups", "--keep", "4"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "s3cr3t" not in out
    assert "postgresql://***:***@ep-direct.aws.neon.tech/neondb" in out
    assert "s3://cu-backups/weekly/cuos-" in out

    # Missing pg_dump exits cleanly without traceback
    monkeypatch.setattr(backup_db.shutil, "which", lambda _name: None)
    assert backup_db.main(["--output-dir", "backups"]) == 1

    # Retention pruning keeps newest N files
    fixture_dir = Path(__file__).parent / ".backup-prune-fixture"
    if fixture_dir.exists():
        shutil.rmtree(fixture_dir, ignore_errors=True)
    fixture_dir.mkdir(parents=True)
    try:
        names = [
            "cuos-20260101T000000Z.dump",
            "cuos-20260108T000000Z.dump",
            "cuos-20260115T000000Z.dump",
        ]
        now = time.time()
        for idx, name in enumerate(names):
            p = fixture_dir / name
            p.write_bytes(b"dump")
            os.utime(p, (now + idx, now + idx))

        removed = backup_db.prune_old_dumps(fixture_dir, keep=2)
        assert [p.name for p in removed] == ["cuos-20260101T000000Z.dump"]
        remaining = sorted(p.name for p in fixture_dir.glob("cuos-*.dump"))
        assert remaining == [
            "cuos-20260108T000000Z.dump",
            "cuos-20260115T000000Z.dump",
        ]
    finally:
        shutil.rmtree(fixture_dir, ignore_errors=True)
