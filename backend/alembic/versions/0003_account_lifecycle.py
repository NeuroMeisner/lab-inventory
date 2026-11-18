"""account lifecycle fields + audit reason

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("pii_removed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("audit_log", sa.Column("reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("audit_log", "reason")
    op.drop_column("users", "pii_removed_at")
    op.drop_column("users", "deactivated_at")