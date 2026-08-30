"""CU-OS API.

Run exactly one instance. Scheduled WhatsApp reminders are an in-process loop,
so a second worker double-sends:

    uvicorn app.main:app --workers 1 --port 8010
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

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

    _mount_spa(app, settings.static_dir)
    return app


def _mount_spa(app: FastAPI, static_dir: str) -> None:
    """Serve the compiled SPA from this origin, when one was built in.

    Registered last on purpose. Starlette matches routes in registration order,
    so every /api route above already wins; this only sees what they didn't
    claim.
    """
    if not static_dir:
        return
    root = Path(static_dir).resolve()
    index = root / "index.html"
    if not index.is_file():
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        # Never let an unmatched /api path fall through to index.html. Serving
        # HTML with a 200 for a missing endpoint turns a clean 404 into a JSON
        # parse error in the client, which is far harder to diagnose.
        if full_path.startswith("api/") or full_path in {"docs", "redoc", "openapi.json"}:
            raise HTTPException(status_code=404, detail="not found")

        if full_path:
            candidate = (root / full_path).resolve()
            # Containment check, not a prefix check on the raw path: `..`
            # segments resolve away first, so this is what actually stops a
            # traversal like /../../etc/passwd from escaping the static root.
            if candidate.is_file() and candidate.is_relative_to(root):
                return FileResponse(candidate)

        # Anything else is a client-side route (/people, /events, …).
        return FileResponse(index)


app = create_app()
