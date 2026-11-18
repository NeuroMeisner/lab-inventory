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


def _issue_tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id, user.role, user.token_version),
        refresh_token=create_refresh_token(user.id, user.token_version),
        expires_in=settings.access_token_ttl_minutes * 60,
    )


@router.post("/google", response_model=TokenPair)
async def login_google(payload: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    if settings.dev_mode and payload.credential.startswith("dev:"):
        email = payload.credential[4:].strip().lower()
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
        user = User(google_email=email, full_name=full_name, role=role)
        db.add(user)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    await db.commit()
    await db.refresh(user)
    return _issue_tokens(user)


@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    data = decode_token(payload.refresh_token, expected_type="refresh")
    user = await db.get(User, int(data["sub"]))
    if user is None or not user.is_active:
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
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    return _issue_tokens(user)