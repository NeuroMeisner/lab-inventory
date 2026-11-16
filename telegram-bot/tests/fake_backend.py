"""Мини-копия бэкенда Модуля 1 для тестирования бота."""
from aiohttp import web

SECRET = "test-secret"

PACKAGE_457 = {
    "id": 457, "display_code": "PKG-00457", "nomenclature_id": 1,
    "nomenclature_name": "Acetone analytical grade", "unit": "mL", "category": "Solvents",
    "tracking_mode": "by_measure", "batch_number": "A2305", "nominal_amount": 1000,
    "current_amount": 400, "expiry_date": "2028-10-01", "zone": "in_use",
    "location": "L044-C01-03", "placement_status": "placed",
    "opened_at": "2026-09-01T09:00:00+00:00", "grant_id": 1,
    "grant_code": "RNF-23-14", "grant_manager": "Ivanov I.I.",
    "datamatrix_code": "(01)20000000000013(10)A2305(15)281001(21)000457",
    "label_printed": True, "reserved_by_id": None, "reserved_by_name": None,
    "reserved_until": None, "created_by_id": 7,
    "created_at": "2026-09-01T09:00:00+00:00", "updated_at": "2026-09-01T09:00:00+00:00",
}
PACKAGE_458 = {**PACKAGE_457, "id": 458, "display_code": "PKG-00458", "current_amount": 1000,
               "zone": "storage", "location": "S-R01-02", "opened_at": None}

FLAKY = {"calls": 0}
PROTECTED_EXEMPT = {"/auth/telegram", "/auth/refresh", "/users/link-telegram"}


@web.middleware
async def auth_middleware(request: web.Request, handler):
    if request.path not in PROTECTED_EXEMPT:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer acc-"):
            return web.json_response({"detail": "Invalid token"}, status=401)
    return await handler(request)


def create_fake_app() -> web.Application:
    app = web.Application(middlewares=[auth_middleware])

    async def auth_telegram(request):
        if request.headers.get("X-Bot-Secret") != SECRET:
            return web.json_response({"detail": "invalid secret"}, status=401)
        data = await request.json()
        tg = data.get("telegram_id")
        if tg == 404004:
            return web.json_response({"detail": "not linked"}, status=404)
        return web.json_response({"access_token": f"acc-{tg}", "refresh_token": f"ref-{tg}", "expires_in": 3600})

    async def refresh(request):
        data = await request.json()
        tg = data["refresh_token"].removeprefix("ref-")
        return web.json_response({"access_token": f"acc-{tg}", "refresh_token": f"ref-{tg}", "expires_in": 3600})

    async def search(request):
        return web.json_response([{
            "id": 1, "name": "Acetone analytical grade", "synonyms": None,
            "cas_number": "67-64-1", "unit": "mL", "category": "Solvents",
            "tracking_mode": "by_measure", "storage_temp": None,
            "nomenclature_code": "20000000000013", "packages_available": 2, "total_amount": 1400,
        }])

    async def packages_list(request):
        return web.json_response({"items": [PACKAGE_457, PACKAGE_458], "total": 2, "limit": 50, "offset": 0})

    async def package_detail(request):
        pid = int(request.match_info["pid"])
        pkg = PACKAGE_457 if pid == 457 else PACKAGE_458
        return web.json_response({**pkg, "id": pid})

    async def reserve(request):
        return web.json_response({**PACKAGE_457, "reserved_by_id": 7,
                                  "reserved_until": "2026-10-08T15:00:00+00:00"})

    async def unreserve(request):
        return web.json_response(PACKAGE_457)

    async def link(request):
        if request.headers.get("X-Bot-Secret") != SECRET:
            return web.json_response({"detail": "invalid secret"}, status=401)
        code = (await request.json()).get("code")
        if code == "123456":
            return web.json_response({"linked": True, "user_id": 7, "full_name": "Test User"})
        if code == "777777":
            return web.json_response({"detail": "already linked to another user"}, status=409)
        return web.json_response({"detail": "invalid or expired"}, status=404)

    async def me(request):
        return web.json_response({"id": 7, "google_email": "test@lab.test", "telegram_id": 111,
                                  "full_name": "Test User", "role": "user", "default_grant_id": None,
                                  "is_active": True, "accounts_linked": True,
                                  "created_at": "2026-09-01T09:00:00+00:00"})

    async def transactions(request):
        return web.json_response({"items": [{
            "id": 1, "package_id": 457, "package_code": "PKG-00457", "user_id": 7,
            "user_name": "Test User", "grant_id": None, "type": "open", "amount": None,
            "from_location": "S-R01-02", "to_location": "L044-C01-03",
            "timestamp": "2026-10-01T10:00:00+00:00", "comment": None,
        }], "total": 1, "limit": 50, "offset": 0})

    async def flaky(request):
        FLAKY["calls"] += 1
        if FLAKY["calls"] == 1:
            return web.json_response({"detail": "token expired"}, status=401)
        return web.json_response({"ok": True})

    app.router.add_post("/auth/telegram", auth_telegram)
    app.router.add_post("/auth/refresh", refresh)
    app.router.add_get("/search", search)
    app.router.add_get("/packages", packages_list)
    app.router.add_get("/packages/{pid}", package_detail)
    app.router.add_put("/packages/{pid}/reserve", reserve)
    app.router.add_delete("/packages/{pid}/reserve", unreserve)
    app.router.add_post("/users/link-telegram", link)
    app.router.add_get("/users/me", me)
    app.router.add_get("/transactions", transactions)
    app.router.add_get("/flaky", flaky)
    return app