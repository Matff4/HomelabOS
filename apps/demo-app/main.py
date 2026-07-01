from fastapi import APIRouter

from core import __version__

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, bool]:
    return {"pong": True}


@router.get("/info")
async def info() -> dict[str, str]:
    return {
        "plugin": "demo-app",
        "core_version": __version__,
        "message": "Fullscreen app example — fetch this from HomelabOS.fetch()",
    }
