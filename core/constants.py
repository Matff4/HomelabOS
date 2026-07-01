"""Frozen platform constants — Phase 0 contract."""

CORE_VERSION = "1.0.0"
PLUGIN_API_VERSION = 1

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
