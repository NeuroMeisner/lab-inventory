from enum import Enum


class Role(str, Enum):
    admin = "admin"
    user = "user"


class TrackingMode(str, Enum):
    free = "free"
    per_unit = "per_unit"
    by_measure = "by_measure"


class Zone(str, Enum):
    storage = "storage"
    in_use = "in_use"


class PlacementStatus(str, Enum):
    pending = "pending"
    placed = "placed"


class TransactionType(str, Enum):
    receive = "receive"
    open = "open"
    move = "move"
    write_off = "write_off"
    reserve = "reserve"
    unreserve = "unreserve"
    correction = "correction"


class PurchaseOrderStatus(str, Enum):
    ordered = "ordered"
    received = "received"
    cancelled = "cancelled"