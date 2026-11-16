import logging

import aiohttp

logger = logging.getLogger(__name__)


class NotLinkedError(Exception):
    """Пользователь ещё не связал Telegram с аккаунтом."""


class BackendError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail
        super().__init__(f"{status}: {detail}")


async def _read(resp: aiohttp.ClientResponse):
    try:
        return await resp.json()
    except Exception:  # noqa: BLE001
        return {"detail": await resp.text()}


class BackendClient:
    """Ходит в REST API бэкенда от имени пользователя (по его telegram_id).

    JWT-токены кэшируются в памяти; при 401 происходит обновление/повторный вход.
    Эндпоинты связки используют заголовок X-Bot-Secret (доверенный бот).
    """

    def __init__(self, base_url: str, internal_secret: str, session: aiohttp.ClientSession):
        self._base = base_url.rstrip("/")
        self._secret = internal_secret
        self._session = session
        self._tokens: dict[int, dict] = {}

    async def _authenticate(self, telegram_id: int) -> dict:
        async with self._session.post(
            f"{self._base}/auth/telegram",
            json={"telegram_id": telegram_id},
            headers={"X-Bot-Secret": self._secret},
        ) as resp:
            data = await _read(resp)
            if resp.status == 404:
                raise NotLinkedError()
            if resp.status >= 400:
                raise BackendError(resp.status, str(data.get("detail")))
            self._tokens[telegram_id] = data
            return data

    async def _refresh(self, telegram_id: int) -> dict:
        tokens = self._tokens.get(telegram_id)
        if not tokens:
            return await self._authenticate(telegram_id)
        async with self._session.post(
            f"{self._base}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ) as resp:
            data = await _read(resp)
            if resp.status >= 400:
                return await self._authenticate(telegram_id)
            self._tokens[telegram_id] = data
            return data

    async def request(self, telegram_id: int, method: str, path: str,
                      params: dict | None = None, json: dict | None = None):
        """Запрос от имени пользователя с автопродлением токена."""
        if telegram_id not in self._tokens:
            await self._authenticate(telegram_id)
        url = f"{self._base}{path}"
        for attempt in (1, 2):
            headers = {"Authorization": f"Bearer {self._tokens[telegram_id]['access_token']}"}
            async with self._session.request(method, url, params=params, json=json, headers=headers) as resp:
                data = await _read(resp)
                if resp.status == 401 and attempt == 1:
                    await self._refresh(telegram_id)
                    continue
                if resp.status >= 400:
                    detail = data.get("detail") if isinstance(data, dict) else str(data)
                    raise BackendError(resp.status, str(detail))
                return data
        raise BackendError(500, "Authentication retry loop failed")

    async def link(self, telegram_id: int, code: str) -> dict:
        """Связка аккаунтов (публичный эндпоинт, проверяется секретом бота)."""
        async with self._session.post(
            f"{self._base}/users/link-telegram",
            json={"telegram_id": telegram_id, "code": code},
            headers={"X-Bot-Secret": self._secret},
        ) as resp:
            data = await _read(resp)
            if resp.status >= 400:
                raise BackendError(resp.status, str(data.get("detail")))
            return data