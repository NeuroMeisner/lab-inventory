from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException

from app.config import settings


def _encode(payload: dict) -> str:
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    return _encode({
        "sub": str(user_id), "role": role, "type": "access",
        "iat": now, "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    })


def create_refresh_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    return _encode({
        "sub": str(user_id), "type": "refresh",
        "iat": now, "exp": now + timedelta(days=settings.refresh_token_ttl_days),
    })


def decode_token(token: str, expected_type: str) -> dict:
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if data.get("type") != expected_type:
        raise HTTPException(status_code=401, detail="Wrong token type")
    return data