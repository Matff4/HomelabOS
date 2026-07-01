"""Remove dashboard widgets when their plugin is uninstalled."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import ValidationError

from core.models.layout import Layout
from core.models.manifest import PluginManifest
from core.storage import layout_store

logger = logging.getLogger(__name__)


def component_ids_for_plugin(plugin_dir: Path) -> set[str]:
    manifest_path = plugin_dir / "manifest.json"
    if not manifest_path.is_file():
        return set()
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest = PluginManifest.model_validate(raw)
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.warning("Cannot read manifest for layout cleanup in %s: %s", plugin_dir, exc)
        return set()
    return {component.id for component in manifest.components}


def remove_layout_items_for_components(component_ids: set[str]) -> int:
    if not component_ids:
        return 0
    store = layout_store()
    layout: Layout = store.read()
    before = len(layout.root)
    layout.root = [item for item in layout.root if item.component_id not in component_ids]
    removed = before - len(layout.root)
    if removed:
        store.write(layout)
        logger.info("Removed %d layout item(s) for uninstalled plugin components", removed)
    return removed
