"""Заполнение БД демо-данными (только если таблицы пусты)."""
import argparse
import asyncio
from datetime import date

from sqlalchemy import func, select, text

from app.config import settings
from app.database import SessionLocal
from app.models import Grant, Nomenclature, Package, Transaction, User
from app.services.codes import build_datamatrix_content, generate_nomenclature_code

ITEMS = [
    dict(name="Nitrile gloves, size M", synonyms=["gloves"], unit="pcs", category="Consumables",
         tracking_mode="per_unit", min_stock=20),
    dict(name="Acetone, analytical grade", synonyms=["Acetone absolute", "2-propanone"],
         cas_number="67-64-1", unit="mL", category="Solvents", tracking_mode="by_measure",
         min_stock=500, is_hazardous=True),
    dict(name="Sodium chloride", synonyms=["NaCl", "table salt"], cas_number="7647-14-5",
         unit="g", category="Reagents", tracking_mode="free"),
    dict(name="Ethanol 96%", synonyms=["EtOH"], cas_number="64-17-5", unit="mL",
         category="Solvents", tracking_mode="by_measure", min_stock=1000, is_hazardous=True),
    dict(name="Petri dishes 90 mm", synonyms=[], unit="pcs", category="Consumables",
         tracking_mode="per_unit", min_stock=50),
]


async def seed() -> None:
    async with SessionLocal() as db:
        if await db.scalar(select(func.count()).select_from(Nomenclature)) > 0:
            print("Database is not empty — skipping seed.")
            return

        grants = [
            Grant(code="RNF-23-14", manager_name="Ivanov I.I.", expiry_date=date(2027, 12, 31)),
            Grant(code="MO-2024", manager_name="Petrova A.A.", expiry_date=date(2026, 12, 31)),
        ]
        db.add_all(grants)
        await db.flush()

        admin = User(google_email=settings.seed_admin_email, full_name="Lab Admin", role="admin",
                     default_grant_id=grants[0].id)
        demo = User(google_email="user@lab.test", full_name="Demo User", role="user",
                    default_grant_id=grants[1].id)
        db.add_all([admin, demo])
        await db.flush()

        noms: list[Nomenclature] = []
        for item in ITEMS:
            seq = await db.scalar(text("SELECT nextval('nomenclature_code_seq')"))
            noms.append(Nomenclature(**item, nomenclature_code=generate_nomenclature_code(int(seq))))
        db.add_all(noms)
        await db.flush()

        # (номенклатура, партия, номинал, остаток, срок, место, зона, грант, вскрыта?)
        specs = [
            (noms[1], "A2305", 1000, 400, date(2028, 10, 1), "L044-C01-03", "in_use", grants[0], True),
            (noms[1], "A2412", 1000, 1000, date(2029, 3, 1), "S-R01-02", "storage", grants[1], False),
            (noms[0], "G2026-1", 100, 100, date(2028, 1, 1), "S-R01-05", "storage", grants[0], False),
            (noms[3], "E2401", 5000, 5000, date(2027, 6, 1), None, "storage", grants[1], False),
        ]
        from datetime import datetime, timezone
        for nom, batch, nominal, current, exp, loc, zone, grant, opened in specs:
            pkg = Package(
                nomenclature_id=nom.id, batch_number=batch, nominal_amount=nominal, current_amount=current,
                expiry_date=exp, zone=zone, location=loc,
                placement_status="placed" if loc else "pending",
                grant_id=grant.id, datamatrix_code="__pending__", created_by_id=admin.id,
                opened_at=datetime.now(timezone.utc) if opened else None,
                opened_by_id=admin.id if opened else None,
            )
            db.add(pkg)
            await db.flush()
            pkg.datamatrix_code = build_datamatrix_content(nom.nomenclature_code, batch, exp, pkg.id)
            db.add(Transaction(
                package_id=pkg.id, user_id=admin.id, grant_id=grant.id, type="receive",
                amount=current, to_location=loc, comment="Seed data",
            ))

        await db.commit()
        print("Seed completed: 2 grants, 2 users, 5 nomenclature items, 4 packages.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--if-empty", action="store_true", help="совместимость с docker-compose (поведение и так 'если пусто')")
    parser.parse_args()
    asyncio.run(seed())