"""Soft factory reset — clear dashboard state, keep plugins and UI preferences."""

from __future__ import annotations

from core.models.layout import Layout
from core.storage import config_store, layout_store


def soft_reset() -> dict:
    """Clear layout and dashboard chrome; preserve theme, store URL, and installed plugins."""
    layout_store().write(Layout([]))

    config = config_store().read()
    next_config = config.model_copy(update={"paneCount": 1, "taskbarActions": []})
    config_store().write(next_config)

    return {
        "message": "Dashboard cleared. Restarting kiosk to flush browser cache.",
        "pane_count": next_config.paneCount,
    }
