from fastapi import APIRouter, HTTPException

from core.models.api import PluginHealth, PluginInstallRequest, PluginSummary
from core.plugins.loader import get_plugin_manager
from core.settings import settings

router = APIRouter(tags=["plugins"])


def _manager():
    assert settings.apps_dir
    return get_plugin_manager(settings.apps_dir)


@router.get("/api/plugins")
async def list_plugins() -> list[PluginSummary]:
    return [PluginSummary.model_validate(row) for row in _manager().summaries()]


@router.get("/api/plugins/{plugin_id}/health")
async def plugin_health(plugin_id: str) -> PluginHealth:
    return PluginHealth.model_validate(_manager().health(plugin_id))


@router.post("/api/plugins/install", status_code=501)
async def install_plugin(_body: PluginInstallRequest) -> None:
    raise HTTPException(status_code=501, detail="Plugin install ships in Phase 5")


@router.post("/api/plugins/{plugin_id}/update", status_code=501)
async def update_plugin(plugin_id: str) -> None:
    raise HTTPException(status_code=501, detail=f"Plugin update for {plugin_id} ships in Phase 5")


@router.delete("/api/plugins/{plugin_id}", status_code=501)
async def delete_plugin(plugin_id: str) -> None:
    raise HTTPException(status_code=501, detail=f"Plugin removal for {plugin_id} ships in Phase 5")
