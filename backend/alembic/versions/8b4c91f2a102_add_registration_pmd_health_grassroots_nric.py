"""add registration pmd, health, grassroots, and nric fields

Revision ID: 8b4c91f2a102
Revises: 363702eea821
Create Date: 2026-11-09 16:15:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "8b4c91f2a102"
down_revision: str | None = "363702eea821"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("people", schema=None) as batch_op:
        batch_op.add_column(sa.Column("nric_last4", sa.String(length=8), nullable=True))
        batch_op.add_column(
            sa.Column(
                "requires_pmd",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("mobility_aid", sa.String(length=32), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "has_health_conditions",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            )
        )
        batch_op.add_column(sa.Column("health_conditions", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("health_notes", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("emergency_contact_name", sa.String(length=120), nullable=True)
        )
        batch_op.add_column(
            sa.Column("emergency_contact_phone", sa.String(length=32), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "emergency_contact_relationship", sa.String(length=64), nullable=True
            )
        )
        batch_op.add_column(
            sa.Column(
                "is_grassroots_volunteer",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("grassroots_organisation", sa.String(length=200), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("people", schema=None) as batch_op:
        batch_op.drop_column("grassroots_organisation")
        batch_op.drop_column("is_grassroots_volunteer")
        batch_op.drop_column("emergency_contact_relationship")
        batch_op.drop_column("emergency_contact_phone")
        batch_op.drop_column("emergency_contact_name")
        batch_op.drop_column("health_notes")
        batch_op.drop_column("health_conditions")
        batch_op.drop_column("has_health_conditions")
        batch_op.drop_column("mobility_aid")
        batch_op.drop_column("requires_pmd")
        batch_op.drop_column("nric_last4")
