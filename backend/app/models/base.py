"""Declarative base, naming conventions and the UTC datetime type."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, MetaData, TypeDecorator
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Every constraint gets a deterministic name. SQLite cannot ALTER a constraint,
# so Alembic rewrites the whole table in "batch" mode - and it can only do that
# if the constraint has a name it can refer to. Without this, migrations that
# touch a FK or unique constraint fail on SQLite with a bare ValueError.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class UtcDateTime(TypeDecorator):
    """Timezone-aware datetimes that survive SQLite.

    SQLite has no native timestamp type and silently drops ``tzinfo``. A plain
    ``DateTime(timezone=True)`` therefore hands back a *naive* datetime, and the
    first comparison against an aware ``now()`` raises
    ``TypeError: can't compare offset-naive and offset-aware datetimes`` -
    at query time, far from the code that stored it.

    So: store naive UTC, always return aware UTC.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(
        self, value: datetime | None, dialect: Any
    ) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError(
                "naive datetime rejected - pass an aware UTC datetime "
                "(use app.models.base.utcnow())"
            )
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(
        self, value: datetime | None, dialect: Any
    ) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


def utcnow() -> datetime:
    """Aware UTC now. Use this everywhere instead of ``datetime.utcnow()``."""
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime, default=utcnow, onupdate=utcnow, nullable=False
    )
