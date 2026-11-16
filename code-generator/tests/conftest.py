import os

os.environ.setdefault("INTERNAL_API_SECRET", "")
os.environ.setdefault("PRINTER_ADDRESS", "")
os.environ.setdefault("PRINTER_DRY_RUN", "false")
os.environ.setdefault("PRINTER_MODEL", "QL-800")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def client():
    from app.main import create_app
    app = create_app()
    with TestClient(app) as c:
        yield c


def package_payload(**overrides) -> dict:
    data = {
        "nomenclature_code": "20000000012346",
        "batch_number": "BATCH-2026A",
        "expiry_date": "281001",
        "package_id": 991,
        "name": "Nitrile gloves, M",
        "grant_code": "RNF-23-14",
        "grant_manager": "Ivanov I.I.",
    }
    data.update(overrides)
    return {"label_type": "package", "data": data, "copies": 1}