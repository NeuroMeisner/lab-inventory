from pylibdmtx.pylibdmtx import encode as dm_encode
from PIL import Image, ImageOps


class GenerationError(Exception):
    pass


def mm_to_px(mm: float, dpi: int = 300) -> int:
    return round(mm / 25.4 * dpi)


def render_datamatrix(content: str, target_px: int, quiet_margin_px: int = 8) -> Image.Image:
    """DataMatrix с чёткими модулями: кодируем, находим сетку модулей,
    масштабируем целым множителем (NEAREST) и центрируем на белой подложке."""
    try:
        encoded = dm_encode(content.encode("utf-8"))
    except Exception as exc:  # DataMatrixError при переполнении и пр.
        raise GenerationError(f"DataMatrix generation failed: {exc}") from exc

    img = Image.frombytes("RGB", (encoded.width, encoded.height), encoded.pixels)
    # Бинаризуем: модули -> 255, фон -> 0
    modules = ImageOps.invert(img.convert("L")).point(lambda v: 255 if v > 128 else 0)
    bbox = modules.getbbox()
    if bbox is None:
        raise GenerationError("Empty DataMatrix produced")
    modules = modules.crop(bbox)
    module_count = modules.width  # 1 пиксель на модуль у pylibdmtx

    available = target_px - 2 * quiet_margin_px
    scale = max(1, available // module_count)
    side = module_count * scale
    modules = modules.resize((side, side), Image.NEAREST)

    canvas = Image.new("L", (target_px, target_px), 255)
    offset = (target_px - side) // 2
    canvas.paste(modules, (offset, offset))
    return canvas