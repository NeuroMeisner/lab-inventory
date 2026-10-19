from datetime import datetime

from helpers import create_grant, create_nomenclature, create_package, login


async def _setup(client):
    admin = await login(client, "admin@lab.test")
    grant = await create_grant(client, admin)
    nom = await create_nomenclature(client, admin, tracking_mode="per_unit")
    return admin, grant, nom


async def test_create_package_generates_datamatrix_and_receive_transaction(client):
    admin, grant, nom = await _setup(client)
    pkg = await create_package(client, admin, nom["id"], batch_number="B1", location="S-R01-02",
                               grant_id=grant["id"])
    assert pkg["placement_status"] == "placed"
    assert f"(01){nom['nomenclature_code']}" in pkg["datamatrix_code"]
    assert f"(21){pkg['id']:06d}" in pkg["datamatrix_code"]
    assert "(10)B1" in pkg["datamatrix_code"]

    r = await client.get("/api/v1/transactions", params={"package_id": pkg["id"]}, headers=admin)
    assert r.json()["items"][0]["type"] == "receive"


async def test_move_sets_placed_and_logs_transaction(client):
    admin, _, nom = await _setup(client)
    pkg = await create_package(client, admin, nom["id"])  # без места → pending
    assert pkg["placement_status"] == "pending"

    r = await client.put(f"/api/v1/packages/{pkg['id']}/location",
                         json={"location": "L044-C01-03", "zone": "in_use"}, headers=admin)
    assert r.status_code == 200
    assert r.json()["placement_status"] == "placed"
    assert r.json()["zone"] == "in_use"

    tx = (await client.get("/api/v1/transactions", params={"package_id": pkg["id"], "type": "move"},
                           headers=admin)).json()["items"][0]
    assert tx["from_location"] is None and tx["to_location"] == "L044-C01-03"


async def test_open_package(client):
    admin, _, nom = await _setup(client)
    pkg = await create_package(client, admin, nom["id"], location="S-R01-02")

    r = await client.put(f"/api/v1/packages/{pkg['id']}/open", json={"location": "L002-R01-01"}, headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["opened_at"] is not None
    assert body["zone"] == "in_use"
    assert body["location"] == "L002-R01-01"

    tx = (await client.get("/api/v1/transactions", params={"package_id": pkg["id"], "type": "open"},
                           headers=admin)).json()["items"][0]
    assert tx["from_location"] == "S-R01-02" and tx["to_location"] == "L002-R01-01"

    assert (await client.put(f"/api/v1/packages/{pkg['id']}/open",
                             json={"location": "L002-R01-02"}, headers=admin)).status_code == 409


async def test_reserve_flow(client):
    admin, _, nom = await _setup(client)
    pkg = await create_package(client, admin, nom["id"], location="S-R01-02")
    u1 = await login(client, "u1@lab.test")
    u2 = await login(client, "u2@lab.test")

    r = await client.put(f"/api/v1/packages/{pkg['id']}/reserve", headers=u1)
    assert r.status_code == 200
    until = datetime.fromisoformat(r.json()["reserved_until"])
    delta_seconds = (until - datetime.now(until.tzinfo)).total_seconds()
    assert 28 * 60 < delta_seconds < 32 * 60

    assert (await client.put(f"/api/v1/packages/{pkg['id']}/reserve", headers=u2)).status_code == 409
    assert (await client.delete(f"/api/v1/packages/{pkg['id']}/reserve", headers=u2)).status_code == 403

    r = await client.delete(f"/api/v1/packages/{pkg['id']}/reserve", headers=u1)
    assert r.status_code == 200 and r.json()["reserved_until"] is None


async def test_write_off_per_unit(client):
    admin, _, nom = await _setup(client)
    pkg = await create_package(client, admin, nom["id"], location="S-R01-02")

    r = await client.post(f"/api/v1/packages/{pkg['id']}/write-off", json={"amount": "3"}, headers=admin)
    assert r.status_code == 200
    assert float(r.json()["current_amount"]) == 7.0

    assert (await client.post(f"/api/v1/packages/{pkg['id']}/write-off",
                              json={"amount": "999"}, headers=admin)).status_code == 400
    assert (await client.post(f"/api/v1/packages/{pkg['id']}/write-off",
                              json={}, headers=admin)).status_code == 400


async def test_write_off_free_mode_no_amount_required(client):
    admin = await login(client, "admin@lab.test")
    nom = await create_nomenclature(client, admin, tracking_mode="free", unit="g")
    pkg = await create_package(client, admin, nom["id"], location="S-R01-02")
    r = await client.post(f"/api/v1/packages/{pkg['id']}/write-off", json={}, headers=admin)
    assert r.status_code == 200


async def test_low_stock_creates_purchase_order_once(client):
    admin = await login(client, "admin@lab.test")
    nom = await create_nomenclature(client, admin, tracking_mode="by_measure", unit="mL", min_stock="5")
    pkg = await create_package(client, admin, nom["id"], nominal_amount="4", current_amount="4",
                               location="S-R01-02")

    await client.post(f"/api/v1/packages/{pkg['id']}/write-off", json={"amount": "1"}, headers=admin)
    orders = (await client.get("/api/v1/purchase-orders", params={"status": "ordered"}, headers=admin)).json()
    assert orders["total"] == 1
    assert orders["items"][0]["nomenclature_id"] == nom["id"]

    await client.post(f"/api/v1/packages/{pkg['id']}/write-off", json={"amount": "1"}, headers=admin)
    orders = (await client.get("/api/v1/purchase-orders", params={"status": "ordered"}, headers=admin)).json()
    assert orders["total"] == 1  # повторная заявка не создаётся