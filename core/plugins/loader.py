"""Plugin discovery and dynamic backend loading."""

from __future__ import annotations

import importlib.util
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from core.constants import HIDDEN_BUNDLED_PLUGINS
from core.models.manifest import PluginManifest
from core.plugins.compatibility import assess_plugin_compatibility

logger = logging.getLogger(__name__)


@dataclass
class LoadedPlugin:
    manifest: PluginManifest
    directory: Path
    backend_loaded: bool = False
    enabled: bool = True
    incompatible_reason: str | None = None


class PluginManager:
    def __init__(self, bundled_dir: Path, user_dir: Path) -> None:
        self.bundled_dir = bundled_dir
        self.user_dir = user_dir
        self.plugins: dict[str, LoadedPlugin] = {}
        self._routers: dict[str, APIRouter] = {}
        self._router_mtimes: dict[str, float] = {}

    def discover(self) -> list[LoadedPlugin]:
        found: dict[str, LoadedPlugin] = {}
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
                enabled, reason = assess_plugin_compatibility(manifest)
                found[manifest.id] = LoadedPlugin(
                    manifest=manifest,
                    directory=entry,
                    backend_loaded=manifest.id in self._routers,
                    enabled=enabled,
                    incompatible_reason=reason,
                )

        removed = set(self._routers) - set(found)
        for plugin_id in removed:
            self._routers.pop(plugin_id, None)
            self._router_mtimes.pop(plugin_id, None)
            sys.modules.pop(f"homelabos.plugins.{plugin_id}", None)

        self.plugins = found
        return list(self.plugins.values())

    def warm_backend_cache(self) -> None:
        """Pre-load plugin backends at startup (optional; also loads lazily on first request)."""
        for plugin_id in self.plugins:
            self.get_backend_router(plugin_id)

    def get_backend_router(self, plugin_id: str) -> APIRouter | None:
        plugin = self.plugins.get(plugin_id)
        if plugin is None or not plugin.enabled:
            return None

        backend_path = plugin.directory / (plugin.manifest.backend or "main.py")
        if not plugin.manifest.backend and not backend_path.is_file():
            return None
        if not backend_path.is_file():
            return None

        mtime = backend_path.stat().st_mtime
        cached = self._routers.get(plugin_id)
        if cached is not None and self._router_mtimes.get(plugin_id) == mtime:
            plugin.backend_loaded = True
            return cached

        module_name = f"homelabos.plugins.{plugin_id}"
        sys.modules.pop(module_name, None)

        spec = importlib.util.spec_from_file_location(module_name, backend_path)
        if spec is None or spec.loader is None:
            return None

        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        try:
            spec.loader.exec_module(module)
        except Exception as exc:
            logger.exception("[%s] backend load failed: %s", plugin_id, exc)
            plugin.backend_loaded = False
            return None

        router = getattr(module, "router", None)
        if router is None:
            plugin.backend_loaded = False
            return None

        self._routers[plugin_id] = router
        self._router_mtimes[plugin_id] = mtime
        plugin.backend_loaded = True
        logger.info("[%s] backend loaded for hot dispatch", plugin_id)
        return router

    def summaries(self) -> list[dict]:
        rows: list[dict] = []
        for plugin in self.plugins.values():
            if self._is_hidden(plugin):
                continue
            message = plugin.incompatible_reason
            if plugin.enabled and plugin.manifest.backend and not plugin.backend_loaded:
                backend_path = plugin.directory / (plugin.manifest.backend or "main.py")
                if backend_path.is_file():
                    message = "Backend failed to load"
            rows.append(
                {
                    "id": plugin.manifest.id,
                    "name": plugin.manifest.name,
                    "version": plugin.manifest.version,
                    "enabled": plugin.enabled,
                    "bundled": self._is_bundled(plugin),
                    "message": message if not plugin.enabled or message else None,
                }
            )
        return rows

    def _is_bundled(self, plugin: LoadedPlugin) -> bool:
        try:
            return plugin.directory.resolve().is_relative_to(self.bundled_dir.resolve())
        except (ValueError, OSError):
            return plugin.directory.parent.resolve() == self.bundled_dir.resolve()

    def _is_hidden(self, plugin: LoadedPlugin) -> bool:
        return self._is_bundled(plugin) and plugin.manifest.id in HIDDEN_BUNDLED_PLUGINS

    def components(self) -> list[dict]:
        rows: list[dict] = []
        for plugin in self.plugins.values():
            if self._is_hidden(plugin) or not plugin.enabled:
                continue
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
                        "settings": [s.model_dump() for s in component.settings] if component.settings else None,
                    }
                )
        return rows

    def health(self, plugin_id: str) -> dict:
        plugin = self.plugins.get(plugin_id)
        if plugin is None:
            raise HTTPException(status_code=404, detail="Plugin not found")
        if not plugin.enabled:
            return {
                "id": plugin_id,
                "status": "error",
                "message": plugin.incompatible_reason or "Plugin incompatible with this core version",
            }
        if plugin.manifest.backend and not plugin.backend_loaded:
            return {"id": plugin_id, "status": "degraded", "message": "Backend failed to load"}
        backend_path = plugin.directory / (plugin.manifest.backend or "main.py")
        if backend_path.is_file() and not plugin.backend_loaded:
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
    if _manager is not None:
        for plugin_id in list(_manager._routers):
            sys.modules.pop(f"homelabos.plugins.{plugin_id}", None)
    _manager = None
