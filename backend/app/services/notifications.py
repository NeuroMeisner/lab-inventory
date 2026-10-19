import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import User

logger = logging.getLogger(__name__)


async def admin_telegram_ids(session: AsyncSession) -> list[int]:
    rows = (await session.execute(
        select(User.telegram_id).where(
            User.role == "admin",
            User.is_active.is_(True),
            User.telegram_id.is_not(None),
        )
    )).scalars().all()
    return list(rows)


async def send_event(event: str, recipient_telegram_ids: list[int], payload: dict) -> bool:
    """Отправка уведомления боту. Без получателей или без URL — только лог."""
    if not recipient_telegram_ids:
        logger.info("Notification '%s' skipped: no recipients", event)
        return False
    body = {"event": event, "recipient_telegram_ids": recipient_telegram_ids, "payload": payload}
    if not settings.telegram_bot_webhook_url:
        logger.info("Notification '%s' (webhook not configured): %s", event, body)
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                settings.telegram_bot_webhook_url,
                json=body,
                headers={"X-Webhook-Secret": settings.internal_api_secret},
            )
            response.raise_for_status()
        return True
    except Exception as exc:  # noqa: BLE001 — уведомление не должно ронжать бизнес-логику
        logger.warning("Failed to deliver notification '%s': %s", event, exc)
        return False