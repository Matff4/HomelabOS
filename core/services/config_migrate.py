"""One-shot config migrations on boot."""

from __future__ import annotations

import logging

from core.storage import config_store

logger = logging.getLogger(__name__)


def migrate_config() -> None:
    """Drop deprecated taskbar-pinned actions (grid launchers replaced them)."""
    store = config_store()
    config = store.read()
    if not config.taskbarActions:
        return
    logger.info("Clearing deprecated taskbarActions: %s", config.taskbarActions)
    store.write(config.model_copy(update={"taskbarActions": []}))
