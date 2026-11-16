from typing import Literal

from pydantic import BaseModel, Field


class DataMatrixRequest(BaseModel):
    content: str | None = None                 # готовая GS1-строка (приоритет)
    nomenclature_code: str | None = None
    batch_number: str | None = None
    expiry_date: str | None = None             # YYMMDD или YYYY-MM-DD
    package_id: int | None = None
    size_mm: int = Field(default=30, ge=10, le=100)
    dpi: int = Field(default=300, ge=96, le=600)


class QRRequest(BaseModel):
    location: str = Field(min_length=1, max_length=50)
    size_mm: int = Field(default=40, ge=10, le=100)
    dpi: int = Field(default=300, ge=96, le=600)


class PackageLabelData(BaseModel):
    nomenclature_code: str | None = None
    batch_number: str | None = None
    expiry_date: str | None = None
    package_id: int | None = None
    name: str | None = None
    grant_code: str | None = None
    grant_manager: str | None = None
    datamatrix_content: str | None = None      # альтернатива: готовая строка


class PackageLabelRequest(BaseModel):
    data: PackageLabelData
    dpi: int = Field(default=300, ge=96, le=600)


class LocationLabelRequest(BaseModel):
    location: str = Field(min_length=1, max_length=50)
    description: str | None = None
    dpi: int = Field(default=300, ge=96, le=600)


class PackagePrintData(PackageLabelData):
    pass


class LocationPrintData(BaseModel):
    location: str = Field(min_length=1, max_length=50)
    description: str | None = None


class PrintRequest(BaseModel):
    label_type: Literal["package", "location"]
    data: dict
    copies: int = Field(default=1, ge=1, le=50)
    printer_ip: str | None = None              # из ТЗ: упрощённый вариант
    printer_address: str | None = None         # полный: tcp://host:9100 | usb://...
    dpi: int = Field(default=300, ge=96, le=600)


class PrintResult(BaseModel):
    status: Literal["success", "error"]
    error: str | None = None
    message: str | None = None
    dry_run: bool = False
    copies: int = 0


class PrintersInfo(BaseModel):
    configured: bool
    model: str
    address: str
    label_size: str
    dry_run: bool
    known_models: list[str]