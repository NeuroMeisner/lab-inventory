import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.config import settings
from app.core.net import client_ip
from app.core.telegram import resolve_telegram_identity
from app.database import get_db
from app.models import AccountLinkCode, AuditLog, LinkAttempt, Nomenclature, Package, Role, Transaction, User
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
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Список пользователей. Админы видят всех (с фильтром), остальные — только активных."""
    stmt = select(User).order_by(User.id)
    if user.role != "admin" or not include_inactive:
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


# ---------- Защита кода связки от перебора ----------
async def _link_rate_guard(db: AsyncSession, telegram_id: int | None, ip: str) -> None:
    now = datetime.now(timezone.utc)
    fails = await db.scalar(
        select(func.count()).select_from(LinkAttempt).where(
            LinkAttempt.ts >= now - timedelta(minutes=15),
            LinkAttempt.success.is_(False),
            or_(LinkAttempt.ip == ip, LinkAttempt.telegram_id == telegram_id),
        )
    )
    if (fails or 0) >= 10:
        raise HTTPException(status_code=429, detail="Too many failed link attempts. Try again in 15 minutes.")
    per_ip = await db.scalar(
        select(func.count()).select_from(LinkAttempt).where(
            LinkAttempt.ts >= now - timedelta(minutes=1), LinkAttempt.ip == ip,
        )
    )
    if (per_ip or 0) >= 20:
        raise HTTPException(status_code=429, detail="Too many link attempts from this address.")
    per_tg = await db.scalar(
        select(func.count()).select_from(LinkAttempt).where(
            LinkAttempt.ts >= now - timedelta(minutes=1), LinkAttempt.telegram_id == telegram_id,
        )
    )
    if (per_tg or 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many link attempts from this Telegram account.")


def _record_attempt(db: AsyncSession, telegram_id: int | None, ip: str, success: bool) -> None:
    db.add(LinkAttempt(telegram_id=telegram_id, ip=ip, success=success))


@router.post("/link-telegram", response_model=LinkTelegramResult)
async def link_telegram(payload: LinkTelegramRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = client_ip(request)
    telegram_id = await resolve_telegram_identity(
        payload.init_data, payload.telegram_id, request.headers.get("X-Bot-Secret")
    )
    await _link_rate_guard(db, telegram_id, ip)

    row = (await db.execute(
        select(AccountLinkCode).where(
            AccountLinkCode.code == payload.code,
            AccountLinkCode.expires_at > datetime.now(timezone.utc),
        )
    )).scalar_one_or_none()
    if row is None:
        _record_attempt(db, telegram_id, ip, False)
        await db.commit()
        raise HTTPException(status_code=404, detail="Link code is invalid or expired")

    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        _record_attempt(db, telegram_id, ip, False)
        await db.commit()
        raise HTTPException(status_code=403, detail="Account is deactivated")

    other = (await db.execute(
        select(User).where(User.telegram_id == telegram_id, User.id != user.id)
    )).scalar_one_or_none()
    if other is not None:
        _record_attempt(db, telegram_id, ip, False)
        await db.commit()
        raise HTTPException(status_code=409, detail="This Telegram account is already linked to another user")

    user.telegram_id = telegram_id
    user.accounts_linked = True
    await db.delete(row)
    _record_attempt(db, telegram_id, ip, True)
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

class AnonymizeRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


@router.post("/{user_id}/anonymize", response_model=UserOut)
async def anonymize_user(
    user_id: int,
    payload: AnonymizeRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Удаление PII по запросу субъекта данных (GDPR/152-ФЗ). История транзакций сохраняется."""
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot anonymize your own account")
    if target.pii_removed_at is not None:
        raise HTTPException(status_code=409, detail="PII already removed")

    # Сохраняем старые значения для аудита
    old_email = target.google_email
    old_telegram = target.telegram_id
    old_name = target.full_name

    # Удаляем PII
    target.google_email = None
    target.telegram_id = None
    target.full_name = f"Deleted user #{target.id}"
    target.is_active = False
    target.pii_removed_at = datetime.now(timezone.utc)
    target.token_version = (target.token_version or 0) + 1

    _audit(db, target.id, "pii_removed", None, "PII anonymized", admin.id, payload.reason)
    db.add(AuditLog(
        entity_type="user", entity_id=target.id, field_name="google_email",
        old_value=old_email, new_value="NULL", changed_by_id=admin.id, reason=payload.reason,
    ))
    db.add(AuditLog(
        entity_type="user", entity_id=target.id, field_name="telegram_id",
        old_value=str(old_telegram) if old_telegram else None, new_value="NULL",
        changed_by_id=admin.id, reason=payload.reason,
    ))
    db.add(AuditLog(
        entity_type="user", entity_id=target.id, field_name="full_name",
        old_value=old_name, new_value=target.full_name, changed_by_id=admin.id, reason=payload.reason,
    ))

    await db.commit()
    await db.refresh(target)
    return UserOut.model_validate(target)    