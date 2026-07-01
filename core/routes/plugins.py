from fastapi import APIRouter, HTTPException

from core.models.api import ComponentInfo, PluginHealth, PluginInstallRequest, PluginSummary
from core.plugins.installer import (
    PluginInstallError,
    install_error_to_http,
    install_plugin_from_url,
    remove_installed_plugin,
    update_installed_plugin,
)
from core.plugins.loader import get_plugin_manager
from core.settings import settings

router = APIRouter(tags=["plugins"])


def _manager():
    assert settings.apps_dir
    assert settings.plugins_dir
    return get_plugin_manager(settings.apps_dir, settings.plugins_dir)


def _paths():
    assert settings.apps_dir
    assert settings.plugins_dir
    return settings.apps_dir, settings.plugins_dir


@router.get("/api/components")
async def list_components() -> list[ComponentInfo]:
    return [ComponentInfo.model_validate(row) for row in _manager().components()]


@router.get("/api/plugins")
async def list_plugins() -> list[PluginSummary]:
    return [PluginSummary.model_validate(row) for row in _manager().summaries()]


@router.get("/api/plugins/{plugin_id}/health")
async def plugin_health(plugin_id: str) -> PluginHealth:
    return PluginHealth.model_validate(_manager().health(plugin_id))


@router.post("/api/plugins/install")
async def install_plugin(body: PluginInstallRequest) -> dict:
    bundled_dir, user_dir = _paths()
    try:
        entry = install_plugin_from_url(body.url, bundled_dir=bundled_dir, user_dir=user_dir)
    except PluginInstallError as exc:
        raise install_error_to_http(exc) from exc
    _manager().discover()
    return {
        "id": entry.id,
        "version": entry.version,
        "restart_required": False,
        "message": "Plugin installed. Add widgets from Edit → +.",
    }


@router.post("/api/plugins/{plugin_id}/update")
async def update_plugin(plugin_id: str, body: PluginInstallRequest) -> dict:
    bundled_dir, user_dir = _paths()
    try:
        entry = update_installed_plugin(
            plugin_id,
            body.url,
            bundled_dir=bundled_dir,
            user_dir=user_dir,
        )
    except PluginInstallError as exc:
        raise install_error_to_http(exc) from exc
    _manager().discover()
    return {
        "id": entry.id,
        "version": entry.version,
        "restart_required": False,
        "message": "Plugin updated.",
    }


@router.delete("/api/plugins/{plugin_id}")
async def delete_plugin(plugin_id: str) -> dict:
    bundled_dir, user_dir = _paths()
    try:
        remove_installed_plugin(plugin_id, bundled_dir=bundled_dir, user_dir=user_dir)
    except PluginInstallError as exc:
        raise install_error_to_http(exc) from exc
    _manager().discover()
    return {
        "id": plugin_id,
        "restart_required": False,
        "message": "Plugin removed.",
    }
