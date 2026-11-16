"""add token_version and deactivation fields to users

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-20
"""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('deactivation_reason', sa.Text(), nullable=True))
    op.create_index('idx_users_token_version', 'users', ['id', 'token_version'])


def downgrade() -> None:
    op.drop_index('idx_users_token_version', table_name='users')
    op.drop_column('users', 'deactivation_reason')
    op.drop_column('users', 'token_version')