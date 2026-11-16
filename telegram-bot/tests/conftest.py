import os

# ВАЖНО: до импорта приложения
os.environ.setdefault("INTERNAL_API_SECRET", "test-secret")
os.environ.setdefault("BOT_TOKEN", "")
os.environ.setdefault("BACKEND_URL", "http://localhost:8000/api/v1")
os.environ.setdefault("PWA_PUBLIC_URL", "https://lab.example.ru")

import aiohttp  # noqa: E402
import pytest_asyncio  # noqa: E402
from aiohttp.test_utils import TestServer  # noqa: E402

from app.backend_client import BackendClient  # noqa: E402
from tests.fake_backend import SECRET, create_fake_app  # noqa: E402


@pytest_asyncio.fixture
async def fake_backend_url():
    server = TestServer(create_fake_app())
    await server.start_server()
    yield f"http://{server.host}:{server.port}"
    await server.close()


@pytest_asyncio.fixture
async def client(fake_backend_url):
    session = aiohttp.ClientSession()
    c = BackendClient(fake_backend_url, SECRET, session)
    yield c
    await session.close()