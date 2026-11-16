import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from fastapi import HTTPException

from app.config import settings

INIT_DATA_MAX_AGE = 86400  # 24 часа


def verify_init_data(init_data: str, bot_token: str) -> dict:
    """Возвращает объект user из initData, если подпись валидна."""
    if not bot_token:
        raise HTTPException(status_code=503, detail="BOT_TOKEN is not configured")
    try:
        params = dict(parse_qsl(init_data))
    except ValueError:
        raise HTTPException(status_code=401, detail="Malformed init_data")
    received_hash = params.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=401, detail="Missing hash in init_data")

    auth_date = int(params.get("auth_date", 0) or 0)
    if auth_date and time.time() - auth_date > INIT_DATA_MAX_AGE:
        raise HTTPException(status_code=401, detail="init_data is too old")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, received_hash):
        raise HTTPException(status_code=401, detail="Invalid init_data signature")

    try:
        return json.loads(params["user"])
    except (KeyError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Missing user in init_data")


async def resolve_telegram_identity(init_data: str | None, telegram_id: int | None, bot_secret_header: str | None) -> int:
    """
    Два доверенных пути:
    1. Криптографически подписанный initData (Telegram WebApp).
    2. Прямой telegram_id от нашего бота (защищено общим секретом X-Bot-Secret).
    """
    if init_data:
        user = verify_init_data(init_data, settings.bot_token)
        return int(user["id"])
    if telegram_id is None:
        raise HTTPException(status_code=422, detail="Provide init_data or telegram_id")
    if not settings.internal_api_secret or bot_secret_header != settings.internal_api_secret:
        raise HTTPException(status_code=401, detail="Invalid bot secret")
    return telegram_id