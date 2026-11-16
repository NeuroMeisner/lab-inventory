from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_admin
from app.database import get_db
from app.models import Grant, Nomenclature, Package, PurchaseOrder, Transaction, User
from app.schemas import (
    PurchaseOrderCreate, PurchaseOrderOut, PurchaseOrderPage, ReceiveRequest, ReceiveResult, PackageOut,
)
from app.services.codes import build_datamatrix_content

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])


def serialize_order(o: PurchaseOrder) -> PurchaseOrderOut:
    return PurchaseOrderOut(
        id=o.id,
        nomenclature_id=o.nomenclature_id,
        nomenclature_name=o.nomenclature.name if o.nomenclature else None,
        name_temp=o.name_temp,
        expected_quantity=o.expected_quantity,
        expected_date=o.expected_date,
        supplier=o.supplier,
        invoice_number=o.invoice_number,
        grant_id=o.grant_id,
        grant_code=o.grant.code if o.grant else None,
        status=o.status,
        created_by_id=o.created_by_id,
        created_by_name=o.created_by.full_name if o.created_by else None,
        created_at=o.created_at,
    )


@router.get("", response_model=PurchaseOrderPage)
async def list_orders(
    status: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(PurchaseOrder)
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(stmt.order_by(PurchaseOrder.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    return PurchaseOrderPage(items=[serialize_order(o) for o in rows], total=total or 0, limit=limit, offset=offset)


@router.post("", response_model=PurchaseOrderOut, status_code=201)
async def create_order(
    payload: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.nomenclature_id is None and not payload.name_temp:
        raise HTTPException(status_code=422, detail="Provide nomenclature_id or name_temp")
    if payload.nomenclature_id is not None and await db.get(Nomenclature, payload.nomenclature_id) is None:
        raise HTTPException(status_code=404, detail="Nomenclature not found")
    if payload.grant_id is not None and await db.get(Grant, payload.grant_id) is None:
        raise HTTPException(status_code=404, detail="Grant not found")

    order = PurchaseOrder(**payload.model_dump(), status="ordered", created_by_id=user.id)
    db.add(order)
    await db.commit()
    await db.refresh(order, attribute_names=["nomenclature", "grant", "created_by"])
    return serialize_order(order)


@router.put("/{order_id}/receive", response_model=ReceiveResult)
async def receive_order(
    order_id: int,
    payload: ReceiveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    order = await db.get(PurchaseOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if order.status != "ordered":
        raise HTTPException(status_code=409, detail=f"Order is already {order.status}")

    nomenclature_id = order.nomenclature_id or payload.nomenclature_id
    if nomenclature_id is None:
        raise HTTPException(status_code=400, detail="Order has no nomenclature. Register it first or pass nomenclature_id.")
    nom = await db.get(Nomenclature, nomenclature_id)
    if nom is None:
        raise HTTPException(status_code=404, detail="Nomenclature not found")

    total_qty = sum(payload.quantities)
    if order.expected_quantity is not None and total_qty != order.expected_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Sum of quantities ({total_qty}) must equal expected quantity ({order.expected_quantity})",
        )

    grant_id = payload.grant_id if payload.grant_id is not None else order.grant_id
    created_ids: list[int] = []
    for qty in payload.quantities:
        pkg = Package(
            nomenclature_id=nom.id,
            batch_number=payload.batch_number,
            nominal_amount=qty,
            current_amount=qty,
            expiry_date=payload.expiry_date,
            zone=payload.zone.value,
            location=payload.location,
            placement_status="placed" if payload.location else "pending",
            grant_id=grant_id,
            datamatrix_code="__pending__",
            created_by_id=user.id,
        )
        db.add(pkg)
        await db.flush()
        pkg.datamatrix_code = build_datamatrix_content(nom.nomenclature_code, payload.batch_number, payload.expiry_date, pkg.id)
        db.add(Transaction(
            package_id=pkg.id, user_id=user.id, grant_id=grant_id, type="receive",
            amount=qty, to_location=payload.location,
            comment=f"Received against purchase order #{order.id}",
        ))
        created_ids.append(pkg.id)

    order.status = "received"
    await db.commit()

    fresh = (await db.execute(
        select(Package)
        .where(Package.id.in_(created_ids))
        .options(
            selectinload(Package.nomenclature),
            selectinload(Package.grant),
            selectinload(Package.reserved_by),
            selectinload(Package.opened_by),
        )
        .order_by(Package.id)
    )).scalars().all()
    from app.api.v1.packages import serialize_package
    return ReceiveResult(order_id=order.id, status="received", packages=[serialize_package(p) for p in fresh])

@router.put("/{order_id}/cancel", response_model=PurchaseOrderOut)
async def cancel_order(order_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    order = await db.get(PurchaseOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if order.status != "ordered":
        raise HTTPException(status_code=409, detail=f"Order is already {order.status}")
    order.status = "cancelled"
    await db.commit()
    await db.refresh(order, attribute_names=["nomenclature", "grant", "created_by"])
    return serialize_order(order)