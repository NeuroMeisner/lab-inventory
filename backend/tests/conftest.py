import os

# ВАЖНО: переменные окружения задаются до импорта приложения
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://lab:lab@localhost:5432/lab_test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("DEV_MODE", "true")
os.environ.setdefault("SCHEDULER_ENABLED", "false")
os.environ.setdefault("INTERNAL_API_SECRET", "test-internal-secret")
os.environ.setdefault("BOT_TOKEN", "123456:TEST-BOT-TOKEN")
os.environ.setdefault("GOOGLE_ADMIN_EMAILS", "admin@lab.test")
os.environ.setdefault("TELEGRAM_BOT_WEBHOOK_URL", "")

from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session", autouse=True)
def _migrate_db():
    """Накатываем реальные Alembic-миграции на тестовую БД."""
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    yield
    async with engine.begin() as conn:
        await conn.execute(text(
            "TRUNCATE transactions, packages, nomenclature, purchase_orders, "
            "users, grants, audit_log, account_link_codes RESTART IDENTITY CASCADE"
        ))


@pytest_asyncio.fixture
async def client():
    from app.main import create_app
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


@pytest_asyncio.fixture
async def dbs():
    async with SessionLocal() as session:
        yield session