from helpers import create_nomenclature, login


async def test_create_order_with_name_temp(client):
    user = await login(client, "user@lab.test")
    r = await client.post("/api/v1/purchase-orders",
                          json={"name_temp": "Some new reagent", "expected_quantity": "10"}, headers=user)
    assert r.status_code == 201
    assert r.json()["status"] == "ordered"


async def test_receive_requires_matching_quantities(client):
    admin = await login(client, "admin@lab.test")
    nom = await create_nomenclature(client, admin)
    order = (await client.post("/api/v1/purchase-orders",
                               json={"nomenclature_id": nom["id"], "expected_quantity": "10"},
                               headers=admin)).json()
    r = await client.put(f"/api/v1/purchase-orders/{order['id']}/receive",
                         json={"quantities": ["4", "4"]}, headers=admin)
    assert r.status_code == 400


async def test_receive_creates_packages(client):
    admin = await login(client, "admin@lab.test")
    nom = await create_nomenclature(client, admin)
    order = (await client.post("/api/v1/purchase-orders",
                               json={"nomenclature_id": nom["id"], "expected_quantity": "10"},
                               headers=admin)).json()

    r = await client.put(f"/api/v1/purchase-orders/{order['id']}/receive",
                         json={"quantities": ["4", "6"], "batch_number": "B-1",
                               "expiry_date": "2028-01-01", "location": "S-R01-02"},
                         headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "received"
    assert len(body["packages"]) == 2
    codes = {p["datamatrix_code"] for p in body["packages"]}
    assert len(codes) == 2  # уникальные DataMatrix

    refreshed = (await client.get(f"/api/v1/purchase-orders", params={"status": "received"},
                                  headers=admin)).json()
    assert refreshed["total"] == 1


async def test_receive_name_temp_order_needs_nomenclature(client):
    admin = await login(client, "admin@lab.test")
    order = (await client.post("/api/v1/purchase-orders",
                               json={"name_temp": "Mystery item", "expected_quantity": "1"},
                               headers=admin)).json()
    r = await client.put(f"/api/v1/purchase-orders/{order['id']}/receive",
                         json={"quantities": ["1"]}, headers=admin)
    assert r.status_code == 400

    nom = await create_nomenclature(client, admin, name="Mystery item resolved")
    r = await client.put(f"/api/v1/purchase-orders/{order['id']}/receive",
                         json={"quantities": ["1"], "nomenclature_id": nom["id"]}, headers=admin)
    assert r.status_code == 200


async def test_cancel_order(client):
    admin = await login(client, "admin@lab.test")
    order = (await client.post("/api/v1/purchase-orders",
                               json={"name_temp": "X", "expected_quantity": "1"}, headers=admin)).json()
    assert (await client.put(f"/api/v1/purchase-orders/{order['id']}/cancel", headers=admin)).status_code == 200
    assert (await client.put(f"/api/v1/purchase-orders/{order['id']}/cancel", headers=admin)).status_code == 409