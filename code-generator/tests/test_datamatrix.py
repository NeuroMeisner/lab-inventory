import io

from PIL import Image
from pylibdmtx.pylibdmtx import decode

from app.services.codes import build_datamatrix_content
from app.services.datamatrix import mm_to_px, render_datamatrix


def test_render_size_30mm_300dpi():
    img = render_datamatrix("(01)20000000012346(21)000991", mm_to_px(30, 300))
    assert img.size == (354, 354)  # 30 мм при 300 DPI
    assert img.mode == "L"


def test_datamatrix_roundtrip_decode():
    content = build_datamatrix_content("20000000012346", "BATCH-2026A", "281001", 991)
    img = render_datamatrix(content, 354)
    decoded = decode(img)
    assert len(decoded) == 1
    assert decoded[0].data.decode() == content


def test_long_content_fails_gracefully():
    from app.services.datamatrix import GenerationError
    import pytest
    with pytest.raises(GenerationError):
        render_datamatrix("X" * 5000, 354)


def test_api_generate_datamatrix(client):
    r = client.post("/api/v1/../generate/datamatrix".replace("/api/v1/", ""),
                    json={"nomenclature_code": "20000000012346", "batch_number": "B1",
                          "expiry_date": "2028-10-01", "package_id": 12})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (354, 354)
    assert decode(img)[0].data.decode() == "(01)20000000012346(10)B1(15)281001(21)000012"