from datetime import datetime


def fmt_date(iso_date: str | None) -> str | None:
    """'2028-10-01' -> '01.10.2028'"""
    if not iso_date:
        return None
    try:
        return datetime.fromisoformat(iso_date).strftime("%d.%m.%Y")
    except ValueError:
        return iso_date


def fmt_datetime(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d.%m.%Y %H:%M")
    except ValueError:
        return iso


def format_search_results(items: list[dict]) -> str:
    lines = [f"Found {len(items)} item(s):"]
    for i, it in enumerate(items[:10], 1):
        qty = it.get("packages_available", 0)
        total = it.get("total_amount") or 0
        unit = it.get("unit", "")
        extra = f", total {total:g} {unit}" if total else ""
        lines.append(f"{i}. {it['name']} — {qty} pkg(s){extra}")
    return "\n".join(lines)


def format_package_card(p: dict) -> str:
    """Карточка упаковки по ТЗ 3.3 (шаг 4)."""
    lines = [f"📦 {p.get('display_code', '')} — {p.get('nomenclature_name', '')}"]
    lines.append(f"• Location: {p.get('location') or 'not placed'}")
    zone = "Storage" if p.get("zone") == "storage" else "In use"
    if not p.get("opened_at"):
        zone += " (sealed)"
    lines.append(f"• Zone: {zone}")
    if p.get("current_amount") is not None:
        lines.append(f"• Remaining: {p['current_amount']:g} {p.get('unit', '')}")
    batch = p.get("batch_number")
    expiry = fmt_date(p.get("expiry_date"))
    if batch or expiry:
        lines.append(f"• Batch: {batch or '—'}, expires {expiry or '—'}")
    if p.get("grant_code"):
        lines.append(f"• Purchase grant: {p['grant_code']} ({p.get('grant_manager') or ''})")
    return "\n".join(lines)


def format_event(event: str | None, payload: dict) -> str | None:
    """Уведомления от бэкенда (контракт Модуля 1, ТЗ 3.4)."""
    if event == "low_stock":
        text = (
            f"🔴 Low stock: {payload.get('name')} — remaining {payload.get('total_stock'):g} "
            f"{payload.get('unit', '')}, minimum {payload.get('min_stock'):g}. Time to order."
        )
        if payload.get("auto_order_created"):
            text += "\nA purchase order was created automatically."
        return text

    if event == "expiry_warning_30d":
        lines = ["⚠️ The following batches expire in 30 days:"]
        for p in payload.get("packages", []):
            lines.append(f"• {p.get('package_code')} {p.get('name')} (batch {p.get('batch_number') or '—'}, "
                         f"exp {fmt_date(p.get('expiry_date'))}, {p.get('location') or 'not placed'})")
        return "\n".join(lines)

    if event == "package_expired":
        lines = ["❗ The following batches have EXPIRED:"]
        for p in payload.get("packages", []):
            lines.append(f"• {p.get('package_code')} {p.get('name')} (batch {p.get('batch_number') or '—'}, "
                         f"expired {fmt_date(p.get('expiry_date'))})")
        return "\n".join(lines)

    if event == "pending_placement":
        lines = [f"📦 You have {payload.get('count', 0)} item(s) waiting for placement for over 2 days:"]
        for p in payload.get("items", []):
            lines.append(f"• {p.get('package_code')} {p.get('name')} (batch {p.get('batch_number') or '—'})")
        lines.append("Please place them using the PWA (📍 Place / Move).")
        return "\n".join(lines)

    if event == "reserve_expiring":
        return (
            f"⏰ Your reservation of {payload.get('name')} ({payload.get('package_code')}) "
            f"expires at {fmt_datetime(payload.get('expires_at'))}."
        )

    if event == "purchase_order_due":
        lines = ["📦 Overdue expected deliveries:"]
        for o in payload.get("orders", []):
            lines.append(f"• #{o.get('id')} {o.get('name')} (expected {fmt_date(o.get('expected_date'))}"
                         f"{', ' + o.get('supplier') if o.get('supplier') else ''})")
        return "\n".join(lines)

    return None