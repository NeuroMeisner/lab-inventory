from app.models import User
from helpers import build_init_data, login
from sqlalchemy import select


async def test_google_dev_login_and_me(client):
    headers = await login(client, "user@lab.test")
    r = await client.get("/api/v1/users/me", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["google_email"] == "user@lab.test"
    assert body["role"] == "user"


async def test_admin_role_from_env(client):
    headers = await login(client, "admin@lab.test")
    me = (await client.get("/api/v1/users/me", headers=headers)).json()
    assert me["role"] == "admin"


async def test_refresh_flow(client):
    r = await client.post("/api/v1/auth/google", json={"credential": "dev:user@lab.test"})
    refresh_token = r.json()["refresh_token"]
    r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert r2.status_code == 200
    headers = {"Authorization": f"Bearer {r2.json()['access_token']}"}
    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 200


async def test_access_without_token(client):
    assert (await client.get("/api/v1/users/me")).status_code == 401


async def test_telegram_auth_with_init_data(client, dbs):
    dbs.add(User(google_email="linked@lab.test", full_name="Linked", role="user",
                 telegram_id=777001, accounts_linked=True))
    await dbs.commit()
    r = await client.post("/api/v1/auth/telegram", json={"init_data": build_init_data(777001)})
    assert r.status_code == 200
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert (await client.get("/api/v1/users/me", headers=headers)).json()["telegram_id"] == 777001


async def test_telegram_auth_unlinked(client):
    r = await client.post("/api/v1/auth/telegram", json={"init_data": build_init_data(404001)})
    assert r.status_code == 404


async def test_telegram_auth_by_id_requires_secret(client, dbs):
    dbs.add(User(google_email="x@lab.test", full_name="X", role="user", telegram_id=555))
    await dbs.commit()
    assert (await client.post("/api/v1/auth/telegram", json={"telegram_id": 555})).status_code == 401
    r = await client.post("/api/v1/auth/telegram", json={"telegram_id": 555},
                          headers={"X-Bot-Secret": "test-internal-secret"})
    assert r.status_code == 200


async def test_tampered_init_data_rejected(client, dbs):
    dbs.add(User(google_email="t@lab.test", full_name="T", role="user", telegram_id=888))
    await dbs.commit()
    tampered = build_init_data(888).replace("hash=", "hash=00")
    assert (await client.post("/api/v1/auth/telegram", json={"init_data": tampered})).status_code == 401