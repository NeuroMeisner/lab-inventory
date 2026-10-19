import os

from PIL import Image, ImageDraw, ImageFont

from app.services.codes import format_expiry_display
from app.services.datamatrix import GenerationError, mm_to_px, render_datamatrix
from app.services.qr import render_qr

FONT_CANDIDATES = {
    "bold": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ],
    "regular": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ],
}


def get_font(bold: bool, size_px: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES["bold" if bold else "regular"]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size_px)
    try:
        return ImageFont.load_default(size=size_px)  # Pillow >= 10.1
    except TypeError:
        return ImageFont.load_default()


def pt_to_px(pt: float, dpi: int) -> int:
    return round(pt * dpi / 72)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int, max_lines: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while draw.textlength(lines[-1] + "…", font=font) > max_width and len(lines[-1]) > 1:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    return lines


def _package_label_size_px(dpi: int) -> tuple[int, int]:
    """62×100 мм в пикселях: 732×1181 при 300 DPI."""
    return mm_to_px(62, dpi), mm_to_px(100, dpi)


def render_package_label(
    *,
    name: str | None,
    grant_code: str | None,
    grant_manager: str | None,
    batch_number: str | None,
    expiry_date: str | None,
    package_id: int | None,
    datamatrix_image: Image.Image,
    dpi: int = 300,
) -> Image.Image:
    width, height = _package_label_size_px(dpi)
    canvas = Image.new("L", (width, height), 255)
    draw = ImageDraw.Draw(canvas)

    half = width // 2
    margin = 16

    # --- Левая половина: DataMatrix максимального размера (~28 мм) ---
    dm_side = half - 2 * margin
    dm = datamatrix_image.resize((dm_side, dm_side), Image.NEAREST)
    canvas.paste(dm, (margin, (height - dm_side) // 2))

    # --- Правая половина: текст ---
    right_x = half + margin
    right_width = width - half - 2 * margin
    top_y = 40
    gap = 24

    font_name = get_font(bold=True, size_px=pt_to_px(14, dpi))
    font_grant = get_font(bold=False, size_px=pt_to_px(11, dpi))
    font_line = get_font(bold=False, size_px=pt_to_px(10, dpi))
    font_id = get_font(bold=False, size_px=pt_to_px(8, dpi))

    y = top_y
    if name:
        for line in wrap_text(draw, name, font_name, right_width, max_lines=3):
            draw.text((right_x, y), line, font=font_name, fill=0)
            y += font_name.size + 6
        y += gap

    grant_parts = [p for p in (grant_code, f"({grant_manager})" if grant_manager else None) if p]
    if grant_parts:
        for line in wrap_text(draw, " ".join(grant_parts), font_grant, right_width, max_lines=2):
            draw.text((right_x, y), line, font=font_grant, fill=0)
            y += font_grant.size + 4
        y += gap

    expiry_display = format_expiry_display(expiry_date)
    info_parts = [p for p in (batch_number, expiry_display) if p]
    if info_parts:
        line_text = " / ".join(info_parts)
        for line in wrap_text(draw, line_text, font_line, right_width, max_lines=2):
            draw.text((right_x, y), line, font=font_line, fill=0)
            y += font_line.size + 4

    if package_id is not None:
        id_text = f"ID: PKG-{package_id:05d}"
        draw.text((right_x, height - 40 - font_id.size), id_text, font=font_id, fill=0)

    return canvas


def render_location_label(*, location: str, description: str | None, dpi: int = 300) -> Image.Image:
    width, height = _package_label_size_px(dpi)
    canvas = Image.new("L", (width, height), 255)
    draw = ImageDraw.Draw(canvas)

    qr_side = mm_to_px(40, dpi)  # 40×40 мм по ТЗ 4.2.2
    qr = render_qr(f"LOC:{location}", qr_side)
    canvas.paste(qr, ((width - qr_side) // 2, 100))

    font_loc = get_font(bold=True, size_px=pt_to_px(18, dpi))
    font_desc = get_font(bold=False, size_px=pt_to_px(12, dpi))

    y = 100 + qr_side + 50
    loc_lines = wrap_text(draw, location, font_loc, width - 80, max_lines=2)
    for line in loc_lines:
        w = draw.textlength(line, font=font_loc)
        draw.text(((width - w) // 2, y), line, font=font_loc, fill=0)
        y += font_loc.size + 8

    if description:
        y += 20
        for line in wrap_text(draw, description, font_desc, width - 80, max_lines=3):
            w = draw.textlength(line, font=font_desc)
            draw.text(((width - w) // 2, y), line, font=font_desc, fill=0)
            y += font_desc.size + 6

    return canvas