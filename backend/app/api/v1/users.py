import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.config import settings
from app.core.telegram import resolve_telegram_identity
from app.database import get_db
from app.models import AccountLinkCode, AuditLog, Nomenclature, Package, Role, Transaction, User
from app.schemas import FrequentItem, FrequentOut, LinkCodeOut, LinkTelegramRequest, LinkTelegramResult, UserOut

router = APIRouter(prefix="/users", tags=["users"])


# ---------- Вспомогательная функция для отзыва токенов ----------
async def increment_token_version(db: AsyncSession, user: User) -> None:
    """Инкремент token_version → все старые токены становятся невалидными."""
    user.token_version += 1
    await db.flush()


# ---------- Список пользователей ----------
@router.get("", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    """Список всех пользователей (только админ) — для админ-панели PWA."""
    rows = (await db.execute(select(User).order_by(User.id))).scalars().all()
    return [UserOut.model_validate(u) for u in rows]


# ---------- Профиль ----------
@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


# ---------- Связка аккаунтов ----------
@router.post("/link-code", response_model=LinkCodeOut)
async def create_link_code(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await db.execute(delete(AccountLinkCode).where(AccountLinkCode.user_id == user.id))
    code = "".join(secrets.choice("0123456789") for _ in range(6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.link_code_ttl_minutes)
    db.add(AccountLinkCode(code=code, user_id=user.id, expires_at=expires_at))
    await db.commit()
    return LinkCodeOut(code=code, expires_at=expires_at)


@router.post("/link-telegram", response_model=LinkTelegramResult)
async def link_telegram(payload: LinkTelegramRequest, request: Request, db: AsyncSession = Depends(get_db)):
    telegram_id = await resolve_telegram_identity(
        payload.init_data, payload.telegram_id, request.headers.get("X-Bot-Secret")
    )
    row = (await db.execute(
        select(AccountLinkCode).where(
            AccountLinkCode.code == payload.code,
            AccountLinkCode.expires_at > datetime.now(timezone.utc),
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Link code is invalid or expired")

    user = await db.get(User, row.user_id)
    other = (await db.execute(
        select(User).where(User.telegram_id == telegram_id, User.id != user.id)
    )).scalar_one_or_none()
    if other is not None:
        raise HTTPException(status_code=409, detail="This Telegram account is already linked to another user")

    user.telegram_id = telegram_id
    user.accounts_linked = True
    await db.delete(row)
    await db.commit()
    return LinkTelegramResult(linked=True, user_id=user.id, full_name=user.full_name)


# ---------- Часто используемые ----------
@router.get("/frequent", response_model=FrequentOut)
async def frequent_items(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    base = (
        select(
            Nomenclature.id, Nomenclature.name, Nomenclature.unit,
            func.count(Transaction.id).label("uses"),
        )
        .join(Package, Transaction.package_id == Package.id)
        .join(Nomenclature, Package.nomenclature_id == Nomenclature.id)
        .where(Transaction.type == "write_off", Transaction.timestamp >= cutoff)
    )
    common_rows = (await db.execute(
        base.group_by(Nomenclature.id, Nomenclature.name, Nomenclature.unit)
        .order_by(func.count(Transaction.id).desc()).limit(5)
    )).all()
    personal_rows = (await db.execute(
        base.where(Transaction.user_id == user.id)
        .group_by(Nomenclature.id, Nomenclature.name, Nomenclature.unit)
        .order_by(func.count(Transaction.id).desc()).limit(3)
    )).all()
    return FrequentOut(
        common=[FrequentItem(nomenclature_id=r.id, name=r.name, unit=r.unit, uses=r.uses) for r in common_rows],
        personal=[FrequentItem(nomenclature_id=r.id, name=r.name, unit=r.unit, uses=r.uses) for r in personal_rows],
    )


# ---------- Управление ролями ----------
class UserRoleUpdate(BaseModel):
    role: Role


@router.put("/{user_id}/role", response_model=UserOut)
async def update_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id and payload.role != Role.admin:
        raise HTTPException(status_code=400, detail="You cannot remove your own admin rights")

    if target.role != payload.role.value:
        db.add(AuditLog(
            entity_type="user", entity_id=target.id, field_name="role",
            old_value=target.role, new_value=payload.role.value, changed_by_id=admin.id,
        ))
        target.role = payload.role.value
        # ✅ Отзыв старых токенов при смене роли
        await increment_token_version(db, target)
        await db.commit()
        await db.refresh(target)

    return UserOut.model_validate(target)