"""Plugin discovery and lifecycle."""

from core.plugins.loader import LoadedPlugin, PluginManager, get_plugin_manager, reset_plugin_manager

__all__ = ["LoadedPlugin", "PluginManager", "get_plugin_manager", "reset_plugin_manager"]
