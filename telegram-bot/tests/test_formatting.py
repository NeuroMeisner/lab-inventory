from app.formatting import format_event, format_package_card, format_search_results


def test_search_results_format():
    text = format_search_results([{"name": "Acetone", "packages_available": 2,
                                   "total_amount": 1400, "unit": "mL"}])
    assert "Found 1 item(s)" in text
    assert "Acetone — 2 pkg(s), total 1400 mL" in text


def test_package_card_contains_all_fields():
    card = format_package_card({
        "display_code": "PKG-00457", "nomenclature_name": "Acetone",
        "location": "L044-C01-03", "zone": "in_use", "opened_at": "2026-09-01",
        "current_amount": 400, "unit": "mL", "batch_number": "A2305",
        "expiry_date": "2028-10-01", "grant_code": "RNF-23-14", "grant_manager": "Ivanov I.I.",
    })
    assert "📦 PKG-00457" in card
    assert "Location: L044-C01-03" in card
    assert "Zone: In use" in card
    assert "Remaining: 400 mL" in card
    assert "Batch: A2305, expires 01.10.2028" in card
    assert "Purchase grant: RNF-23-14 (Ivanov I.I.)" in card


def test_sealed_package_marked():
    card = format_package_card({"display_code": "PKG-00458", "zone": "storage", "opened_at": None})
    assert "(sealed)" in card


def test_low_stock_event():
    text = format_event("low_stock", {"name": "Acetone", "unit": "mL", "total_stock": 100,
                                      "min_stock": 500, "auto_order_created": True})
    assert text.startswith("🔴 Low stock: Acetone")
    assert "purchase order was created automatically" in text


def test_all_events_produce_text():
    payloads = {
        "expiry_warning_30d": {"packages": [{"package_code": "PKG-00001", "name": "X", "batch_number": "B",
                                             "expiry_date": "2026-11-07", "location": "S-R01-02"}]},
        "package_expired": {"packages": [{"package_code": "PKG-00001", "name": "X", "batch_number": None,
                                          "expiry_date": "2026-10-08"}]},
        "pending_placement": {"count": 3, "items": [{"package_code": "PKG-00001", "name": "X", "batch_number": None}]},
        "reserve_expiring": {"package_code": "PKG-00001", "name": "X", "expires_at": "2026-10-08T14:30:00+00:00"},
        "purchase_order_due": {"orders": [{"id": 5, "name": "Gloves", "expected_date": "2026-10-01", "supplier": "LLC"}]},
    }
    for event, payload in payloads.items():
        text = format_event(event, payload)
        assert text, f"no text for {event}"


def test_unknown_event_returns_none():
    assert format_event("something_new", {}) is None