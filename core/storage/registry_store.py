from core.models.registry import PluginRegistry
from core.settings import settings
from core.storage.json_store import JsonStore


def registry_store() -> JsonStore[PluginRegistry]:
    assert settings.registry_path
    return JsonStore(settings.registry_path, PluginRegistry, PluginRegistry)
