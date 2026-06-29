import logging
import subprocess

from fastapi import APIRouter, HTTPException

from core.models.api import DisplayInfo, PowerRequest, SystemStats
from core.services.system import collect_system_stats, detect_display
from core.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["system"])


@router.get("/api/system/stats")
async def system_stats() -> SystemStats:
    return collect_system_stats()


@router.get("/api/system/display")
async def system_display() -> DisplayInfo:
    return detect_display(mock_hal=settings.mock_hal)


@router.post("/api/system/power")
async def system_power(body: PowerRequest) -> dict[str, str]:
    action = body.action
    if action == "restart-kiosk":
        cmd = ["systemctl", "restart", "homelabos-kiosk"]
    elif action == "reboot":
        cmd = ["systemctl", "reboot"]
    elif action == "shutdown":
        cmd = ["systemctl", "poweroff"]
    else:
        raise HTTPException(status_code=400, detail="Unknown action")

    try:
        subprocess.Popen(cmd, start_new_session=True)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="systemctl not available") from exc

    logger.info("Power action requested: %s", action)
    return {"status": "accepted", "action": action}
