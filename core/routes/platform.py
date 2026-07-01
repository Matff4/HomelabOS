"""Platform metadata including built shell version."""

from __future__ import annotations

import json
import logging

from core import __version__
from core.constants import PLUGIN_API_VERSION, SDK_VERSION
from core.models.api import PlatformInfo
from core.settings import settings
from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["platform"])

SHELL_VERSION_FILE = "shell-version.json"


def read_shell_layout_version() -> str | None:
    dist = settings.shell_dist_dir
    if not dist:
        return None
    path = dist / SHELL_VERSION_FILE
    if not path.is_file():
        logger.warning(
            "Shell dist missing %s — rebuild: cd shell && npm run build",
            SHELL_VERSION_FILE,
        )
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    layout = payload.get("layout")
    return layout if isinstance(layout, str) else None


@router.get("/api/platform")
async def platform_info() -> PlatformInfo:
    return PlatformInfo(
        core_version=__version__,
        plugin_api_version=PLUGIN_API_VERSION,
        sdk_version=SDK_VERSION,
        supported_manifest_api_versions=[PLUGIN_API_VERSION],
        shell_layout_version=read_shell_layout_version(),
    )
