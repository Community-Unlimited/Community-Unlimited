"""Alembic environment.

Two things here are load-bearing and easy to get wrong on SQLite:

1. ``render_as_batch=True`` - SQLite cannot ALTER most things, so Alembic has to
   rebuild the table. Without batch mode, any column or constraint change fails.
2. ``render_item`` - autogenerate writes the *Python* type into the migration
   file. Our custom ``UtcDateTime`` is not importable from ``sa``, so without
   this hook the generated migration says ``sa.UtcDateTime()`` and dies with
   ``AttributeError`` the first time it runs.
"""

from __future__ import annotations

from logging.config import fileConfig
from typing import Any

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import get_settings
from app.models import Base  # noqa: F401  (registers every table)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Only fall back to the environment when the caller has not supplied a URL.
# The test suite injects its own; overwriting it silently runs migrations
# against the developer's real database.
if not config.get_main_option("sqlalchemy.url", None):
    config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


def render_item(type_: str, obj: Any, autogen_context: Any) -> str | bool:
    """Render custom types as their plain SQLAlchemy equivalent."""
    if type_ == "type" and obj.__class__.__name__ == "UtcDateTime":
        autogen_context.imports.add("import sqlalchemy as sa")
        return "sa.DateTime()"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        render_item=render_item,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = config.attributes.get("connection", None)

    if connectable is None:
        connectable = engine_from_config(
            config.get_section(config.config_ini_section, {}),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )
        with connectable.connect() as connection:
            _run(connection)
    else:
        _run(connectable)


def _run(connection: Any) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
        render_item=render_item,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
