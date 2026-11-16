from helpers import build_init_data, create_nomenclature, create_package, login


async def test_account_link_flow_end_to_end(client):
    user = await login(client, "user@lab.test")
    code_body = (await client.post("/api/v1/users/link-code", headers=user)).json()
    assert len(code_body["code"]) == 6

    r = await client.post("/api/v1/users/link-telegram",
                          json={"code": code_body["code"], "init_data": build_init_data(999111)})
    assert r.status_code == 200 and r.json()["linked"] is True

    me = (await client.get("/api/v1/users/me", headers=user)).json()
    assert me["telegram_id"] == 999111 and me["accounts_linked"] is True

    # повторное использование кода запрещено
    r = await client.post("/api/v1/users/link-telegram",
                          json={"code": code_body["code"], "init_data": build_init_data(999222)})
    assert r.status_code == 404


async def test_link_with_invalid_code(client):
    r = await client.post("/api/v1/users/link-telegram",
                          json={"code": "000000", "init_data": build_init_data(123)})
    assert r.status_code == 404


async def test_frequent_items(client):
    admin = await login(client, "admin@lab.test")
    nom = await create_nomenclature(client, admin, name="Popular reagent")
    pkg = await create_package(client, admin, nom["id"], nominal_amount="100", current_amount="100",
                               location="S-R01-02")

    u1 = await login(client, "u1@lab.test")
    for amount in ("1", "2", "3"):
        r = await client.post(f"/api/v1/packages/{pkg['id']}/write-off", json={"amount": amount}, headers=u1)
        assert r.status_code == 200

    body = (await client.get("/api/v1/users/frequent", headers=u1)).json()
    assert body["common"][0]["nomenclature_id"] == nom["id"]
    assert body["common"][0]["uses"] == 3
    assert body["personal"][0]["nomenclature_id"] == nom["id"]