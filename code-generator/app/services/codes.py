from datetime import date


def normalize_expiry(expiry: str | None) -> str | None:
    """Принимает '281001' (ГГММДД) или '2028-10-01', возвращает 'ГГММДД'."""
    if not expiry:
        return None
    expiry = expiry.strip()
    if len(expiry) == 6 and expiry.isdigit():
        return expiry
    try:
        return date.fromisoformat(expiry).strftime("%y%m%d")
    except ValueError as exc:
        raise ValueError(f"Invalid expiry_date: {expiry!r} (expected YYMMDD or YYYY-MM-DD)") from exc


def build_datamatrix_content(
    nomenclature_code: str | None = None,
    batch_number: str | None = None,
    expiry_date: str | None = None,
    package_id: int | None = None,
) -> str:
    """GS1-подобный формат из ТЗ 4.2.1: (01)<код>(10)<партия>(15)<ГГММДД>(21)<ид>.
    Идентичен реализации бэкенда — содержимое детерминировано."""
    if not nomenclature_code:
        raise ValueError("nomenclature_code is required")
    parts = [f"(01){nomenclature_code}"]
    if batch_number:
        parts.append(f"(10){batch_number}")
    exp = normalize_expiry(expiry_date)
    if exp:
        parts.append(f"(15){exp}")
    if package_id is not None:
        parts.append(f"(21){package_id:06d}")
    return "".join(parts)


def format_expiry_display(expiry: str | None) -> str | None:
    """Для текста этикетки: '281001' -> '01.10.2028'."""
    exp = normalize_expiry(expiry)
    if not exp:
        return None
    return f"{exp[4:6]}.{exp[2:4]}.20{exp[0:2]}"