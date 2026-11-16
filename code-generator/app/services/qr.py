import qrcode
from PIL import Image

from app.services.datamatrix import GenerationError


def render_qr(content: str, target_px: int) -> Image.Image:
    try:
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2)
        qr.add_data(content)
        qr.make(fit=True)
        module_count = qr.modules_count
        box = max(1, target_px // (module_count + 4))
        img = qr.make_image(fill_color="black", back_color="white").convert("L")
        return img.resize((target_px, target_px), Image.NEAREST)
    except Exception as exc:  # noqa: BLE001
        raise GenerationError(f"QR generation failed: {exc}") from exc