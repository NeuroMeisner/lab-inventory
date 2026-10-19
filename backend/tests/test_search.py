from helpers import create_nomenclature, login


async def _seed(client):
    admin = await login(client, "admin@lab.test")
    await create_nomenclature(client, admin, name="Acetone analytical grade",
                              synonyms=["2-propanone"], cas_number="67-64-1",
                              unit="mL", category="Solvents")
    await create_nomenclature(client, admin, name="Sodium chloride", synonyms=["NaCl"],
                              cas_number="7647-14-5", unit="g", category="Reagents")
    return admin


def names(body):
    return [i["name"] for i in body]


async def test_search_by_name(client):
    admin = await _seed(client)
    r = await client.get("/api/v1/search", params={"q": "acetone"}, headers=admin)
    assert r.status_code == 200
    assert names(r.json())[0] == "Acetone analytical grade"


async def test_search_by_synonym(client):
    admin = await _seed(client)
    r = await client.get("/api/v1/search", params={"q": "nacl"}, headers=admin)
    assert any(i["name"] == "Sodium chloride" for i in r.json())


async def test_search_by_cas(client):
    admin = await _seed(client)
    r = await client.get("/api/v1/search", params={"q": "67-64-1"}, headers=admin)
    assert names(r.json())[0] == "Acetone analytical grade"


async def test_search_tolerates_typos(client):
    admin = await _seed(client)
    r = await client.get("/api/v1/search", params={"q": "Sodium cloride"}, headers=admin)
    assert any(i["name"] == "Sodium chloride" for i in r.json())


async def test_search_requires_auth(client):
    assert (await client.get("/api/v1/search", params={"q": "acetone"})).status_code == 401