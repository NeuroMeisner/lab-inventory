"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-07
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE SEQUENCE IF NOT EXISTS nomenclature_code_seq START WITH 1 INCREMENT BY 1")

    op.create_table(
        "grants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("manager_name", sa.String(255), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("google_email", sa.String(255), nullable=True, unique=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=True, unique=True),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("role", sa.String(20), nullable=False, server_default="user"),
        sa.Column("default_grant_id", sa.Integer(), sa.ForeignKey("grants.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("accounts_linked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "nomenclature",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("synonyms", sa.ARRAY(sa.String()), nullable=True),
        sa.Column("cas_number", sa.String(20), nullable=True, unique=True),
        sa.Column("unit", sa.String(20), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("tracking_mode", sa.String(20), nullable=False, server_default="free"),
        sa.Column("storage_temp", sa.String(20), nullable=True),
        sa.Column("min_stock", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("is_hazardous", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sds_link", sa.Text(), nullable=True),
        sa.Column("manufacturer_code", sa.String(100), nullable=True),
        sa.Column("nomenclature_code", sa.String(14), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "packages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nomenclature_id", sa.Integer(), sa.ForeignKey("nomenclature.id"), nullable=False),
        sa.Column("batch_number", sa.String(100), nullable=True),
        sa.Column("nominal_amount", sa.Numeric(10, 3), nullable=True),
        sa.Column("current_amount", sa.Numeric(10, 3), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("zone", sa.String(20), nullable=False, server_default="storage"),
        sa.Column("location", sa.String(50), nullable=True),
        sa.Column("placement_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opened_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("grant_id", sa.Integer(), sa.ForeignKey("grants.id"), nullable=True),
        sa.Column("datamatrix_code", sa.String(255), nullable=False, unique=True),
        sa.Column("label_printed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("reserved_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reserved_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "transactions",
        sa.Column("id", sa.BigInteger().with_variant(sa.BigInteger(), "postgresql"), primary_key=True, autoincrement=True),
        sa.Column("package_id", sa.Integer(), sa.ForeignKey("packages.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("grant_id", sa.Integer(), sa.ForeignKey("grants.id"), nullable=True),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(10, 3), nullable=True),
        sa.Column("from_location", sa.String(50), nullable=True),
        sa.Column("to_location", sa.String(50), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("comment", sa.Text(), nullable=True),
    )

    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nomenclature_id", sa.Integer(), sa.ForeignKey("nomenclature.id"), nullable=True),
        sa.Column("name_temp", sa.String(255), nullable=True),
        sa.Column("expected_quantity", sa.Numeric(10, 3), nullable=True),
        sa.Column("expected_date", sa.Date(), nullable=True),
        sa.Column("supplier", sa.String(255), nullable=True),
        sa.Column("invoice_number", sa.String(100), nullable=True),
        sa.Column("grant_id", sa.Integer(), sa.ForeignKey("grants.id"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="ordered"),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("field_name", sa.String(50), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("changed_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "account_link_codes",
        sa.Column("code", sa.String(6), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )

    # --- Индексы из ТЗ ---
    op.create_index("idx_packages_status", "packages", ["placement_status"])
    op.create_index("idx_packages_location", "packages", ["location"])
    op.create_index("idx_packages_grant", "packages", ["grant_id"])
    op.create_index("idx_packages_reserved_until", "packages", ["reserved_until"])
    op.create_index("idx_transactions_package", "transactions", ["package_id"])
    op.create_index("idx_transactions_user", "transactions", ["user_id"])
    op.create_index("idx_transactions_timestamp", "transactions", ["timestamp"])

    # --- Полнотекстовый (английский) и триграммный поиск ---
    op.execute(
        "CREATE INDEX idx_nomenclature_name_fts ON nomenclature USING gin "
        "(to_tsvector('english', name))"
    )
    op.execute("CREATE INDEX idx_nomenclature_name_trgm ON nomenclature USING gin (name gin_trgm_ops)")
    op.execute("CREATE INDEX idx_nomenclature_cas_trgm ON nomenclature USING gin (cas_number gin_trgm_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_nomenclature_cas_trgm")
    op.execute("DROP INDEX IF EXISTS idx_nomenclature_name_trgm")
    op.execute("DROP INDEX IF EXISTS idx_nomenclature_name_fts")
    for table in (
        "account_link_codes", "audit_log", "purchase_orders", "transactions",
        "packages", "nomenclature", "users", "grants",
    ):
        op.drop_table(table)
    op.execute("DROP SEQUENCE IF EXISTS nomenclature_code_seq")