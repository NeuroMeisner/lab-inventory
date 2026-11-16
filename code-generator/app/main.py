import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router
from app.config import settings


def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
    app = FastAPI(title="Lab Code Generator & Printing", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router, tags=["code-generator"])
    if not settings.printer_address:
        logging.getLogger(__name__).info(
            "PRINTER_ADDRESS is not set — /print will return 'printer_unavailable' "
            "(use PRINTER_DRY_RUN=true to test the pipeline)"
        )
    return app