"""CU-OS API.

Run exactly one instance. Scheduled WhatsApp reminders are an in-process loop,
so a second worker double-sends:

    uvicorn app.main:app --workers 1 --port 8010
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import (
    routes_academy,
    routes_assets,
    routes_auth,
    routes_dev,
    routes_launch,
    routes_people,
    routes_public,
    routes_whatsapp,
)
from app.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="CU-OS",
        version=__version__,
        description=(
            "Community Unlimited's capacity engine. Coffee is the first use "
            "case; the product is the engine."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(routes_auth.router)
    app.include_router(routes_public.router)
    app.include_router(routes_people.router)
    app.include_router(routes_academy.router)
    app.include_router(routes_assets.router)
    app.include_router(routes_launch.router)
    app.include_router(routes_whatsapp.router)

    # Only mounted while the fake provider is active.
    if settings.whatsapp_provider == "fake":
        app.include_router(routes_dev.router)

    @app.get("/api/health", tags=["health"])
    def health() -> dict[str, object]:
        return {
            "status": "ok",
            "version": __version__,
            "whatsapp_provider": settings.whatsapp_provider,
        }

    return app


app = create_app()
