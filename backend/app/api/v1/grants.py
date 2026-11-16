from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.database import get_db
from app.models import Grant, User
from app.schemas import GrantCreate, GrantOut, GrantUpdate

router = APIRouter(prefix="/grants", tags=["grants"])


@router.get("", response_model=list[GrantOut])
async def list_grants(
    is_active: bool | None = Query(default=True),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Grant)
    if is_active is not None:
        stmt = stmt.where(Grant.is_active == is_active)
    rows = (await db.execute(stmt.order_by(Grant.code))).scalars().all()
    return [GrantOut.model_validate(g) for g in rows]


@router.post("", response_model=GrantOut, status_code=201)
async def create_grant(payload: GrantCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    grant = Grant(**payload.model_dump())
    db.add(grant)
    await db.commit()
    await db.refresh(grant)
    return GrantOut.model_validate(grant)


@router.put("/{grant_id}", response_model=GrantOut)
async def update_grant(grant_id: int, payload: GrantUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    grant = await db.get(Grant, grant_id)
    if grant is None:
        raise HTTPException(status_code=404, detail="Grant not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(grant, field, value)
    await db.commit()
    await db.refresh(grant)
    return GrantOut.model_validate(grant)