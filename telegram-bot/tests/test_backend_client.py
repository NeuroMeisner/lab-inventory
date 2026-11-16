import pytest

from app.backend_client import BackendError, NotLinkedError


async def test_auth_and_search(client):
    items = await client.request(111, "GET", "/search", params={"q": "acetone"})
    assert items[0]["name"] == "Acetone analytical grade"
    assert 111 in client._tokens  # токен закэширован


async def test_not_linked_raises(client):
    with pytest.raises(NotLinkedError):
        await client.request(404004, "GET", "/search", params={"q": "x"})


async def test_token_reused_without_reauth(client):
    await client.request(111, "GET", "/users/me")
    token_before = client._tokens[111]["access_token"]
    await client.request(111, "GET", "/users/me")
    assert client._tokens[111]["access_token"] == token_before


async def test_retry_after_401(client):
    # первый ответ /flaky — 401, после обновления токена запрос повторяется
    data = await client.request(111, "GET", "/flaky")
    assert data == {"ok": True}


async def test_reserve_and_cancel(client):
    data = await client.request(111, "PUT", "/packages/457/reserve")
    assert data["reserved_until"] == "2026-10-08T15:00:00+00:00"
    data = await client.request(111, "DELETE", "/packages/457/reserve")
    assert data["reserved_by_id"] is None


async def test_packages_sorted_input_available(client):
    page = await client.request(111, "GET", "/packages", params={"nomenclature_id": 1})
    assert page["total"] == 2
    assert page["items"][0]["display_code"] == "PKG-00457"


async def test_link_ok(client):
    result = await client.link(111, "123456")
    assert result["linked"] is True and result["full_name"] == "Test User"


async def test_link_invalid_code(client):
    with pytest.raises(BackendError) as exc:
        await client.link(111, "000000")
    assert exc.value.status == 404


async def test_link_conflict(client):
    with pytest.raises(BackendError) as exc:
        await client.link(111, "777777")
    assert exc.value.status == 409