"""Test fixtures.

In-memory SQLite with StaticPool so every connection sees the same database.
The ``PRAGMA foreign_keys=ON`` listener in ``app.db`` is registered against the
``Engine`` class, so it applies here too and cascades behave as in production.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.main import create_app
from app.models import Base, StaffUser
from app.security import hash_password
from app.whatsapp.provider import get_fake_provider

ADMIN_EMAIL = "admin@test.local"
ADMIN_PASSWORD = "test-password"


@pytest.fixture(autouse=True)
def force_fake_provider(monkeypatch):
    """Pin the fake provider for every test, whatever .env says.

    ``create_app`` reads the real settings, so without this the entire suite
    depends on the developer's local ``CU_WHATSAPP_PROVIDER``: switching it to
    ``twilio`` to send a live message would unmount the /api/dev routes and
    turn a dozen green tests red for reasons that have nothing to do with the
    change being tested.
    """
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "whatsapp_provider", "fake", raising=False)


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    try:
        yield eng
    finally:
        Base.metadata.drop_all(eng)
        eng.dispose()


@pytest.fixture
def session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def db(session_factory) -> Iterator[Session]:
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def admin(db: Session) -> StaffUser:
    user = StaffUser(
        email=ADMIN_EMAIL,
        full_name="Test Admin",
        password_hash=hash_password(ADMIN_PASSWORD),
        role="ops_admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def client(session_factory, admin) -> Iterator[TestClient]:
    get_fake_provider().clear()
    app = create_app()

    def _override() -> Iterator[Session]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def pathway(db: Session):
    """CB1-CB7, matching the locked structure."""
    from seed import seed_pathway

    result = seed_pathway(db)
    db.commit()
    return result
