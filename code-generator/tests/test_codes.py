import pytest

from app.services.codes import build_datamatrix_content, format_expiry_display, normalize_expiry


def test_build_content_full():
    content = build_datamatrix_content("20000000012346", "BATCH-2026A", "281001", 991)
    assert content == "(01)20000000012346(10)BATCH-2026A(15)281001(21)000991"


def test_expiry_iso_converted_to_yymmdd():
    assert normalize_expiry("2028-10-01") == "281001"
    assert normalize_expiry("281001") == "281001"
    assert normalize_expiry(None) is None


def test_optional_parts_skipped():
    assert build_datamatrix_content("20000000012346") == "(01)20000000012346"
    assert "(10)" not in build_datamatrix_content("20000000012346", package_id=7)
    assert build_datamatrix_content("20000000012346", package_id=7).endswith("(21)000007")


def test_nomenclature_code_required():
    with pytest.raises(ValueError):
        build_datamatrix_content(None, "B1")


def test_expiry_display():
    assert format_expiry_display("281001") == "01.10.2028"
    assert format_expiry_display("2028-10-01") == "01.10.2028"


def test_invalid_expiry_rejected():
    with pytest.raises(ValueError):
        normalize_expiry("9999999999")