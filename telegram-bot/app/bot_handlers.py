import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from app import texts
from app.backend_client import BackendClient, BackendError, NotLinkedError
from app.config import settings
from app.formatting import fmt_datetime, format_package_card, format_search_results

logger = logging.getLogger(__name__)


def _fefo_sort(packages: list[dict]) -> list[dict]:
    return sorted(packages, key=lambda p: (p.get("expiry_date") is None, p.get("expiry_date") or ""))


def pwa_link(package_id: int, action: str = "write-off") -> str:
    return f"{settings.pwa_public_url.rstrip('/')}/package/{package_id}?action={action}"


def build_router(client: BackendClient) -> Router:
    router = Router()

    def kb(rows: list[list[InlineKeyboardButton]]) -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=rows)

    async def _say(target, text: str, markup=None):
        """Отправка сообщения в ответ на message или callback."""
        if isinstance(target, CallbackQuery):
            await target.message.answer(text, reply_markup=markup)
        else:
            await target.answer(text, reply_markup=markup)

    async def _backend_error(target, exc: BackendError):
        await _say(target, texts.BACKEND_ERROR.format(status=exc.status, detail=exc.detail))

    # ---------- /start, /help ----------
    @router.message(CommandStart())
    async def cmd_start(message: Message):
        await message.answer(texts.WELCOME)

    @router.message(Command("help"))
    async def cmd_help(message: Message):
        await message.answer(texts.HELP)

    # ---------- /link <код> ----------
    @router.message(Command("link"))
    async def cmd_link(message: Message):
        parts = (message.text or "").split()
        if len(parts) != 2 or not parts[1].isdigit() or len(parts[1]) != 6:
            await message.answer(texts.LINK_USAGE)
            return
        try:
            result = await client.link(message.from_user.id, parts[1])
        except BackendError as exc:
            await _backend_error(message, exc)
            return
        await message.answer(texts.LINK_OK.format(name=result.get("full_name") or "colleague"))

    # ---------- /search <название> ----------
    @router.message(Command("search"))
    async def cmd_search(message: Message):
        parts = (message.text or "").split(maxsplit=1)
        if len(parts) < 2 or not parts[1].strip():
            await message.answer(texts.SEARCH_USAGE)
            return
        query = parts[1].strip()
        try:
            items = await client.request(message.from_user.id, "GET", "/search", params={"q": query})
        except NotLinkedError:
            await message.answer(texts.NOT_LINKED)
            return
        except BackendError as exc:
            await _backend_error(message, exc)
            return
        if not items:
            await message.answer(texts.SEARCH_EMPTY.format(q=query))
            return
        buttons = [
            [InlineKeyboardButton(text=f"[{i}] {it['name'][:40]}", callback_data=f"nom:{it['id']}")]
            for i, it in enumerate(items[:10], 1)
        ]
        await message.answer(format_search_results(items), reply_markup=kb(buttons))

    # ---------- выбор позиции из поиска ----------
    @router.callback_query(F.data.startswith("nom:"))
    async def cb_nomenclature(callback: CallbackQuery):
        nomenclature_id = int(callback.data.split(":")[1])
        try:
            page = await client.request(callback.from_user.id, "GET", "/packages",
                                        params={"nomenclature_id": nomenclature_id, "limit": 50})
        except NotLinkedError:
            await callback.message.answer(texts.NOT_LINKED)
            await callback.answer()
            return
        except BackendError as exc:
            await _backend_error(callback, exc)
            await callback.answer()
            return

        packages = _fefo_sort(page.get("items", []))
        if not packages:
            await callback.message.answer("No packages available.")
            await callback.answer()
            return
        for p in packages:
            buttons = kb([[
                InlineKeyboardButton(text=texts.BTN_WRITE_OFF_WEB, callback_data=f"wo:{p['id']}"),
                InlineKeyboardButton(text=texts.BTN_RESERVE, callback_data=f"res:{p['id']}"),
            ]])
            await callback.message.answer(format_package_card(p), reply_markup=buttons)
        await callback.answer()

    # ---------- deep link на списание ----------
    @router.callback_query(F.data.startswith("wo:"))
    async def cb_write_off(callback: CallbackQuery):
        package_id = int(callback.data.split(":")[1])
        url = pwa_link(package_id, "write-off")
        buttons = kb([[InlineKeyboardButton(text=texts.BTN_OPEN_PWA, url=url)]])
        await callback.message.answer(texts.DEEP_LINK_MSG.format(code=f"PKG-{package_id:05d}"), reply_markup=buttons)
        await callback.answer()

    # ---------- резервирование ----------
    @router.callback_query(F.data.startswith("res:"))
    async def cb_reserve(callback: CallbackQuery):
        package_id = int(callback.data.split(":")[1])
        try:
            data = await client.request(callback.from_user.id, "PUT", f"/packages/{package_id}/reserve")
        except BackendError as exc:
            if exc.status == 409:
                await callback.message.answer(texts.RESERVE_CONFLICT)
            else:
                await _backend_error(callback, exc)
            await callback.answer()
            return
        except NotLinkedError:
            await callback.message.answer(texts.NOT_LINKED)
            await callback.answer()
            return

        buttons = kb([
            [InlineKeyboardButton(text=texts.BTN_OPEN_PWA, url=pwa_link(package_id, "write-off"))],
            [InlineKeyboardButton(text=texts.BTN_CANCEL_RESERVE, callback_data=f"unres:{package_id}")],
        ])
        await callback.message.answer(
            texts.RESERVE_OK.format(code=data.get("display_code", f"PKG-{package_id:05d}"),
                                    until=fmt_datetime(data.get("reserved_until"))),
            reply_markup=buttons,
        )
        await callback.answer()

    @router.callback_query(F.data.startswith("unres:"))
    async def cb_unreserve(callback: CallbackQuery):
        package_id = int(callback.data.split(":")[1])
        try:
            await client.request(callback.from_user.id, "DELETE", f"/packages/{package_id}/reserve")
        except BackendError as exc:
            await _backend_error(callback, exc)
            await callback.answer()
            return
        await callback.message.answer(texts.UNRESERVE_OK)
        await callback.answer()

    # ---------- /mypackages ----------
    @router.message(Command("mypackages"))
    async def cmd_my_packages(message: Message):
        tg = message.from_user.id
        try:
            me = await client.request(tg, "GET", "/users/me")
            page = await client.request(tg, "GET", "/transactions",
                                        params={"user_id": me["id"], "type": "open", "limit": 100})
        except NotLinkedError:
            await message.answer(texts.NOT_LINKED)
            return
        except BackendError as exc:
            await _backend_error(message, exc)
            return

        package_ids = list(dict.fromkeys(t["package_id"] for t in page.get("items", [])))[:20]
        if not package_ids:
            await message.answer(texts.MY_EMPTY)
            return
        for pid in package_ids:
            try:
                p = await client.request(tg, "GET", f"/packages/{pid}")
            except BackendError:
                continue
            buttons = kb([[InlineKeyboardButton(text=texts.BTN_OPEN_PWA, url=pwa_link(pid, "details"))]])
            await message.answer(format_package_card(p), reply_markup=buttons)

    # ---------- /pending ----------
    @router.message(Command("pending"))
    async def cmd_pending(message: Message):
        tg = message.from_user.id
        try:
            me = await client.request(tg, "GET", "/users/me")
            page = await client.request(tg, "GET", "/packages", params={"status": "pending", "limit": 200})
        except NotLinkedError:
            await message.answer(texts.NOT_LINKED)
            return
        except BackendError as exc:
            await _backend_error(message, exc)
            return

        mine = [p for p in page.get("items", []) if p.get("created_by_id") == me["id"]]
        if not mine:
            await message.answer(texts.PENDING_EMPTY)
            return
        for p in mine:
            buttons = kb([[InlineKeyboardButton(text=texts.BTN_PLACE_PWA, url=pwa_link(p["id"], "move"))]])
            await message.answer(format_package_card(p), reply_markup=buttons)

    # ---------- неизвестные сообщения ----------
    @router.message()
    async def fallback(message: Message):
        await message.answer(texts.UNKNOWN)

    return router