import logging
from collections import deque
from datetime import datetime, timezone

from aiohttp import web

from app.config import settings
from app.formatting import format_event

logger = logging.getLogger(__name__)


class NotificationStore:
    """Последние принятые уведомления (для отладки и MOCK-режима)."""

    def __init__(self, maxlen: int = 100):
        self._items: deque = deque(maxlen=maxlen)

    def record(self, data: dict) -> None:
        self._items.append({"received_at": datetime.now(timezone.utc).isoformat(), **data})

    def items(self) -> list[dict]:
        return list(self._items)


def create_webhook_app(store: NotificationStore, bot_provider, mode: str) -> web.Application:
    app = web.Application()

    async def webhook(request: web.Request) -> web.Response:
        if request.headers.get("X-Webhook-Secret") != settings.internal_api_secret:
            return web.json_response({"detail": "Invalid webhook secret"}, status=401)
        try:
            data = await request.json()
        except Exception:  # noqa: BLE001
            return web.json_response({"detail": "Invalid JSON"}, status=400)

        store.record(data)
        event = data.get("event")
        text = format_event(event, data.get("payload") or {})
        bot = bot_provider()

        delivered = 0
        if text is None:
            logger.warning("Unknown notification event: %s", event)
        elif bot is None:
            logger.info("MOCK notification [%s]: %s", event, text)
        else:
            for telegram_id in data.get("recipient_telegram_ids", []):
                try:
                    await bot.send_message(telegram_id, text)
                    delivered += 1
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Failed to deliver [%s] to %s: %s", event, telegram_id, exc)

        return web.json_response({"status": "ok", "delivered": delivered})

    async def health(request: web.Request) -> web.Response:
        return web.json_response({
            "status": "ok",
            "mode": mode,
            "telegram_connected": bot_provider() is not None,
        })

    async def notifications(request: web.Request) -> web.Response:
        return web.json_response({"mode": mode, "notifications": store.items()})

    app.router.add_post(settings.webhook_path, webhook)
    app.router.add_get("/health", health)
    app.router.add_get("/mock/notifications", notifications)
    return app