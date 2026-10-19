from datetime import datetime, timedelta, timezone

import app.scheduler as scheduler_module
from app.models import Nomenclature, Package, Transaction, User
from app.services.codes import generate_nomenclature_code
from helpers import login
from sqlalchemy import select


async def _make_package(dbs, **pkg_kwargs):
    nom = Nomenclature(name="Sched item", unit="pcs", category="Reagents",
                       nomenclature_code=generate_nomenclature_code(999_001))
    dbs.add(nom)
    await dbs.flush()
    pkg = Package(nomenclature_id=nom.id, zone="storage", placement_status="placed",
                  datamatrix_code=f"DM-{datetime.now(timezone.utc).timestamp()}", **pkg_kwargs)
    dbs.add(pkg)
    await dbs.flush()
    return pkg


async def test_expire_reservations(dbs):
    user = User(google_email="s@lab.test", full_name="S", role="user")
    dbs.add(user)
    await dbs.flush()
    pkg = await _make_package(
        dbs, reserved_by_id=user.id,
        reserved_until=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    await dbs.commit()

    count = await scheduler_module.expire_reservations(dbs)
    await dbs.commit()
    assert count == 1

    refreshed = await dbs.get(Package, pkg.id)
    assert refreshed.reserved_by_id is None and refreshed.reserved_until is None
    tx = (await dbs.execute(
        select(Transaction).where(Transaction.package_id == pkg.id, Transaction.type == "unreserve")
    )).scalars().all()
    assert len(tx) == 1 and "expired" in tx[0].comment


async def test_pending_placement_notifies_creator(dbs, monkeypatch):
    scheduler_module._notified.clear()
    user = User(google_email="p@lab.test", full_name="P", role="user", telegram_id=424242)
    dbs.add(user)
    await dbs.flush()
    await _make_package(
        dbs, placement_status="pending", created_by_id=user.id,
        created_at=datetime.now(timezone.utc) - timedelta(hours=72),
        datamatrix_code="DM-PENDING-1",
    )
    await dbs.commit()

    sent: list[tuple] = []

    async def fake_send(event, ids, payload):
        sent.append((event, ids, payload))
        return True

    monkeypatch.setattr(scheduler_module, "send_event", fake_send)
    await scheduler_module.notify_pending_placement(dbs)

    assert len(sent) == 1
    event, ids, payload = sent[0]
    assert event == "pending_placement"
    assert ids == [424242]
    assert payload["count"] == 1