from helpers import create_grant, create_nomenclature, create_package, login


async def test_grant_consumption_report(client):
    admin = await login(client, "admin@lab.test")
    grant = await create_grant(client, admin, code="RNF-23-14", manager="Ivanov I.I.")
    nom = await create_nomenclature(client, admin, tracking_mode="by_measure", unit="mL")
    pkg = await create_package(client, admin, nom["id"], nominal_amount="100", current_amount="100",
                               location="S-R01-02", grant_id=grant["id"])

    await client.post(f"/api/v1/packages/{pkg['id']}/write-off", json={"amount": "10"}, headers=admin)
    await client.post(f"/api/v1/packages/{pkg['id']}/write-off", json={"amount": "5"}, headers=admin)

    r = await client.get(f"/api/v1/reports/grants/{grant['id']}/consumption", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["total_write_offs"] == 2
    assert float(body["items"][0]["total_amount"]) == 15.0


async def test_report_requires_admin(client):
    user = await login(client, "user@lab.test")
    assert (await client.get("/api/v1/reports/grants/1/consumption", headers=user)).status_code == 403