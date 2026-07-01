"""Marketplace catalog API tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _catalog_url(tmp_path: Path, tarball_url: str) -> str:
    catalog_path = tmp_path / "index.json"
    catalog = {
        "version": 1,
        "plugins": [
            {
                "id": "sample",
                "name": "Sample Plugin",
                "version": "1.0.0",
                "description": "Test catalog entry",
                "tarball_url": tarball_url,
                "api_version": 1,
            }
        ],
    }
    catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
    return catalog_path.as_uri()


def test_marketplace_catalog_from_file(client, tmp_path):
    url = _catalog_url(tmp_path, "https://example.com/sample.tgz")
    put = client.put(
        "/api/config",
        json={
            "timeFormat": "24",
            "ramFormat": "percent",
            "theme": "dark",
            "barHeight": "medium",
            "widgetBarHeight": "medium",
            "accentColor": "blue",
            "marketplaceUrl": url,
        },
    )
    assert put.status_code == 200

    response = client.get("/api/marketplace/catalog")
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == 1
    assert len(body["plugins"]) == 1
    assert body["plugins"][0]["id"] == "sample"


def test_demo_plugin_marked_bundled(client_with_demo):
    response = client_with_demo.get("/api/plugins")
    assert response.status_code == 200
    demo = next(row for row in response.json() if row["id"] == "demo")
    assert demo["bundled"] is True


def test_config_default_marketplace_url(client):
    response = client.get("/api/config")
    assert response.status_code == 200
    assert response.json()["marketplaceUrl"] is not None
    assert "HomelabOS-Plugins" in response.json()["marketplaceUrl"]
