#!/usr/bin/env python3
"""Create a portable backup of HomelabOS runtime data/."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
from pathlib import Path

from core.services.backup import create_data_backup
from core.settings import settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Backup HomelabOS data directory")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output .tar.gz path (default: homelabos-data-<timestamp>.tar.gz in cwd)",
    )
    args = parser.parse_args()

    data_dir = settings.data_dir
    if not data_dir.is_dir():
        raise SystemExit(f"Data directory not found: {data_dir}")

    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output = args.output or Path(f"homelabos-data-{stamp}.tar.gz")
    output.write_bytes(create_data_backup(data_dir))
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
