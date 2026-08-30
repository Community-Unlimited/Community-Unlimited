"""Serving the SPA from the API origin.

The single-service deployment puts the compiled frontend behind the same host
as /api. These tests pin the three behaviours that make that safe: real files
are served, client-side routes fall back to index.html, and neither /api nor a
path traversal can be swallowed by the fallback.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def spa_root():
    """A minimal build output, shaped like frontend/dist.

    Built under the package rather than via pytest's tmp_path: this machine
    denies directory creation in the system temp folder.
    """
    base = Path(__file__).parent / ".spa-fixture"
    if base.exists():
        shutil.rmtree(base, ignore_errors=True)
    root = base / "static"
    (root / "assets").mkdir(parents=True)

    (root / "index.html").write_text("<!doctype html><title>CU-OS</title>", encoding="utf-8")
    (root / "assets" / "index-abc123.js").write_text("console.log('bundle')", encoding="utf-8")
    (root / "logo-cu.png").write_bytes(b"\x89PNG\r\n\x1a\n")

    # A file OUTSIDE the static root — nothing served should ever reach it.
    (base / "outside-the-root.txt").write_text("must never be served", encoding="utf-8")

    try:
        yield root
    finally:
        shutil.rmtree(base, ignore_errors=True)


@pytest.fixture
def spa_client(spa_root, session_factory, admin, monkeypatch):
    from app.db import get_db
    import app.main as main_mod

    monkeypatch.setattr(
        main_mod, "get_settings", lambda: Settings(static_dir=str(spa_root))
    )
    app = create_app()

    def _override():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as client:
        yield client


def test_root_serves_index(spa_client: TestClient) -> None:
    r = spa_client.get("/")
    assert r.status_code == 200
    assert "CU-OS" in r.text


def test_real_asset_is_served(spa_client: TestClient) -> None:
    r = spa_client.get("/assets/index-abc123.js")
    assert r.status_code == 200
    assert "bundle" in r.text


def test_root_level_file_is_served(spa_client: TestClient) -> None:
    r = spa_client.get("/logo-cu.png")
    assert r.status_code == 200
    assert r.content.startswith(b"\x89PNG")


@pytest.mark.parametrize("route", ["/people", "/events", "/register", "/deep/nested/route"])
def test_client_routes_fall_back_to_index(spa_client: TestClient, route: str) -> None:
    """A hard refresh on a client-side route must still boot the app."""
    r = spa_client.get(route)
    assert r.status_code == 200
    assert "CU-OS" in r.text


def test_api_routes_still_work(spa_client: TestClient) -> None:
    r = spa_client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_unknown_api_path_404s_instead_of_serving_html(spa_client: TestClient) -> None:
    """The fallback must never answer for /api.

    Returning index.html with a 200 for a missing endpoint turns a clean 404
    into a JSON parse error in the client — the exact failure the SPA rewrite
    on Vercel was written to avoid.
    """
    r = spa_client.get("/api/does-not-exist")
    assert r.status_code == 404
    assert "<title>" not in r.text


def test_docs_are_not_swallowed(spa_client: TestClient) -> None:
    assert spa_client.get("/openapi.json").status_code == 200


@pytest.mark.parametrize(
    "attack",
    [
        "../outside-the-root.txt",
        "../../outside-the-root.txt",
        "assets/../../outside-the-root.txt",
    ],
)
def test_path_traversal_cannot_escape_the_static_root(
    spa_client: TestClient, attack: str
) -> None:
    """`..` resolves away before the containment check, so this stays inside."""
    r = spa_client.get(f"/{attack}")
    assert "must never be served" not in r.text


def test_no_spa_mounted_when_static_dir_unset(session_factory, admin, monkeypatch) -> None:
    """Local dev: Vite serves the UI, so the API must not claim every path."""
    import app.main as main_mod
    from app.db import get_db

    monkeypatch.setattr(main_mod, "get_settings", lambda: Settings(static_dir=""))
    app = create_app()

    def _override():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/people").status_code == 404
