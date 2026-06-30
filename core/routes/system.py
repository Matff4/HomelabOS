import logging
import shutil
import subprocess

from fastapi import APIRouter, HTTPException

from core.models.api import DisplayInfo, PowerRequest, SystemStats
from core.services.system import collect_system_stats, detect_display
from core.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["system"])

_POWER_COMMANDS: dict[str, list[str]] = {
    "restart-kiosk": ["systemctl", "restart", "homelabos-kiosk"],
    "reboot": ["systemctl", "reboot"],
    "shutdown": ["systemctl", "poweroff"],
}


def _run_power_command(action: str) -> None:
    base = _POWER_COMMANDS.get(action)
    if not base:
        raise HTTPException(status_code=400, detail="Unknown action")

    if shutil.which("sudo"):
        cmd = ["sudo", "-n", *base]
    else:
        cmd = base

    logger.info("Power action: %s (%s)", action, " ".join(cmd))
    subprocess.Popen(cmd, start_new_session=True)


@router.get("/api/system/stats")
async def system_stats() -> SystemStats:
    return collect_system_stats()


@router.get("/api/system/display")
async def system_display() -> DisplayInfo:
    return detect_display(mock_hal=settings.mock_hal)


@router.post("/api/system/power")
async def system_power(body: PowerRequest) -> dict[str, str]:
    try:
        _run_power_command(body.action)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="systemctl not available") from exc
    return {"status": "accepted", "action": body.action}
