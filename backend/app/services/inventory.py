import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Nomenclature, Package, PurchaseOrder
from app.services.notifications import admin_telegram_ids, send_event

logger = logging.getLogger(__name__)


def _today_utc():
    return datetime.now(timezone.utc).date()


async def handle_low_stock(
    db: AsyncSession,
    nomenclature_id: int,
    triggered_by_id: int | None,
    grant_id: int | None,
) -> bool:
    """Если доступный (не просроченный) остаток ниже минимума — создать авто-заявку (если ещё нет) и уведомить админов."""
    nom = await db.get(Nomenclature, nomenclature_id)
    if nom is None or not nom.min_stock or Decimal(str(nom.min_stock)) <= 0:
        return False

    today = _today_utc()
    base = (
        select(func.coalesce(func.sum(Package.current_amount), 0))
        .where(Package.nomenclature_id == nomenclature_id, Package.current_amount.is_not(None))
    )
    available = await db.scalar(
        base.where(or_(Package.expiry_date.is_(None), Package.expiry_date >= today))
    )
    expired = await db.scalar(
        base.where(Package.expiry_date.is_not(None), Package.expiry_date < today)
    )

    available_d = Decimal(str(available))
    expired_d = Decimal(str(expired))
    if available_d >= Decimal(str(nom.min_stock)):
        return False

    existing = (await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.nomenclature_id == nomenclature_id,
            PurchaseOrder.status == "ordered",
        ).limit(1)
    )).scalar_one_or_none()

    auto_created = existing is None
    if auto_created:
        db.add(PurchaseOrder(
            nomenclature_id=nomenclature_id,
            expected_quantity=nom.min_stock,
            grant_id=grant_id,
            status="ordered",
            created_by_id=triggered_by_id,
        ))

    admins = await admin_telegram_ids(db)
    await db.commit()
    await send_event("low_stock", admins, {
        "nomenclature_id": nomenclature_id,
        "name": nom.name,
        "unit": nom.unit,
        "total_stock": float(available_d),
        "expired_stock": float(expired_d),
        "min_stock": float(nom.min_stock),
        "auto_order_created": auto_created,
    })
    return True