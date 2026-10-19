import logging

from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)


class PrinterUnavailable(Exception):
    pass


def _backend_for(address: str) -> str:
    if address.startswith("tcp://"):
        return "network"
    if address.startswith("usb://"):
        return "pyusb"
    if address.startswith("file:"):
        return "file"
    raise PrinterUnavailable(f"Unsupported printer address scheme: {address}")


def send_to_printer(images: list[Image.Image], copies: int = 1) -> dict:
    """Отправляет этикетки на Brother QL. Возвращает словарь-статус для /print."""
    if not settings.printer_address:
        raise PrinterUnavailable(
            "Printer is not configured (set PRINTER_ADDRESS, e.g. tcp://192.168.1.100:9100)"
        )

    from brother_ql.backends.helpers import send
    from brother_ql.conversion import convert
    from brother_ql.raster import BrotherQLRaster

    ql = BrotherQLRaster(settings.printer_model)
    ql.exception_on_warning = True
    instructions = convert(
        ql=ql,
        images=images * copies,
        label_size=settings.label_size,
        cut=True,
        dpi=settings.label_dpi,
    )
    send(
        instructions=instructions,
        printer_identifier=settings.printer_address,
        backend_identifier=_backend_for(settings.printer_address),
        blocking=True,
    )
    logger.info("Sent %d label(s) to %s (%s)", len(images) * copies, settings.printer_address, settings.printer_model)
    return {"status": "success", "copies": len(images) * copies, "printer": settings.printer_address}