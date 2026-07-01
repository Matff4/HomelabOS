from core import __version__
from core.constants import PLUGIN_API_VERSION, SDK_VERSION
from core.models.api import PlatformInfo
from fastapi import APIRouter

router = APIRouter(tags=["platform"])


@router.get("/api/platform")
async def platform_info() -> PlatformInfo:
    return PlatformInfo(
        core_version=__version__,
        plugin_api_version=PLUGIN_API_VERSION,
        sdk_version=SDK_VERSION,
        supported_manifest_api_versions=[PLUGIN_API_VERSION],
    )
