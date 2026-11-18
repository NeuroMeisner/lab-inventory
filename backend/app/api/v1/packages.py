from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_admin
from app.config import settings
from app.database import get_db
from app.models import Grant, Nomenclature, Package, Transaction, User
from app.schemas import (
    LocationUpdate, OpenPackageRequest, PackageCreate, PackageDetail, PackageOut, PackagePage,
    NomenclatureOut, WriteOffRequest,
)
from app.services.codes import build_datamatrix_content
from app.services.inventory import handle_low_stock

router = APIRouter(prefix="/packages", tags=["packages"])


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def get_package_or_404(db: AsyncSession, package_id: int) -> Package:
    pkg = await db.get(
        Package, package_id,
        options=[
            selectinload(Package.nomenclature),
            selectinload(Package.grant),
            selectinload(Package.reserved_by),
            selectinload(Package.opened_by),
        ],
    )
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return pkg


def serialize_package(p: Package) -> PackageOut:
    return PackageOut(
        id=p.id,
        nomenclature_id=p.nomenclature_id,
        nomenclature_name=p.nomenclature.name if p.nomenclature else None,
        unit=p.nomenclature.unit if p.nomenclature else None,
        category=p.nomenclature.category if p.nomenclature else None,
        tracking_mode=p.nomenclature.tracking_mode if p.nomenclature else None,
        batch_number=p.batch_number,
        nominal_amount=p.nominal_amount,
        current_amount=p.current_amount,
        expiry_date=p.expiry_date,
        zone=p.zone,
        location=p.location,
        placement_status=p.placement_status,
        opened_at=p.opened_at,
        grant_id=p.grant_id,
        grant_code=p.grant.code if p.grant else None,
        grant_manager=p.grant.manager_name if p.grant else None,
        datamatrix_code=p.datamatrix_code,
        label_printed=p.label_printed,
        reserved_by_id=p.reserved_by_id,
        reserved_by_name=p.reserved_by.full_name if p.reserved_by else None,
        reserved_until=p.reserved_until,
        created_by_id=p.created_by_id,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


# ---------- Общая логика списания (для одиночного и массового) ----------
async def apply_write_off(
    db: AsyncSession, user: User, package_id: int,
    amount: Decimal | None, grant_id: int | None, comment: str | None,
) -> Package:
    pkg = await get_package_or_404(db, package_id)
    nom = pkg.nomenclature
    old_location = pkg.location

    # Списание только из вскрытой упаковки в зоне использования (ТЗ)
    if pkg.opened_at is None:
        raise HTTPException(
            status_code=409,
            detail="Package is sealed. Open it first (Open package), then write off.",
        )
    if pkg.zone != "in_use":
        raise HTTPException(
            status_code=409,
            detail="Write-off is allowed only from the in-use zone. Move the package to a working location first.",
        )
        # Запрет «перемещения» в то же самое место и ту же зону
    if (
        pkg.placement_status == "placed"
        and payload.location == old_location
        and (payload.zone is None or payload.zone.value == pkg.zone)
    ):
        raise HTTPException(status_code=409, detail="Package is already at this location")

    pkg.location = payload.location

    if nom.tracking_mode == "per_unit":
        if amount is None or amount <= 0:
            raise HTTPException(status_code=400, detail="amount is required for per-unit items")
        if amount % 1 != 0:
            raise HTTPException(status_code=400, detail="amount must be a whole number for per-unit items")
    elif nom.tracking_mode == "by_measure":
        if amount is None or amount <= 0:
            raise HTTPException(status_code=400, detail="amount is required for measured items")
    else:  # free
        amount = amount or Decimal("0")

    if pkg.current_amount is not None and nom.tracking_mode != "free":
        if amount > pkg.current_amount:
            raise HTTPException(status_code=400, detail=f"Requested {amount}, only {pkg.current_amount} left")
        pkg.current_amount = Decimal(str(pkg.current_amount)) - amount

    resolved_grant = grant_id if grant_id is not None else pkg.grant_id
    if resolved_grant is not None and await db.get(Grant, resolved_grant) is None:
        raise HTTPException(status_code=404, detail="Grant not found")

    db.add(Transaction(
        package_id=pkg.id, user_id=user.id, grant_id=resolved_grant,
        type="write_off", amount=amount, comment=comment,
    ))
    return pkg


# ---------- Модели массового списания ----------
class WriteOffBatchItem(BaseModel):
    package_id: int
    amount: Decimal | None = None
    grant_id: int | None = None
    comment: str | None = None


class WriteOffBatchRequest(BaseModel):
    items: list[WriteOffBatchItem]


class WriteOffBatchFailure(BaseModel):
    package_id: int
    detail: str


class WriteOffBatchResult(BaseModel):
    success: int
    failed: list[WriteOffBatchFailure]


# ---------- Список и создание ----------
@router.get("", response_model=PackagePage)
async def list_packages(
    status: str | None = Query(default=None, description="placement_status: pending | placed"),
    location: str | None = None,
    zone: str | None = None,
    grant_id: int | None = None,
    nomenclature_id: int | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Package)
    if status:
        stmt = stmt.where(Package.placement_status == status)
    if location:
        stmt = stmt.where(Package.location == location)
    if zone:
        stmt = stmt.where(Package.zone == zone)
    if grant_id:
        stmt = stmt.where(Package.grant_id == grant_id)
    if nomenclature_id:
        stmt = stmt.where(Package.nomenclature_id == nomenclature_id)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(stmt.order_by(Package.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    return PackagePage(items=[serialize_package(p) for p in rows], total=total or 0, limit=limit, offset=offset)


@router.post("", response_model=PackageOut, status_code=201)
async def create_package(
    payload: PackageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    nom = await db.get(Nomenclature, payload.nomenclature_id)
    if nom is None:
        raise HTTPException(status_code=404, detail="Nomenclature not found")
    if payload.grant_id is not None and await db.get(Grant, payload.grant_id) is None:
        raise HTTPException(status_code=404, detail="Grant not found")

    current = payload.current_amount if payload.current_amount is not None else payload.nominal_amount
    pkg = Package(
        nomenclature_id=nom.id,
        batch_number=payload.batch_number,
        nominal_amount=payload.nominal_amount,
        current_amount=current,
        expiry_date=payload.expiry_date,
        zone=payload.zone.value,
        location=payload.location,
        placement_status="placed" if payload.location else "pending",
        grant_id=payload.grant_id,
        datamatrix_code="__pending__",
        created_by_id=user.id,
    )
    db.add(pkg)
    await db.flush()
    pkg.datamatrix_code = build_datamatrix_content(nom.nomenclature_code, pkg.batch_number, pkg.expiry_date, pkg.id)
    db.add(Transaction(
        package_id=pkg.id, user_id=user.id, grant_id=pkg.grant_id, type="receive",
        amount=pkg.current_amount, to_location=pkg.location, comment="Package registered",
    ))
    await db.commit()
    
    # Явно перезагружаем все поля объекта, включая обновлённый updated_at
    await db.refresh(pkg)
    return serialize_package(pkg)

# ---------- МАССОВОЕ СПИСАНИЕ (должно быть объявлено ДО маршрутов /{package_id}) ----------
@router.post("/write-off-batch", response_model=WriteOffBatchResult)
async def write_off_batch(
    payload: WriteOffBatchRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.items:
        raise HTTPException(status_code=422, detail="items must not be empty")
    failed: list[WriteOffBatchFailure] = []
    success = 0
    touched: list[tuple[int, int, int | None]] = []
    for item in payload.items:
        try:
            pkg = await apply_write_off(db, user, item.package_id, item.amount, item.grant_id, item.comment)
            success += 1
            touched.append((pkg.nomenclature_id, user.id, item.grant_id if item.grant_id is not None else pkg.grant_id))
        except HTTPException as exc:
            failed.append(WriteOffBatchFailure(package_id=item.package_id, detail=str(exc.detail)))
    await db.commit()
    for nom_id, uid, gid in touched:
        await handle_low_stock(db, nom_id, uid, gid)
    return WriteOffBatchResult(success=success, failed=failed)


# ---------- Операции с конкретной упаковкой ----------
@router.get("/{package_id}", response_model=PackageDetail)
async def get_package(package_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    p = await get_package_or_404(db, package_id)
    base = serialize_package(p)
    return PackageDetail(
        **base.model_dump(),
        nomenclature=NomenclatureOut.model_validate(p.nomenclature) if p.nomenclature else None,
        opened_by_name=p.opened_by.full_name if p.opened_by else None,
    )


@router.put("/{package_id}/location", response_model=PackageOut)
async def update_location(
    package_id: int,
    payload: LocationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pkg = await get_package_or_404(db, package_id)
    old_location = pkg.location
    pkg.location = payload.location
    if payload.zone is not None:
        pkg.zone = payload.zone.value
    if pkg.placement_status == "pending":
        pkg.placement_status = "placed"
    db.add(Transaction(
        package_id=pkg.id, user_id=user.id, type="move",
        from_location=old_location, to_location=payload.location,
    ))
    await db.commit()
    await db.refresh(pkg)
    return serialize_package(pkg)


@router.put("/{package_id}/open", response_model=PackageOut)
async def open_package(
    package_id: int,
    payload: OpenPackageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pkg = await get_package_or_404(db, package_id)
    if pkg.opened_at is not None:
        raise HTTPException(status_code=409, detail="Package is already opened")
    old_location = pkg.location
    pkg.opened_at = utcnow()
    pkg.opened_by_id = user.id
    pkg.location = payload.location
    pkg.zone = payload.zone.value
    pkg.placement_status = "placed"
    db.add(Transaction(
        package_id=pkg.id, user_id=user.id, type="open",
        from_location=old_location, to_location=payload.location,
        comment="Package opened",
    ))
    await db.commit()
    await db.refresh(pkg)
    return serialize_package(pkg)


@router.put("/{package_id}/reserve", response_model=PackageOut)
async def reserve_package(package_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    pkg = await get_package_or_404(db, package_id)
    now = utcnow()
    if pkg.reserved_by_id and pkg.reserved_until and pkg.reserved_until > now and pkg.reserved_by_id != user.id:
        raise HTTPException(status_code=409, detail="Package is already reserved by another user")
    pkg.reserved_by_id = user.id
    pkg.reserved_until = now + timedelta(minutes=settings.reserve_minutes)
    db.add(Transaction(
        package_id=pkg.id, user_id=user.id, type="reserve",
        comment=f"Reserved for {settings.reserve_minutes} minutes",
    ))
    await db.commit()
    await db.refresh(pkg)
    return serialize_package(pkg)


@router.delete("/{package_id}/reserve", response_model=PackageOut)
async def cancel_reservation(package_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    pkg = await get_package_or_404(db, package_id)
    if pkg.reserved_by_id is None:
        raise HTTPException(status_code=409, detail="Package has no active reservation")
    if pkg.reserved_by_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the reserving user or an admin can cancel")
    pkg.reserved_by_id = None
    pkg.reserved_until = None
    db.add(Transaction(package_id=pkg.id, user_id=user.id, type="unreserve", comment="Reservation cancelled"))
    await db.commit()
    await db.refresh(pkg)
    return serialize_package(pkg)


@router.post("/{package_id}/write-off", response_model=PackageOut)
async def write_off(
    package_id: int,
    payload: WriteOffRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pkg = await apply_write_off(db, user, package_id, payload.amount, payload.grant_id, payload.comment)
    await db.commit()
    grant_id = payload.grant_id if payload.grant_id is not None else pkg.grant_id
    await handle_low_stock(db, pkg.nomenclature_id, user.id, grant_id)
    await db.refresh(pkg)
    return serialize_package(pkg)