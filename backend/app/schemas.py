from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models import Zone


# ---------- Auth ----------
class GoogleAuthRequest(BaseModel):
    credential: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TelegramAuthRequest(BaseModel):
    telegram_id: int | None = None
    init_data: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


# ---------- Users ----------
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    google_email: str | None
    telegram_id: int | None
    full_name: str | None
    role: str
    default_grant_id: int | None
    is_active: bool
    accounts_linked: bool
    created_at: datetime


class LinkCodeOut(BaseModel):
    code: str
    expires_at: datetime


class LinkTelegramRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)
    telegram_id: int | None = None
    init_data: str | None = None


class LinkTelegramResult(BaseModel):
    linked: bool
    user_id: int
    full_name: str | None


class FrequentItem(BaseModel):
    nomenclature_id: int
    name: str
    unit: str
    uses: int


class FrequentOut(BaseModel):
    common: list[FrequentItem]
    personal: list[FrequentItem]


# ---------- Grants ----------
class GrantCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    manager_name: str = Field(min_length=1, max_length=255)
    expiry_date: date | None = None
    is_active: bool = True


class GrantUpdate(BaseModel):
    code: str | None = None
    manager_name: str | None = None
    expiry_date: date | None = None
    is_active: bool | None = None


class GrantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    manager_name: str
    expiry_date: date | None
    is_active: bool


# ---------- Nomenclature ----------
class NomenclatureCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    synonyms: list[str] = []
    cas_number: str | None = Field(default=None, max_length=20)
    unit: str = Field(min_length=1, max_length=20)
    category: str = Field(min_length=1, max_length=50)
    tracking_mode: str = "free"
    storage_temp: str | None = Field(default=None, max_length=20)
    min_stock: Decimal = Decimal("0")
    is_hazardous: bool = False
    sds_link: str | None = None
    manufacturer_code: str | None = Field(default=None, max_length=100)


class NomenclatureUpdate(BaseModel):
    name: str | None = None
    synonyms: list[str] | None = None
    cas_number: str | None = None
    unit: str | None = None
    category: str | None = None
    tracking_mode: str | None = None
    storage_temp: str | None = None
    min_stock: Decimal | None = None
    is_hazardous: bool | None = None
    sds_link: str | None = None
    manufacturer_code: str | None = None


class NomenclatureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    synonyms: list[str] | None
    cas_number: str | None
    unit: str
    category: str
    tracking_mode: str
    storage_temp: str | None
    min_stock: Decimal
    is_hazardous: bool
    sds_link: str | None
    manufacturer_code: str | None
    nomenclature_code: str
    created_at: datetime


class NomenclaturePage(BaseModel):
    items: list[NomenclatureOut]
    total: int
    limit: int
    offset: int


# ---------- Packages ----------
class PackageCreate(BaseModel):
    nomenclature_id: int
    batch_number: str | None = Field(default=None, max_length=100)
    nominal_amount: Decimal | None = None
    current_amount: Decimal | None = None
    expiry_date: date | None = None
    zone: Zone = Zone.storage
    location: str | None = Field(default=None, max_length=50)
    grant_id: int | None = None


class LocationUpdate(BaseModel):
    location: str = Field(min_length=1, max_length=50)
    zone: Zone | None = None


class OpenPackageRequest(BaseModel):
    location: str = Field(min_length=1, max_length=50)
    zone: Zone = Zone.in_use


class WriteOffRequest(BaseModel):
    amount: Decimal | None = None
    grant_id: int | None = None
    comment: str | None = None


class PackageOut(BaseModel):
    id: int
    nomenclature_id: int
    nomenclature_name: str | None = None
    unit: str | None = None
    category: str | None = None
    tracking_mode: str | None = None
    batch_number: str | None
    nominal_amount: Decimal | None
    current_amount: Decimal | None
    expiry_date: date | None
    zone: str
    location: str | None
    placement_status: str
    opened_at: datetime | None
    grant_id: int | None
    grant_code: str | None = None
    grant_manager: str | None = None
    datamatrix_code: str
    label_printed: bool
    reserved_by_id: int | None
    reserved_by_name: str | None = None
    reserved_until: datetime | None
    created_by_id: int | None
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def display_code(self) -> str:
        return f"PKG-{self.id:05d}"


class PackageDetail(PackageOut):
    nomenclature: NomenclatureOut | None = None
    opened_by_name: str | None = None


class PackagePage(BaseModel):
    items: list[PackageOut]
    total: int
    limit: int
    offset: int


# ---------- Transactions ----------
class TransactionOut(BaseModel):
    id: int
    package_id: int
    package_code: str
    user_id: int | None
    user_name: str | None
    grant_id: int | None
    type: str
    amount: Decimal | None
    from_location: str | None
    to_location: str | None
    timestamp: datetime
    comment: str | None


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int


# ---------- Purchase orders ----------
class PurchaseOrderCreate(BaseModel):
    nomenclature_id: int | None = None
    name_temp: str | None = Field(default=None, max_length=255)
    expected_quantity: Decimal | None = None
    expected_date: date | None = None
    supplier: str | None = Field(default=None, max_length=255)
    invoice_number: str | None = Field(default=None, max_length=100)
    grant_id: int | None = None


class PurchaseOrderOut(BaseModel):
    id: int
    nomenclature_id: int | None
    nomenclature_name: str | None = None
    name_temp: str | None
    expected_quantity: Decimal | None
    expected_date: date | None
    supplier: str | None
    invoice_number: str | None
    grant_id: int | None
    grant_code: str | None = None
    status: str
    created_by_id: int | None
    created_by_name: str | None = None
    created_at: datetime


class PurchaseOrderPage(BaseModel):
    items: list[PurchaseOrderOut]
    total: int
    limit: int
    offset: int


class ReceiveRequest(BaseModel):
    quantities: list[Decimal] = Field(min_length=1)
    batch_number: str | None = None
    expiry_date: date | None = None
    grant_id: int | None = None
    location: str | None = Field(default=None, max_length=50)
    zone: Zone = Zone.storage
    nomenclature_id: int | None = None


class ReceiveResult(BaseModel):
    order_id: int
    status: str
    packages: list[PackageOut]


# ---------- Search / reports ----------
class SearchResultItem(BaseModel):
    id: int
    name: str
    synonyms: list[str] | None
    cas_number: str | None
    unit: str
    category: str
    tracking_mode: str
    storage_temp: str | None
    nomenclature_code: str
    packages_available: int
    total_amount: Decimal


class ConsumptionItem(BaseModel):
    nomenclature_id: int
    name: str
    unit: str
    total_amount: Decimal
    write_off_count: int


class GrantConsumptionReport(BaseModel):
    grant: GrantOut
    date_from: date | None
    date_to: date | None
    items: list[ConsumptionItem]
    total_write_offs: int