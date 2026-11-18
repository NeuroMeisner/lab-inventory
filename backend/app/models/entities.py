from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Grant(Base):
    __tablename__ = "grants"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    manager_name: Mapped[str] = mapped_column(String(255), nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=func.true())


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    google_email: Mapped[str | None] = mapped_column(String(255), unique=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    full_name: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    default_grant_id: Mapped[int | None] = mapped_column(ForeignKey("grants.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=func.true())
    accounts_linked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=func.false())
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default='0')
    deactivation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pii_removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Nomenclature(Base):
    __tablename__ = "nomenclature"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    synonyms: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    cas_number: Mapped[str | None] = mapped_column(String(20), unique=True)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    tracking_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="free")
    storage_temp: Mapped[str | None] = mapped_column(String(20))
    min_stock: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    is_hazardous: Mapped[bool] = mapped_column(Boolean, default=False)
    sds_link: Mapped[str | None] = mapped_column(Text)
    manufacturer_code: Mapped[str | None] = mapped_column(String(100))
    nomenclature_code: Mapped[str] = mapped_column(String(14), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Package(Base):
    __tablename__ = "packages"

    id: Mapped[int] = mapped_column(primary_key=True)
    nomenclature_id: Mapped[int] = mapped_column(ForeignKey("nomenclature.id"), nullable=False)
    batch_number: Mapped[str | None] = mapped_column(String(100))
    nominal_amount: Mapped[float | None] = mapped_column(Numeric(10, 3))
    current_amount: Mapped[float | None] = mapped_column(Numeric(10, 3))
    expiry_date: Mapped[date | None] = mapped_column(Date)
    zone: Mapped[str] = mapped_column(String(20), nullable=False, default="storage")
    location: Mapped[str | None] = mapped_column(String(50))
    placement_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    opened_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    grant_id: Mapped[int | None] = mapped_column(ForeignKey("grants.id"))
    datamatrix_code: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    label_printed: Mapped[bool] = mapped_column(Boolean, default=False)
    reserved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reserved_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    nomenclature = relationship("Nomenclature", lazy="selectin")
    grant = relationship("Grant", lazy="selectin")
    opened_by = relationship("User", foreign_keys=[opened_by_id], lazy="selectin")
    reserved_by = relationship("User", foreign_keys=[reserved_by_id], lazy="selectin")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("packages.id"), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    grant_id: Mapped[int | None] = mapped_column(ForeignKey("grants.id"))
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float | None] = mapped_column(Numeric(10, 3))
    from_location: Mapped[str | None] = mapped_column(String(50))
    to_location: Mapped[str | None] = mapped_column(String(50))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    comment: Mapped[str | None] = mapped_column(Text)

    user = relationship("User", lazy="selectin")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    nomenclature_id: Mapped[int | None] = mapped_column(ForeignKey("nomenclature.id"))
    name_temp: Mapped[str | None] = mapped_column(String(255))
    expected_quantity: Mapped[float | None] = mapped_column(Numeric(10, 3))
    expected_date: Mapped[date | None] = mapped_column(Date)
    supplier: Mapped[str | None] = mapped_column(String(255))
    invoice_number: Mapped[str | None] = mapped_column(String(100))
    grant_id: Mapped[int | None] = mapped_column(ForeignKey("grants.id"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ordered")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    nomenclature = relationship("Nomenclature", lazy="selectin")
    grant = relationship("Grant", lazy="selectin")
    created_by = relationship("User", lazy="selectin")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    entity_type: Mapped[str | None] = mapped_column(String(50))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    field_name: Mapped[str | None] = mapped_column(String(50))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    changed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AccountLinkCode(Base):
    __tablename__ = "account_link_codes"

    code: Mapped[str] = mapped_column(String(6), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)