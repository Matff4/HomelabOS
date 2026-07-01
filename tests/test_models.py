"""Phase 0 contract tests."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from core.models import (
    Layout,
    LayoutItem,
    PluginManifest,
    SSEMessage,
    SystemConfig,
)
from core.models.api import HealthResponse

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"
SCHEMAS = ROOT / "schemas"


def test_system_config_defaults():
    cfg = SystemConfig()
    assert cfg.theme == "dark"
    assert cfg.timeFormat == "24"
    assert cfg.marketplaceUrl is not None
    assert "HomelabOS-Plugins" in str(cfg.marketplaceUrl)


def test_system_config_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        SystemConfig.model_validate({"theme": "dark", "unknown": True})


def test_layout_item():
    item = LayoutItem(
        instance_id="inst_1",
        component_id="demo_widget",
        x=0,
        y=0,
        w=2,
        h=2,
        pane=0,
    )
    assert item.config == {}


def test_manifest_from_fixture():
    raw = json.loads((FIXTURES / "manifest.demo.json").read_text(encoding="utf-8"))
    manifest = PluginManifest.model_validate(raw)
    assert manifest.id == "demo"
    assert len(manifest.components) == 1


def test_sse_message():
    msg = SSEMessage(channel="system.stats", data={"cpu_percent": 1.0})
    assert msg.channel == "system.stats"


def test_health_response_round_trip():
    body = HealthResponse(version="1.0.0", dev=True, mock_hal=True, time="2026-01-01T00:00:00Z")
    dumped = body.model_dump(mode="json")
    assert dumped["status"] == "ok"


@pytest.mark.parametrize(
    "filename,model",
    [
        ("config.schema.json", SystemConfig),
        ("layout.schema.json", Layout),
        ("manifest.schema.json", PluginManifest),
    ],
)
def test_generated_schema_files_exist(filename, model):
    path = SCHEMAS / filename
    assert path.is_file(), f"missing {path}; run: python scripts/generate_schemas.py"
    on_disk = json.loads(path.read_text(encoding="utf-8"))
    generated = model.model_json_schema(mode="validation")
    generated["$schema"] = on_disk["$schema"]
    generated["$id"] = on_disk["$id"]
    generated["title"] = on_disk["title"]
    assert on_disk == generated
