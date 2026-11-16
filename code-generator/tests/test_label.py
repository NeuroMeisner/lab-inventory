import io

from PIL import Image
from pylibdmtx.pylibdmtx import decode

from app.services.datamatrix import render_datamatrix
from app.services.label import render_location_label, render_package_label


def _sample_label() -> Image.Image:
    dm = render_datamatrix("(01)20000000012346(10)BATCH-2026A(15)281001(21)000991", 330)
    return render_package_label(
        name="Nitrile gloves, M",
        grant_code="RNF-23-14",
        grant_manager="Ivanov I.I.",
        batch_number="BATCH-2026A",
        expiry_date="281001",
        package_id=991,
        datamatrix_image=dm,
    )


def test_package_label_dimensions_62x100():
    label = _sample_label()
    assert label.size == (732, 1181)  # 62×100 мм @ 300 DPI


def test_datamatrix_decodable_from_full_label():
    """DataMatrix в левой половине полной этикетки обязан считываться."""
    label = _sample_label()
    left_half = label.crop((0, 0, 400, 1181))
    decoded = decode(left_half)
    assert len(decoded) == 1
    assert decoded[0].data.decode() == "(01)20000000012346(10)BATCH-2026A(15)281001(21)000991"


def test_location_label_dimensions():
    label = render_location_label(location="L044-R01-02", description="Room 044, Rack 1, Shelf 2")
    assert label.size == (732, 1181)


def test_api_render_package_label(client):
    r = client.post("/render/package-label", json={"data": {
        "nomenclature_code": "20000000012346", "batch_number": "B1",
        "expiry_date": "2028-10-01", "package_id": 457,
        "name": "Acetone, analytical grade", "grant_code": "MO-2024", "grant_manager": "Petrova A.A.",
    }})
    assert r.status_code == 200
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (732, 1181)


def test_api_render_location_label(client):
    r = client.post("/render/location-label", json={"location": "S-R01-02", "description": "Warehouse"})
    assert r.status_code == 200
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (732, 1181)