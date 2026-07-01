"""Create portable backups of runtime data/."""

from __future__ import annotations

import io
import tarfile
from datetime import UTC, datetime
from pathlib import Path


def create_data_backup(data_dir: Path) -> bytes:
    """Tar.gz of config, layout, registry, and user plugins (if present)."""
    buffer = io.BytesIO()
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")

    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for name in ("config.json", "layout.json", "registry.json"):
            path = data_dir / name
            if path.is_file():
                archive.add(path, arcname=f"homelabos-data-{stamp}/{name}")

        plugins_dir = data_dir / "plugins"
        if plugins_dir.is_dir():
            for path in sorted(plugins_dir.rglob("*")):
                if path.is_file():
                    rel = path.relative_to(data_dir).as_posix()
                    archive.add(path, arcname=f"homelabos-data-{stamp}/{rel}")

    return buffer.getvalue()
