from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models import Transaction, User
from app.schemas import TransactionOut, TransactionPage

router = APIRouter(prefix="/transactions", tags=["transactions"])


def serialize_transaction(t: Transaction) -> TransactionOut:
    return TransactionOut(
        id=t.id,
        package_id=t.package_id,
        package_code=f"PKG-{t.package_id:05d}",
        user_id=t.user_id,
        user_name=t.user.full_name if t.user else None,
        grant_id=t.grant_id,
        type=t.type,
        amount=t.amount,
        from_location=t.from_location,
        to_location=t.to_location,
        timestamp=t.timestamp,
        comment=t.comment,
    )


@router.get("", response_model=TransactionPage)
async def list_transactions(
    package_id: int | None = None,
    user_id: int | None = None,
    transaction_type: str | None = Query(default=None, alias="type"),
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Transaction)
    if package_id:
        stmt = stmt.where(Transaction.package_id == package_id)
    if user_id:
        stmt = stmt.where(Transaction.user_id == user_id)
    if transaction_type:
        stmt = stmt.where(Transaction.type == transaction_type)
    if date_from:
        stmt = stmt.where(Transaction.timestamp >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        stmt = stmt.where(Transaction.timestamp < datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(stmt.order_by(Transaction.timestamp.desc()).limit(limit).offset(offset))).scalars().all()
    return TransactionPage(items=[serialize_transaction(t) for t in rows], total=total or 0, limit=limit, offset=offset)