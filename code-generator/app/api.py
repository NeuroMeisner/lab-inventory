import io
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from PIL import Image

from app.config import settings
from app.schemas import (
    DataMatrixRequest, LocationLabelRequest, PackageLabelRequest, PrintRequest, PrintResult,
    PrintersInfo, QRRequest,
)
from app.services import label as label_service
from app.services.codes import build_datamatrix_content
from app.services.datamatrix import GenerationError, mm_to_px, render_datamatrix
from app.services.printing import PrinterUnavailable, send_to_printer
from app.services.qr import render_qr

logger = logging.getLogger(__name__)
router = APIRouter()


def require_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    if settings.internal_api_secret and x_internal_secret != settings.internal_api_secret:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Internal-Secret")


def png_response(image: Image.Image) -> Response:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


def _resolve_datamatrix_content(payload: DataMatrixRequest) -> str:
    if payload.content:
        return payload.content
    try:
        return build_datamatrix_content(
            payload.nomenclature_code, payload.batch_number, payload.expiry_date, payload.package_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/health")
def health():
    return {"status": "ok", "printer_configured": bool(settings.printer_address)}


@router.post("/generate/datamatrix")
def generate_datamatrix(payload: DataMatrixRequest):
    content = _resolve_datamatrix_content(payload)
    try:
        image = render_datamatrix(content, mm_to_px(payload.size_mm, payload.dpi))
    except GenerationError as exc:
        raise HTTPException(status_code=422, detail=f"generation_failed: {exc}")
    return png_response(image)


@router.post("/generate/qr")
def generate_qr(payload: QRRequest):
    try:
        image = render_qr(f"LOC:{payload.location}", mm_to_px(payload.size_mm, payload.dpi))
    except GenerationError as exc:
        raise HTTPException(status_code=422, detail=f"generation_failed: {exc}")
    return png_response(image)


@router.post("/render/package-label")
def render_package_label(payload: PackageLabelRequest):
    d = payload.data
    if d.datamatrix_content:
        content = d.datamatrix_content
    else:
        try:
            content = build_datamatrix_content(d.nomenclature_code, d.batch_number, d.expiry_date, d.package_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    try:
        dm_side = mm_to_px(28, payload.dpi)
        dm = render_datamatrix(content, dm_side)
        image = label_service.render_package_label(
            name=d.name, grant_code=d.grant_code, grant_manager=d.grant_manager,
            batch_number=d.batch_number, expiry_date=d.expiry_date, package_id=d.package_id,
            datamatrix_image=dm, dpi=payload.dpi,
        )
    except GenerationError as exc:
        raise HTTPException(status_code=422, detail=f"generation_failed: {exc}")
    return png_response(image)


@router.post("/render/location-label")
def render_location_label(payload: LocationLabelRequest):
    try:
        image = label_service.render_location_label(
            location=payload.location, description=payload.description, dpi=payload.dpi,
        )
    except GenerationError as exc:
        raise HTTPException(status_code=422, detail=f"generation_failed: {exc}")
    return png_response(image)


KNOWN_MODELS = ["QL-500", "QL-550", "QL-580", "QL-600", "QL-650TD", "QL-700", "QL-710W",
                "QL-720NW", "QL-800", "QL-810W", "QL-820NWB", "QL-1050", "QL-1060N",
                "QL-1100", "QL-1110NWB", "QL-1115NWB"]


@router.get("/printers", response_model=PrintersInfo)
def printers(_: None = Depends(require_secret)):
    return PrintersInfo(
        configured=bool(settings.printer_address),
        model=settings.printer_model,
        address=settings.printer_address,
        label_size=settings.label_size,
        dry_run=settings.printer_dry_run,
        known_models=KNOWN_MODELS,
    )


@router.post("/print", response_model=PrintResult)
def print_label(payload: PrintRequest, _: None = Depends(require_secret)):
    # 1. Рендер этикетки
    try:
        if payload.label_type == "package":
            d = payload.data
            content = d.get("datamatrix_content") or build_datamatrix_content(
                d.get("nomenclature_code"), d.get("batch_number"), d.get("expiry_date"), d.get("package_id"),
            )
            dm = render_datamatrix(content, mm_to_px(28, payload.dpi))
            image = label_service.render_package_label(
                name=d.get("name"), grant_code=d.get("grant_code"), grant_manager=d.get("grant_manager"),
                batch_number=d.get("batch_number"), expiry_date=d.get("expiry_date"),
                package_id=d.get("package_id"), datamatrix_image=dm, dpi=payload.dpi,
            )
        else:
            location = payload.data.get("location")
            if not location:
                raise ValueError("data.location is required for location labels")
            image = label_service.render_location_label(
                location=location, description=payload.data.get("description"), dpi=payload.dpi,
            )
    except (GenerationError, ValueError) as exc:
        return PrintResult(status="error", error="generation_failed", message=str(exc))

    # 2. Печать (или dry-run / ошибка недоступности)
    if settings.printer_dry_run:
        logger.info("DRY RUN: label rendered, printing skipped")
        return PrintResult(status="success", dry_run=True, copies=payload.copies)

    address = payload.printer_address or (f"tcp://{payload.printer_ip}:9100" if payload.printer_ip else None)
    if address and address != settings.printer_address:
        # Разовая печать на другой принтер (например, из формы админа)
        from app.services import printing as printing_module
        original = settings.printer_address
        try:
            settings.printer_address = address
            result = send_to_printer([image], copies=payload.copies)
        except PrinterUnavailable as exc:
            return PrintResult(status="error", error="printer_unavailable", message=str(exc))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Printing failed")
            return PrintResult(status="error", error="printing_failed", message=str(exc))
        finally:
            settings.printer_address = original
        return PrintResult(status="success", copies=result["copies"])

    try:
        result = send_to_printer([image], copies=payload.copies)
    except PrinterUnavailable as exc:
        return PrintResult(status="error", error="printer_unavailable", message=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Printing failed")
        return PrintResult(status="error", error="printing_failed", message=str(exc))
    return PrintResult(status="success", copies=result["copies"])