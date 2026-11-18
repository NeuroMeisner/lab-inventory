"""link attempts rate-limit table

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "link_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("idx_link_attempts_ip_ts", "link_attempts", ["ip", "ts"])
    op.create_index("idx_link_attempts_tg_ts", "link_attempts", ["telegram_id", "ts"])


def downgrade() -> None:
    op.drop_index("idx_link_attempts_tg_ts", table_name="link_attempts")
    op.drop_index("idx_link_attempts_ip_ts", table_name="link_attempts")
    op.drop_table("link_attempts")