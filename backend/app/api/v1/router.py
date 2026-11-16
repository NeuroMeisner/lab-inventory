from fastapi import APIRouter

from . import auth, grants, nomenclature, packages, purchase_orders, reports, search, transactions, users

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(nomenclature.router)
api_router.include_router(packages.router)
api_router.include_router(transactions.router)
api_router.include_router(users.router)
api_router.include_router(grants.router)
api_router.include_router(purchase_orders.router)
api_router.include_router(search.router)
api_router.include_router(reports.router)


@api_router.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}