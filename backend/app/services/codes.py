from datetime import date


def gtin_check_digit(body: str) -> str:
    """Стандартная контрольная цифра GS1 MOD-10."""
    total = 0
    for i, ch in enumerate(reversed(body)):
        total += int(ch) * (3 if i % 2 == 0 else 1)
    return str((10 - total % 10) % 10)


def generate_nomenclature_code(sequence_value: int) -> str:
    body = f"200{sequence_value % 10**10:010d}"
    return body + gtin_check_digit(body)


def is_valid_nomenclature_code(code: str) -> bool:
    return (
        isinstance(code, str)
        and len(code) == 14
        and code.startswith("200")
        and code.isdigit()
        and gtin_check_digit(code[:13]) == code[13]
    )


def build_datamatrix_content(
    nomenclature_code: str,
    batch_number: str | None = None,
    expiry_date: date | None = None,
    package_id: int | None = None,
) -> str:
    """GS1-подобный формат: (01)<код>(10)<партия>(15)<ГГММДД>(21)<ид упаковки>."""
    parts = [f"(01){nomenclature_code}"]
    if batch_number:
        parts.append(f"(10){batch_number}")
    if expiry_date:
        parts.append(f"(15){expiry_date.strftime('%y%m%d')}")
    if package_id is not None:
        parts.append(f"(21){package_id:06d}")
    return "".join(parts)