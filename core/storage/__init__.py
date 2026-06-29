"""JSON document stores for runtime data."""

from core.models.config import SystemConfig
from core.models.layout import Layout
from core.settings import settings
from core.storage.json_store import JsonStore


def config_store() -> JsonStore[SystemConfig]:
    return JsonStore(settings.config_path, SystemConfig, SystemConfig)


def layout_store() -> JsonStore[Layout]:
    return JsonStore(settings.layout_path, Layout, lambda: Layout([]))
