from aiohttp.test_utils import TestClient, TestServer

from app.webhook_server import NotificationStore, create_webhook_app


async def _client():
    store = NotificationStore()
    app = create_webhook_app(store, bot_provider=lambda: None, mode="mock")
    client = TestClient(TestServer(app))
    await client.start_server()
    return client, store


async def test_health():
    client, _ = await _client()
    r = await client.get("/health")
    assert r.status == 200
    body = await r.json()
    assert body["mode"] == "mock" and body["telegram_connected"] is False
    await client.close()


async def test_webhook_requires_secret():
    client, store = await _client()
    r = await client.post("/bot/webhook", json={"event": "low_stock"})
    assert r.status == 401
    assert store.items() == []
    await client.close()


async def test_webhook_accepts_and_stores_notification():
    client, store = await _client()
    payload = {"event": "low_stock", "recipient_telegram_ids": [111],
               "payload": {"name": "Acetone", "unit": "mL", "total_stock": 100,
                           "min_stock": 500, "auto_order_created": True}}
    r = await client.post("/bot/webhook", json=payload, headers={"X-Webhook-Secret": "test-secret"})
    assert r.status == 200
    body = await r.json()
    assert body["status"] == "ok"
    assert body["delivered"] == 0  # MOCK: Telegram не подключён
    assert len(store.items()) == 1

    r = await client.get("/mock/notifications")
    assert (await r.json())["notifications"][0]["event"] == "low_stock"
    await client.close()