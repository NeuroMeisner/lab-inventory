from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.database import get_db
from app.models import Grant, Nomenclature, Package, Transaction, User
from app.schemas import ConsumptionItem, GrantConsumptionReport, GrantOut

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/grants/{grant_id}/consumption", response_model=GrantConsumptionReport)
async def grant_consumption(
    grant_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    grant = await db.get(Grant, grant_id)
    if grant is None:
        raise HTTPException(status_code=404, detail="Grant not found")

    stmt = (
        select(
            Nomenclature.id, Nomenclature.name, Nomenclature.unit,
            func.coalesce(func.sum(Transaction.amount), 0).label("total_amount"),
            func.count(Transaction.id).label("cnt"),
        )
        .join(Package, Transaction.package_id == Package.id)
        .join(Nomenclature, Package.nomenclature_id == Nomenclature.id)
        .where(Transaction.type == "write_off", Transaction.grant_id == grant_id)
    )
    if date_from:
        stmt = stmt.where(Transaction.timestamp >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        stmt = stmt.where(Transaction.timestamp < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc))
    stmt = stmt.group_by(Nomenclature.id, Nomenclature.name, Nomenclature.unit).order_by(func.count(Transaction.id).desc())

    rows = (await db.execute(stmt)).all()
    items = [
        ConsumptionItem(nomenclature_id=r.id, name=r.name, unit=r.unit, total_amount=r.total_amount, write_off_count=r.cnt)
        for r in rows
    ]
    return GrantConsumptionReport(
        grant=GrantOut.model_validate(grant),
        date_from=date_from,
        date_to=date_to,
        items=items,
        total_write_offs=sum(i.write_off_count for i in items),
    )