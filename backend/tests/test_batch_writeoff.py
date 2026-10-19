from helpers import create_nomenclature, create_package, login


async def test_batch_write_off_partial_success(client):
    admin = await login(client, "admin@lab.test")
    nom = await create_nomenclature(client, admin, tracking_mode="per_unit")
    pkg = await create_package(client, admin, nom["id"], nominal_amount="10", current_amount="10",
                               location="S-R01-02")

    r = await client.post("/api/v1/packages/write-off-batch", json={"items": [
        {"package_id": pkg["id"], "amount": "3"},        # ок
        {"package_id": pkg["id"], "amount": "999"},      # недостаточно остатка
        {"package_id": 999999, "amount": "1"},           # не существует
    ]}, headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["success"] == 1
    assert len(body["failed"]) == 2

    refreshed = (await client.get(f"/api/v1/packages/{pkg['id']}", headers=admin)).json()
    assert float(refreshed["current_amount"]) == 7.0


async def test_batch_free_mode_no_amount(client):
    admin = await login(client, "admin@lab.test")
    nom = await create_nomenclature(client, admin, tracking_mode="free", unit="g")
    pkg = await create_package(client, admin, nom["id"], location="S-R01-02")
    r = await client.post("/api/v1/packages/write-off-batch",
                          json={"items": [{"package_id": pkg["id"]}]}, headers=admin)
    assert r.status_code == 200 and r.json()["success"] == 1