"""Install user plugins from tarballs into data/plugins/."""

from __future__ import annotations

import json
import logging
import re
import shutil
import tarfile
import tempfile
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse
from urllib.request import url2pathname, urlopen

from fastapi import HTTPException
from pydantic import ValidationError

from core import __version__
from core.constants import PLUGIN_API_VERSION
from core.models.manifest import PluginManifest
from core.models.registry import PluginRegistry, RegistryEntry
from core.storage.registry_store import registry_store

logger = logging.getLogger(__name__)

_SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


class PluginInstallError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def _semver_tuple(value: str) -> tuple[int, int, int]:
    match = _SEMVER.match(value)
    if not match:
        raise PluginInstallError(f"Invalid semver: {value}")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def core_meets_requirement(requires: str | None) -> bool:
    if not requires:
        return True
    return _semver_tuple(__version__) >= _semver_tuple(requires)


def _download(url: str) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme == "file":
        path = Path(url2pathname(parsed.path))
        if not path.is_file():
            raise PluginInstallError(f"File not found: {path}", status_code=404)
        return path.read_bytes()

    if parsed.scheme not in ("http", "https"):
        raise PluginInstallError(f"Unsupported URL scheme: {parsed.scheme or '(none)'}")

    try:
        with urlopen(url, timeout=60) as response:
            return response.read()
    except OSError as exc:
        raise PluginInstallError(f"Download failed: {exc}", status_code=502) from exc


def _find_manifest_root(extracted: Path) -> Path:
    direct = extracted / "manifest.json"
    if direct.is_file():
        return extracted

    candidates = [path.parent for path in extracted.rglob("manifest.json")]
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        raise PluginInstallError("Tarball contains multiple manifest.json files")
    raise PluginInstallError("manifest.json not found in package")


def _validate_manifest(raw: dict) -> PluginManifest:
    try:
        manifest = PluginManifest.model_validate(raw)
    except ValidationError as exc:
        raise PluginInstallError(f"Invalid manifest.json: {exc}") from exc

    if manifest.api_version > PLUGIN_API_VERSION:
        raise PluginInstallError(
            f"Plugin requires api_version {manifest.api_version}; "
            f"core supports up to {PLUGIN_API_VERSION}",
            status_code=409,
        )

    if not core_meets_requirement(manifest.requires.core if manifest.requires else None):
        required = manifest.requires.core if manifest.requires else "?"
        raise PluginInstallError(
            f"Plugin requires HomelabOS core >={required}; running {__version__}",
            status_code=409,
        )
    return manifest


def install_plugin_from_url(
    url: str,
    *,
    bundled_dir: Path,
    user_dir: Path,
) -> RegistryEntry:
    payload = _download(url)
    user_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="homelabos-plugin-") as tmp:
        tmp_path = Path(tmp)
        archive_path = tmp_path / "package.tgz"
        archive_path.write_bytes(payload)

        try:
            with tarfile.open(archive_path, mode="r:*") as archive:
                for member in archive.getmembers():
                    target = PurePosixPath(member.name)
                    if target.is_absolute() or ".." in target.parts:
                        raise PluginInstallError("Unsafe path in plugin tarball")
                archive.extractall(tmp_path / "extract", filter="data")
        except tarfile.TarError as exc:
            raise PluginInstallError(f"Invalid tarball: {exc}") from exc

        plugin_root = _find_manifest_root(tmp_path / "extract")
        manifest_path = plugin_root / "manifest.json"
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest = _validate_manifest(raw)

        if (bundled_dir / manifest.id).is_dir():
            raise PluginInstallError(
                f"Plugin id {manifest.id!r} is bundled with core and cannot be installed",
                status_code=409,
            )

        dest = user_dir / manifest.id
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(plugin_root, dest)

    entry = RegistryEntry(
        id=manifest.id,
        version=manifest.version,
        source=url,
        installed_at=datetime.now(UTC),
    )
    registry = registry_store().read()
    registry.plugins = [row for row in registry.plugins if row.id != manifest.id]
    registry.plugins.append(entry)
    registry_store().write(registry)
    logger.info("Installed plugin %s v%s from %s", manifest.id, manifest.version, url)
    return entry


def remove_installed_plugin(plugin_id: str, *, bundled_dir: Path, user_dir: Path) -> None:
    if (bundled_dir / plugin_id).is_dir():
        raise PluginInstallError(
            f"Plugin {plugin_id!r} is bundled with core and cannot be removed",
            status_code=409,
        )

    dest = user_dir / plugin_id
    if not dest.is_dir():
        raise PluginInstallError(f"Plugin {plugin_id!r} is not installed", status_code=404)

    shutil.rmtree(dest)
    registry = registry_store().read()
    registry.plugins = [row for row in registry.plugins if row.id != plugin_id]
    registry_store().write(registry)
    logger.info("Removed plugin %s", plugin_id)


def update_installed_plugin(
    plugin_id: str,
    url: str,
    *,
    bundled_dir: Path,
    user_dir: Path,
) -> RegistryEntry:
    if (bundled_dir / plugin_id).is_dir():
        raise PluginInstallError(
            f"Plugin {plugin_id!r} is bundled with core and cannot be updated via store",
            status_code=409,
        )
    if not (user_dir / plugin_id).is_dir():
        raise PluginInstallError(f"Plugin {plugin_id!r} is not installed", status_code=404)
    entry = install_plugin_from_url(url, bundled_dir=bundled_dir, user_dir=user_dir)
    if entry.id != plugin_id:
        raise PluginInstallError(
            f"Update package id {entry.id!r} does not match installed plugin {plugin_id!r}",
            status_code=409,
        )
    return entry


def install_error_to_http(exc: PluginInstallError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))
