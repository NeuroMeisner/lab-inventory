import hashlib
import hmac
import json
import os
import time
from urllib.parse import urlencode

from httpx import AsyncClient

BOT_TOKEN = os.environ.get("BOT_TOKEN", "123456:TEST-BOT-TOKEN")
INTERNAL_SECRET = os.environ.get("INTERNAL_API_SECRET", "test-internal-secret")


async def login(client: AsyncClient, email: str) -> dict:
    r = await client.post("/api/v1/auth/google", json={"credential": f"dev:{email}"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def build_init_data(telegram_id: int, bot_token: str = BOT_TOKEN) -> str:
    """Собираем корректно подписанный initData (алгоритм Telegram)."""
    params = {
        "auth_date": str(int(time.time())),
        "query_id": "test-query",
        "user": json.dumps({"id": telegram_id, "first_name": "Test", "username": "tester"}),
    }
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    params["hash"] = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(params)


async def create_grant(client: AsyncClient, headers: dict, code: str = "G-1", manager: str = "Manager M.") -> dict:
    r = await client.post("/api/v1/grants", json={"code": code, "manager_name": manager}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def create_nomenclature(client: AsyncClient, headers: dict, **kwargs) -> dict:
    payload = {"name": "Test item", "unit": "pcs", "category": "Reagents", "tracking_mode": "per_unit", **kwargs}
    r = await client.post("/api/v1/nomenclature", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def create_package(client: AsyncClient, headers: dict, nomenclature_id: int, **kwargs) -> dict:
    payload = {"nomenclature_id": nomenclature_id, "nominal_amount": "10", "current_amount": "10", **kwargs}
    r = await client.post("/api/v1/packages", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()