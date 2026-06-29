#!/usr/bin/env python3
"""Regenerate schemas/*.schema.json from Pydantic models (source of truth)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.models.config import SystemConfig  # noqa: E402
from core.models.layout import Layout  # noqa: E402
from core.models.manifest import PluginManifest  # noqa: E402

SCHEMAS_DIR = ROOT / "schemas"

MODELS: list[tuple[type, str, str]] = [
    (SystemConfig, "config.schema.json", "HomelabOS System Config"),
    (Layout, "layout.schema.json", "HomelabOS Dashboard Layout"),
    (PluginManifest, "manifest.schema.json", "HomelabOS Plugin Manifest"),
]


def _inject_meta(schema: dict, filename: str, title: str) -> dict:
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = f"https://homelabos.local/schemas/{filename}"
    schema["title"] = title
    return schema


def main() -> None:
    SCHEMAS_DIR.mkdir(parents=True, exist_ok=True)
    for model, filename, title in MODELS:
        body = model.model_json_schema(mode="validation")
        body = _inject_meta(body, filename, title)
        path = SCHEMAS_DIR / filename
        path.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
