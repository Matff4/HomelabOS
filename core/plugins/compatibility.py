"""Plugin ↔ core compatibility checks (boot + install)."""

from __future__ import annotations

import re

from core import __version__
from core.constants import PLUGIN_API_VERSION
from core.models.manifest import PluginManifest

_SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def semver_tuple(value: str) -> tuple[int, int, int]:
    match = _SEMVER.match(value)
    if not match:
        raise ValueError(f"Invalid semver: {value}")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def core_meets_requirement(requires: str | None) -> bool:
    if not requires:
        return True
    return semver_tuple(__version__) >= semver_tuple(requires)


def assess_plugin_compatibility(manifest: PluginManifest) -> tuple[bool, str | None]:
    """Return (enabled, reason). Incompatible plugins stay on disk but are disabled."""
    if manifest.api_version > PLUGIN_API_VERSION:
        return (
            False,
            f"Requires manifest api_version {manifest.api_version}; "
            f"core supports up to {PLUGIN_API_VERSION}",
        )
    required = manifest.requires.core if manifest.requires else None
    if required and not core_meets_requirement(required):
        return (
            False,
            f"Requires HomelabOS core >={required}; running {__version__}",
        )
    return True, None
