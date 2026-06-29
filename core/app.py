import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from core import __version__
from core.settings import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    logger.info("HomelabOS v%s starting (dev=%s mock_hal=%s)", __version__, settings.dev, settings.mock_hal)
    yield
    logger.info("HomelabOS shutting down")


def create_app() -> FastAPI:
    app = FastAPI(title="HomelabOS", version=__version__, lifespan=lifespan)

    @app.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "version": __version__,
            "dev": settings.dev,
            "mock_hal": settings.mock_hal,
            "time": datetime.now(UTC).isoformat(),
        }

    # Static shell (built by Vite) or placeholder
    dist = settings.shell_dist_dir
    if dist.is_dir() and (dist / "index.html").is_file():
        app.mount("/static", StaticFiles(directory=dist), name="static")

        @app.get("/")
        async def index():
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
