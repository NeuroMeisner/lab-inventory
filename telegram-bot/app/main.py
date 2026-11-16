import asyncio
import logging

import aiohttp
from aiohttp import web
from aiogram import Bot, Dispatcher

from app.backend_client import BackendClient
from app.bot_handlers import build_router
from app.config import settings
from app.webhook_server import NotificationStore, create_webhook_app

logger = logging.getLogger(__name__)


async def start_webhook_site(app: web.Application) -> web.AppRunner:
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", settings.webhook_port)
    await site.start()
    return runner


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")

    store = NotificationStore()
    session = aiohttp.ClientSession()
    client = BackendClient(settings.backend_url, settings.internal_api_secret, session)

    bot: Bot | None = None
    if settings.bot_token:
        bot = Bot(token=settings.bot_token)
        mode = "live"
        logger.info("Starting in LIVE mode (Telegram polling + webhook receiver)")
    else:
        mode = "mock"
        logger.warning(
            "BOT_TOKEN is empty — starting in MOCK mode. "
            "Telegram commands are disabled; notifications from the backend are logged. "
            "Create a bot with @BotFather and set BOT_TOKEN to go live."
        )

    runner = await start_webhook_site(create_webhook_app(store, bot_provider=lambda: bot, mode=mode))
    logger.info("Webhook receiver listening on :%s%s", settings.webhook_port, settings.webhook_path)

    try:
        if bot is not None:
            dp = Dispatcher()
            dp.include_router(build_router(client))
            await dp.start_polling(bot)   # работает, пока бот не остановлен
        else:
            await asyncio.Event().wait()  # MOCK: живём, пока не остановят
    finally:
        await session.close()
        await runner.cleanup()
        if bot is not None:
            await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass