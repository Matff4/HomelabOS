"""HomelabOS FastAPI application."""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from core import __version__
from core.events.bus import get_bus, reset_bus
from core.hal import get_hal, reset_hal
from core.models.api import HealthResponse
from core.plugins.loader import get_plugin_manager, reset_plugin_manager
from core.routes import api_router
from core.services.tasks import run_publishers
from core.settings import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    get_hal(mock=settings.mock_hal)
    bus = get_bus()
    bus._running = True
    logger.info(
        "HomelabOS v%s starting (dev=%s mock_hal=%s)",
        __version__,
        settings.dev,
        settings.mock_hal,
    )
    publisher = asyncio.create_task(run_publishers(bus), name="homelabos-publishers")
    try:
        yield
    finally:
        publisher.cancel()
        await asyncio.gather(publisher, return_exceptions=True)
        bus.stop()
        get_hal(mock=settings.mock_hal).cleanup_all()
        logger.info("HomelabOS shutting down")


def create_app() -> FastAPI:
    app = FastAPI(title="HomelabOS", version=__version__, lifespan=lifespan)

    @app.get("/api/health")
    async def health():
        return HealthResponse(
            version=__version__,
            dev=settings.dev,
            mock_hal=settings.mock_hal,
            time=datetime.now(UTC),
        ).model_dump(mode="json")

    app.include_router(api_router)

    assert settings.apps_dir
    plugin_manager = get_plugin_manager(settings.apps_dir)
    plugin_manager.discover()
    plugin_manager.mount(app)

    dist = settings.shell_dist_dir
    if dist and dist.is_dir() and (dist / "index.html").is_file():
        app.mount("/static", StaticFiles(directory=dist), name="static")

        @app.get("/")
        async def index():
            return FileResponse(dist / "index.html")

        @app.get("/favicon.ico", include_in_schema=False)
        async def favicon():
            icon = dist / "favicon.ico"
            if icon.is_file():
                return FileResponse(icon)
            return FileResponse(dist / "index.html")
    else:

        @app.get("/")
        async def placeholder():
            return JSONResponse(
                {
                    "message": "HomelabOS core is running. Build the shell: cd shell && npm install && npm run build",
                    "health": "/api/health",
                }
            )

    return app


def reset_runtime() -> None:
    """Reset process-global singletons (tests)."""
    reset_bus()
    reset_hal()
    reset_plugin_manager()
