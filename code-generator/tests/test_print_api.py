from app.config import settings
from tests.conftest import package_payload


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["printer_configured"] is False


def test_printers_endpoint(client):
    r = client.get("/printers")
    assert r.status_code == 200
    body = r.json()
    assert body["configured"] is False
    assert body["model"] == "QL-800"
    assert "QL-820NWB" in body["known_models"]


def test_print_returns_printer_unavailable_when_not_configured(client):
    r = client.post("/print", json=package_payload())
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "error"
    assert body["error"] == "printer_unavailable"


def test_print_dry_run_success(client, monkeypatch):
    monkeypatch.setattr(settings, "printer_dry_run", True)
    r = client.post("/print", json=package_payload())
    body = r.json()
    assert body["status"] == "success"
    assert body["dry_run"] is True
    assert body["copies"] == 1


def test_print_location_label_dry_run(client, monkeypatch):
    monkeypatch.setattr(settings, "printer_dry_run", True)
    r = client.post("/print", json={
        "label_type": "location", "data": {"location": "L154-R02-01"}, "copies": 3,
    })
    body = r.json()
    assert body["status"] == "success" and body["copies"] == 3


def test_print_generation_failed(client):
    r = client.post("/print", json={"label_type": "package", "data": {"batch_number": "no code"}})
    assert r.json()["status"] == "error"
    assert r.json()["error"] == "generation_failed"


def test_internal_secret_enforced_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "internal_api_secret", "s3cr3t")
    assert client.get("/health").status_code == 401
    assert client.get("/health", headers={"X-Internal-Secret": "wrong"}).status_code == 401
    assert client.get("/health", headers={"X-Internal-Secret": "s3cr3t"}).status_code == 200