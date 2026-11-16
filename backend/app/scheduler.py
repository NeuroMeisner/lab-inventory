import logging
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import SessionLocal
from app.models import Package, PurchaseOrder, Transaction, User
from app.services.notifications import admin_telegram_ids, send_event

logger = logging.getLogger(__name__)

# Простая защита от повторных уведомлений в течение дня (для одного инстанса сервиса)
_notified: set[tuple] = set()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _pkg_code(p: Package) -> str:
    return f"PKG-{p.id:05d}"


def _nom_name(p: Package) -> str | None:
    return p.nomenclature.name if p.nomenclature else None


async def expire_reservations(session: AsyncSession) -> int:
    """Каждые 5 минут: снять просроченные резервы (ТЗ 1.4)."""
    rows = (await session.execute(
        select(Package).where(Package.reserved_by_id.is_not(None), Package.reserved_until < utcnow())
    )).scalars().all()
    for p in rows:
        p.reserved_by_id = None
        p.reserved_until = None
        session.add(Transaction(package_id=p.id, type="unreserve", comment="Reservation expired (auto)"))
    return len(rows)


async def notify_expiring_reservations(session: AsyncSession) -> None:
    """Предупреждение за ≤5 минут до истечения резерва (событие бота reserve_expiring)."""
    rows = (await session.execute(
        select(Package).where(
            Package.reserved_by_id.is_not(None),
            Package.reserved_until > utcnow(),
            Package.reserved_until <= utcnow() + timedelta(minutes=5),
        )
    )).scalars().all()
    for p in rows:
        key = ("reserve_expiring", p.id)
        if key in _notified:
            continue
        _notified.add(key)
        owner = await session.get(User, p.reserved_by_id)
        if owner and owner.telegram_id:
            await send_event("reserve_expiring", [owner.telegram_id], {
                "package_id": p.id, "package_code": _pkg_code(p),
                "name": _nom_name(p), "expires_at": p.reserved_until.isoformat(),
            })


async def check_expiry(session: AsyncSession) -> None:
    """Раз в сутки: сроки годности. За 30 дней — предупреждение админам; день истечения — уведомление."""
    today = utcnow().date()
    warn_rows = (await session.execute(select(Package).where(Package.expiry_date == today + timedelta(days=30)))).scalars().all()
    expired_rows = (await session.execute(select(Package).where(Package.expiry_date == today))).scalars().all()
    admins = await admin_telegram_ids(session)
    if not admins:
        return

    def brief(p: Package) -> dict:
        return {"package_id": p.id, "package_code": _pkg_code(p), "name": _nom_name(p),
                "batch_number": p.batch_number, "expiry_date": str(p.expiry_date), "location": p.location}

    if warn_rows:
        await send_event("expiry_warning_30d", admins, {"packages": [brief(p) for p in warn_rows]})
    if expired_rows:
        await send_event("package_expired", admins, {"packages": [brief(p) for p in expired_rows]})


async def notify_pending_placement(session: AsyncSession) -> None:
    """Неразмещённые упаковки старше 48 часов — уведомление создавшему сотруднику."""
    if len(_notified) > 50000:
        _notified.clear()
    cutoff = utcnow() - timedelta(hours=48)
    rows = (await session.execute(
        select(Package).where(
            Package.placement_status == "pending",
            Package.created_at < cutoff,
            Package.created_by_id.is_not(None),
        )
    )).scalars().all()

    by_user: dict[int, list[Package]] = {}
    for p in rows:
        by_user.setdefault(p.created_by_id, []).append(p)

    today = utcnow().date()
    for user_id, pkgs in by_user.items():
        key = ("pending_placement", user_id, today)
        if key in _notified:
            continue
        _notified.add(key)
        owner = await session.get(User, user_id)
        if owner and owner.telegram_id:
            await send_event("pending_placement", [owner.telegram_id], {
                "count": len(pkgs),
                "items": [{"package_id": p.id, "package_code": _pkg_code(p), "name": _nom_name(p),
                           "batch_number": p.batch_number} for p in pkgs[:5]],
            })


async def notify_overdue_orders(session: AsyncSession) -> None:
    """Просроченные ожидаемые поставки (событие бота purchase_order_due)."""
    today = utcnow().date()
    key = ("purchase_order_due", today)
    if key in _notified:
        return
    rows = (await session.execute(
        select(PurchaseOrder).where(PurchaseOrder.status == "ordered", PurchaseOrder.expected_date < today)
    )).scalars().all()
    if not rows:
        return
    _notified.add(key)

    recipient_ids = set(await admin_telegram_ids(session))
    for o in rows:
        if o.created_by_id:
            creator = await session.get(User, o.created_by_id)
            if creator and creator.telegram_id:
                recipient_ids.add(creator.telegram_id)

    await send_event("purchase_order_due", sorted(recipient_ids), {
        "orders": [{"id": o.id, "name": o.nomenclature.name if o.nomenclature else o.name_temp,
                    "expected_date": str(o.expected_date), "supplier": o.supplier} for o in rows],
    })


JobFunc = Callable[[AsyncSession], Awaitable[object]]


def _job(coro_func: JobFunc):
    async def wrapper() -> None:
        async with SessionLocal() as session:
            try:
                await coro_func(session)
                await session.commit()
            except Exception:  # noqa: BLE001
                logger.exception("Scheduled job failed: %s", coro_func.__name__)
                await session.rollback()
    return wrapper


def start_scheduler() -> AsyncIOScheduler | None:
    if not settings.scheduler_enabled:
        logger.info("Scheduler is disabled (SCHEDULER_ENABLED=false)")
        return None
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(_job(expire_reservations), "interval", minutes=5, id="expire_reservations")
    scheduler.add_job(_job(notify_expiring_reservations), "interval", minutes=5, id="notify_expiring_reservations")
    scheduler.add_job(_job(check_expiry), "cron", hour=6, minute=0, id="check_expiry")
    scheduler.add_job(_job(notify_pending_placement), "interval", hours=1, id="notify_pending_placement")
    scheduler.add_job(_job(notify_overdue_orders), "cron", hour=6, minute=10, id="notify_overdue_orders")
    scheduler.start()
    logger.info("Scheduler started (5 jobs)")
    return scheduler