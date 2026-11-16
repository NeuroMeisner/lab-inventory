from app.models import AuditLog
from app.services.codes import is_valid_nomenclature_code
from helpers import create_nomenclature, login
from sqlalchemy import select


async def test_create_requires_admin(client):
    user_headers = await login(client, "user@lab.test")
    r = await client.post("/api/v1/nomenclature",
                          json={"name": "X", "unit": "pcs", "category": "C"}, headers=user_headers)
    assert r.status_code == 403


async def test_create_generates_valid_internal_code(client):
    admin = await login(client, "admin@lab.test")
    item = await create_nomenclature(client, admin, name="Sodium chloride", cas_number="7647-14-5")
    code = item["nomenclature_code"]
    assert len(code) == 14 and code.startswith("200")
    assert is_valid_nomenclature_code(code)


async def test_codes_are_unique(client):
    admin = await login(client, "admin@lab.test")
    a = await create_nomenclature(client, admin, name="Item A")
    b = await create_nomenclature(client, admin, name="Item B")
    assert a["nomenclature_code"] != b["nomenclature_code"]


async def test_update_writes_audit_log(client, dbs):
    admin = await login(client, "admin@lab.test")
    item = await create_nomenclature(client, admin, name="Old name")
    r = await client.put(f"/api/v1/nomenclature/{item['id']}",
                         json={"name": "New name", "min_stock": "5"}, headers=admin)
    assert r.status_code == 200
    assert r.json()["name"] == "New name"

    rows = (await dbs.execute(
        select(AuditLog).where(AuditLog.entity_type == "nomenclature", AuditLog.entity_id == item["id"])
    )).scalars().all()
    assert {"name", "min_stock"} <= {r.field_name for r in rows}


async def test_list_filters(client):
    admin = await login(client, "admin@lab.test")
    await create_nomenclature(client, admin, name="Acetone", category="Solvents")
    await create_nomenclature(client, admin, name="Sodium chloride", category="Reagents")

    r = await client.get("/api/v1/nomenclature", params={"category": "Solvents"}, headers=admin)
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["name"] == "Acetone"

    r = await client.get("/api/v1/nomenclature", params={"q": "sodium"}, headers=admin)
    assert r.json()["items"][0]["name"] == "Sodium chloride"