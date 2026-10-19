from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.database import get_db
from app.models import AuditLog, Nomenclature, User
from app.schemas import NomenclatureCreate, NomenclatureOut, NomenclaturePage, NomenclatureUpdate
from app.services.codes import generate_nomenclature_code
from sqlalchemy import text

router = APIRouter(prefix="/nomenclature", tags=["nomenclature"])


@router.get("", response_model=NomenclaturePage)
async def list_nomenclature(
    q: str | None = None,
    category: str | None = None,
    tracking_mode: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Nomenclature)
    if category:
        stmt = stmt.where(Nomenclature.category == category)
    if tracking_mode:
        stmt = stmt.where(Nomenclature.tracking_mode == tracking_mode)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            Nomenclature.name.ilike(like),
            Nomenclature.cas_number.ilike(like),
            func.coalesce(func.array_to_string(Nomenclature.synonyms, " "), "").ilike(like),
        ))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(stmt.order_by(Nomenclature.name).limit(limit).offset(offset))).scalars().all()
    return NomenclaturePage(items=[NomenclatureOut.model_validate(r) for r in rows], total=total or 0, limit=limit, offset=offset)


@router.get("/{item_id}", response_model=NomenclatureOut)
async def get_nomenclature(item_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    item = await db.get(Nomenclature, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Nomenclature not found")
    return NomenclatureOut.model_validate(item)


@router.post("", response_model=NomenclatureOut, status_code=201)
async def create_nomenclature(
    payload: NomenclatureCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    seq = await db.scalar(text("SELECT nextval('nomenclature_code_seq')"))
    item = Nomenclature(**payload.model_dump(), nomenclature_code=generate_nomenclature_code(int(seq)))
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return NomenclatureOut.model_validate(item)


@router.put("/{item_id}", response_model=NomenclatureOut)
async def update_nomenclature(
    item_id: int,
    payload: NomenclatureUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    item = await db.get(Nomenclature, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Nomenclature not found")

    changes = []
    for field, new_value in payload.model_dump(exclude_unset=True).items():
        old_value = getattr(item, field)
        if old_value != new_value:
            changes.append((field, old_value, new_value))
            setattr(item, field, new_value)

    for field, old_value, new_value in changes:
        db.add(AuditLog(
            entity_type="nomenclature", entity_id=item.id, field_name=field,
            old_value=str(old_value), new_value=str(new_value), changed_by_id=user.id,
        ))
    await db.commit()
    await db.refresh(item)
    return NomenclatureOut.model_validate(item)