from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.database import get_db
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    data = decode_token(credentials.credentials, "access")
    user = await db.get(User, int(data["sub"]))

    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # ✅ Отзыв токенов: если token_version изменилась — токен больше не действителен
    token_tv = data.get("tv", 0)
    if token_tv != user.token_version:
        raise HTTPException(status_code=401, detail="Token revoked")

    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user