"""Frozen platform constants — Phase 0 contract."""

CORE_VERSION = "1.0.0"
PLUGIN_API_VERSION = 1
SDK_VERSION = "1.0.0"

# Bundled reference plugins — assets may still load for legacy layouts; hidden from store/drawer.
HIDDEN_BUNDLED_PLUGINS = frozenset({"demo"})

DEFAULT_MARKETPLACE_URL = (
    "https://raw.githubusercontent.com/Matff4/HomelabOS-Plugins/master/index.json"
)


class SSEChannel:
    """Server-sent event channel names (frozen)."""

    HEARTBEAT = "system.heartbeat"
    STATS = "system.stats"
    DISPLAY = "system.display"

    @staticmethod
    def plugin(plugin_id: str, event: str) -> str:
        return f"plugin.{plugin_id}.{event}"


class PostMessageType:
    """Shell ↔ widget iframe postMessage types (frozen)."""

    PLUGIN_READY = "PLUGIN_READY"
    OS_THEME_UPDATE = "OS_THEME_UPDATE"
    WIDGET_CONFIG = "WIDGET_CONFIG"
    WIDGET_CONFIG_UPDATE = "WIDGET_CONFIG_UPDATE"
    SAVE_WIDGET_CONFIG = "SAVE_WIDGET_CONFIG"
    SSE_RELAY = "SSE_RELAY"
    CLOSE_APP = "CLOSE_APP"
