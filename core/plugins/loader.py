"""Plugin discovery and backend mounting."""

from __future__ import annotations

import importlib.util
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from core.models.manifest import PluginManifest

logger = logging.getLogger(__name__)


@dataclass
class LoadedPlugin:
    manifest: PluginManifest
    directory: Path
    backend_loaded: bool = False


class PluginManager:
    def __init__(self, bundled_dir: Path, user_dir: Path) -> None:
        self.bundled_dir = bundled_dir
        self.user_dir = user_dir
        self.plugins: dict[str, LoadedPlugin] = {}
        self._mounted_static: set[str] = set()

    def discover(self) -> list[LoadedPlugin]:
        self.plugins.clear()
        for root in (self.bundled_dir, self.user_dir):
            if not root.is_dir():
                continue
            for entry in sorted(root.iterdir()):
                if not entry.is_dir():
                    continue
                manifest_path = entry / "manifest.json"
                if not manifest_path.is_file():
                    continue
                try:
                    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
                    manifest = PluginManifest.model_validate(raw)
                except (json.JSONDecodeError, ValidationError) as exc:
                    logger.warning("Skipping plugin %s: invalid manifest (%s)", entry.name, exc)
                    continue
                if manifest.id != entry.name:
                    logger.warning(
                        "Plugin folder %s id mismatch (manifest.id=%s)", entry.name, manifest.id
                    )
                plugin = LoadedPlugin(manifest=manifest, directory=entry, backend_loaded=False)
                self.plugins[manifest.id] = plugin
        return list(self.plugins.values())

    def mount(self, app: FastAPI) -> None:
        for plugin in self.plugins.values():
            static_mount = f"/apps/{plugin.manifest.id}"
            if plugin.manifest.id not in self._mounted_static:
                app.mount(
                    static_mount,
                    StaticFiles(directory=plugin.directory),
                    name=f"plugin_static_{plugin.manifest.id}",
                )
                self._mounted_static.add(plugin.manifest.id)

            backend_path = plugin.directory / (plugin.manifest.backend or "main.py")
            if not plugin.manifest.backend and not backend_path.is_file():
                continue
            if not backend_path.is_file():
                logger.warning("[%s] backend file missing: %s", plugin.manifest.id, backend_path)
                continue

            module_name = f"homelabos.plugins.{plugin.manifest.id}"
            spec = importlib.util.spec_from_file_location(module_name, backend_path)
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            try:
                spec.loader.exec_module(module)
            except Exception as exc:
                logger.exception("[%s] backend load failed: %s", plugin.manifest.id, exc)
                continue

            router = getattr(module, "router", None)
            if router is None:
                continue
            prefix = f"/api/plugins/{plugin.manifest.id}"
            app.include_router(router, prefix=prefix)
            plugin.backend_loaded = True
            logger.info("[%s] backend mounted at %s", plugin.manifest.id, prefix)

    def summaries(self) -> list[dict]:
        return [
            {
                "id": plugin.manifest.id,
                "name": plugin.manifest.name,
                "version": plugin.manifest.version,
                "enabled": True,
                "bundled": self._is_bundled(plugin),
            }
            for plugin in self.plugins.values()
        ]

    def _is_bundled(self, plugin: LoadedPlugin) -> bool:
        try:
            return plugin.directory.resolve().is_relative_to(self.bundled_dir.resolve())
        except (ValueError, OSError):
            return plugin.directory.parent.resolve() == self.bundled_dir.resolve()

    def components(self) -> list[dict]:
        rows: list[dict] = []
        for plugin in self.plugins.values():
            for component in plugin.manifest.components:
                if component.type not in ("widget", "app"):
                    continue
                rows.append(
                    {
                        "id": component.id,
                        "plugin_id": plugin.manifest.id,
                        "type": component.type,
                        "name": component.name,
                        "icon": component.icon,
                        "entry_url": f"/apps/{plugin.manifest.id}/{component.entry}",
                        "size": component.size.model_dump() if component.size else None,
                        "min_size": component.min_size.model_dump() if component.min_size else None,
                    }
                )
        return rows

    def health(self, plugin_id: str) -> dict:
        plugin = self.plugins.get(plugin_id)
        if plugin is None:
            raise HTTPException(status_code=404, detail="Plugin not found")
        if plugin.manifest.backend and not plugin.backend_loaded:
            return {"id": plugin_id, "status": "degraded", "message": "Backend failed to load"}
        return {"id": plugin_id, "status": "ok", "message": None}


_manager: PluginManager | None = None


def get_plugin_manager(bundled_dir: Path, user_dir: Path) -> PluginManager:
    global _manager
    if _manager is None:
        _manager = PluginManager(bundled_dir, user_dir)
    return _manager


def reset_plugin_manager() -> None:
    global _manager
    _manager = None
