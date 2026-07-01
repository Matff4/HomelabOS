"""Serve plugin static assets (widgets) without per-plugin mounts."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from core.plugins.loader import get_plugin_manager
from core.settings import settings

router = APIRouter(include_in_schema=False)


def _manager():
    assert settings.apps_dir
    assert settings.plugins_dir
    manager = get_plugin_manager(settings.apps_dir, settings.plugins_dir)
    if not manager.plugins:
        manager.discover()
    return manager


def _safe_plugin_file(plugin_root: Path, asset_path: str) -> Path:
    root = plugin_root.resolve()
    target = (plugin_root / asset_path).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return target


@router.get("/apps/{plugin_id}/{asset_path:path}")
async def serve_plugin_asset(plugin_id: str, asset_path: str) -> FileResponse:
    plugin = _manager().plugins.get(plugin_id)
    if plugin is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    target = _safe_plugin_file(plugin.directory, asset_path)
    return FileResponse(target)
