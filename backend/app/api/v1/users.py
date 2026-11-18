import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.config import settings
from app.core.telegram import resolve_telegram_identity
from app.database import get_db
from app.models import AccountLinkCode, AuditLog, Nomenclature, Package, Role, Transaction, User
from app.schemas import FrequentItem, FrequentOut, LinkCodeOut, LinkTelegramRequest, LinkTelegramResult, UserOut

router = APIRouter(prefix="/users", tags=["users"])


def _audit(db: AsyncSession, entity_id: int, field: str, old, new, admin_id: int, reason: str | None = None) -> None:
    db.add(AuditLog(
        entity_type="user", entity_id=entity_id, field_name=field,
        old_value=None if old is None else str(old),
        new_value=None if new is None else str(new),
        changed_by_id=admin_id, reason=reason,
    ))


async def _revoke_sessions(db: AsyncSession, user: User) -> None:
    user.token_version = (user.token_version or 0) + 1
    await db.flush()


@router.get("", response_model=list[UserOut])
async def list_users(
    include_inactive: bool = True,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(User).order_by(User.id)
    if not include_inactive:
        stmt = stmt.where(User.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()
    return [UserOut.model_validate(u) for u in rows]


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.post("/me/logout-all")
async def logout_everywhere(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await _revoke_sessions(db, user)
    _audit(db, user.id, "token_version", None, "revoked all sessions", user.id, "User logged out everywhere")
    await db.commit()
    return {"ok": True, "detail": "All sessions revoked"}


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
    if user is None or not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
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


class UserRoleUpdate(BaseModel):
    role: Role


class DeactivateRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


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
        _audit(db, target.id, "role", target.role, payload.role.value, admin.id)
        target.role = payload.role.value
        await _revoke_sessions(db, target)
        await db.commit()
        await db.refresh(target)
    return UserOut.model_validate(target)


@router.put("/{user_id}/deactivate", response_model=UserOut)
async def deactivate_user(
    user_id: int,
    payload: DeactivateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    if not target.is_active:
        raise HTTPException(status_code=409, detail="Account is already deactivated")

    _audit(db, target.id, "is_active", True, False, admin.id, payload.reason)
    target.is_active = False
    target.deactivation_reason = payload.reason
    target.deactivated_at = datetime.now(timezone.utc)
    await _revoke_sessions(db, target)
    await db.commit()
    await db.refresh(target)
    return UserOut.model_validate(target)


@router.put("/{user_id}/reactivate", response_model=UserOut)
async def reactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.is_active:
        raise HTTPException(status_code=409, detail="Account is already active")

    _audit(db, target.id, "is_active", False, True, admin.id, "Reactivated by admin")
    target.is_active = True
    target.deactivation_reason = None
    target.deactivated_at = None
    await _revoke_sessions(db, target)
    await db.commit()
    await db.refresh(target)
    return UserOut.model_validate(target)