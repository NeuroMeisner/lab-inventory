import ipaddress

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.core.telegram import resolve_telegram_identity
from app.database import get_db
from app.models import User
from app.schemas import GoogleAuthRequest, RefreshRequest, TelegramAuthRequest, TokenPair

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


def _ip_allowed(ip: str, patterns: list[str]) -> bool:
    if not patterns or not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for p in patterns:
        try:
            if "/" in p:
                if addr in ipaddress.ip_network(p, strict=False):
                    return True
            elif addr == ipaddress.ip_address(p):
                return True
        except ValueError:
            continue
    return False


def _issue_tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id, user.role, user.token_version),
        refresh_token=create_refresh_token(user.id, user.token_version),
        expires_in=settings.access_token_ttl_minutes * 60,
    )


@router.post("/google", response_model=TokenPair)
async def login_google(payload: GoogleAuthRequest, request: Request, db: AsyncSession = Depends(get_db)):
    if settings.dev_mode and payload.credential.startswith("dev:"):
        if not settings.dev_mode_allowed_ips_list or not settings.dev_mode_allowed_emails_list:
            raise HTTPException(
                status_code=503,
                detail="DEV_MODE is on but not restricted. Set DEV_MODE_ALLOWED_IPS and DEV_MODE_ALLOWED_EMAILS.",
            )
        ip = _client_ip(request)
        if not _ip_allowed(ip, settings.dev_mode_allowed_ips_list):
            raise HTTPException(status_code=403, detail=f"Development sign-in is not allowed from this address ({ip})")
        email = payload.credential[4:].strip().lower()
        if email not in settings.dev_mode_allowed_emails_list:
            raise HTTPException(status_code=403, detail="Development sign-in is not allowed for this email")
        full_name = email.split("@")[0].replace(".", " ").title()
    else:
        if not settings.google_client_id:
            raise HTTPException(status_code=503, detail="Google OAuth is not configured (GOOGLE_CLIENT_ID missing)")
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
        try:
            info = google_id_token.verify_token(
                payload.credential, google_requests.Request(), audience=settings.google_client_id
            )
        except Exception:  # noqa: BLE001
            raise HTTPException(status_code=401, detail="Invalid Google credential")
        if not info.get("email_verified", False):
            raise HTTPException(status_code=401, detail="Google email is not verified")
        email = str(info.get("email", "")).lower()
        full_name = info.get("name") or email

    if not email:
        raise HTTPException(status_code=401, detail="Unable to resolve user email")

    user = (await db.execute(select(User).where(User.google_email == email))).scalar_one_or_none()
    if user is None:
        role = "admin" if email in settings.google_admin_emails_list else "user"
        user = User(google_email=email, full_name=full_name, role=role, is_active=True, token_version=0)
        db.add(user)
        await db.flush()
    elif user.is_active is False:
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact your lab administrator for access restoration or data deletion requests.")

    await db.commit()
    await db.refresh(user)
    return _issue_tokens(user)


@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    data = decode_token(payload.refresh_token, expected_type="refresh")
    user = await db.get(User, int(data["sub"]))
    if user is None or user.is_active is False:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    if data.get("tv", 0) != user.token_version:
        raise HTTPException(status_code=401, detail="Token revoked")
    return _issue_tokens(user)


@router.post("/telegram", response_model=TokenPair)
async def login_telegram(payload: TelegramAuthRequest, request: Request, db: AsyncSession = Depends(get_db)):
    telegram_id = await resolve_telegram_identity(
        payload.init_data, payload.telegram_id, request.headers.get("X-Bot-Secret")
    )
    user = (await db.execute(select(User).where(User.telegram_id == telegram_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Telegram account is not linked. Use the /link command in the bot.")
    if user.is_active is False:
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact your lab administrator for access restoration or data deletion requests.")
    return _issue_tokens(user)