import logging
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Nomenclature, Package, PurchaseOrder
from app.services.notifications import admin_telegram_ids, send_event

logger = logging.getLogger(__name__)


async def handle_low_stock(
    db: AsyncSession,
    nomenclature_id: int,
    triggered_by_id: int | None,
    grant_id: int | None,
) -> bool:
    """Если остаток ниже минимума — создать авто-заявку (если ещё нет) и уведомить админов."""
    nom = await db.get(Nomenclature, nomenclature_id)
    if nom is None or not nom.min_stock or Decimal(str(nom.min_stock)) <= 0:
        return False

    total = await db.scalar(
        select(func.coalesce(func.sum(Package.current_amount), 0)).where(
            Package.nomenclature_id == nomenclature_id,
            Package.current_amount.is_not(None),
        )
    )
    if Decimal(str(total)) >= Decimal(str(nom.min_stock)):
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
        "total_stock": float(total),
        "min_stock": float(nom.min_stock),
        "auto_order_created": auto_created,
    })
    return True