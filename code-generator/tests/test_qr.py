import io

from PIL import Image

from app.services.qr import render_qr


def test_render_size_40mm_300dpi():
    img = render_qr("LOC:L044-R01-02", round(40 / 25.4 * 300))
    assert img.size == (472, 472)


def test_api_generate_qr(client):
    r = client.post("/generate/qr", json={"location": "L044-R01-02"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (472, 472)