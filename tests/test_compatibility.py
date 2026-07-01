"""Plugin compatibility enforcement tests."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from core.app import create_app, reset_runtime


def _write_incompatible_plugin(plugins_dir: Path) -> None:
    plugin_dir = plugins_dir / "future"
    plugin_dir.mkdir(parents=True)
    manifest = {
        "id": "future",
        "name": "Future Plugin",
        "version": "1.0.0",
        "api_version": 1,
        "requires": {"core": "99.0.0"},
        "components": [
            {
                "id": "future_widget",
                "type": "widget",
                "name": "Future",
                "entry": "src/widget.html",
            }
        ],
    }
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin_dir / "src").mkdir()
    (plugin_dir / "src" / "widget.html").write_text("<!DOCTYPE html><html></html>", encoding="utf-8")


def test_incompatible_user_plugin_disabled_at_boot(data_dir, apps_dir, monkeypatch):
    from core.settings import settings

    monkeypatch.setattr(settings, "data_dir", data_dir)
    monkeypatch.setattr(settings, "apps_dir", apps_dir)
    monkeypatch.setattr(settings, "plugins_dir", data_dir / "plugins")
    monkeypatch.setattr(settings, "dev", True)
    monkeypatch.setattr(settings, "mock_hal", True)

    _write_incompatible_plugin(data_dir / "plugins")

    reset_runtime()
    with TestClient(create_app()) as boot_client:
        plugins = boot_client.get("/api/plugins").json()
        assert len(plugins) == 1
        assert plugins[0]["id"] == "future"
        assert plugins[0]["enabled"] is False
        assert "Requires HomelabOS core" in (plugins[0].get("message") or "")

        components = boot_client.get("/api/components").json()
        assert components == []

        health = boot_client.get("/api/plugins/future/health").json()
        assert health["status"] == "error"
    reset_runtime()


def test_install_rejects_high_core_requirement(client, tmp_path):
    import io
    import tarfile

    manifest = {
        "id": "needs-core",
        "name": "Needs Core",
        "version": "1.0.0",
        "api_version": 1,
        "requires": {"core": "99.0.0"},
        "components": [
            {
                "id": "needs_core_widget",
                "type": "widget",
                "name": "Needs",
                "entry": "src/widget.html",
            }
        ],
    }
    archive = tmp_path / "needs.tgz"
    payload = json.dumps(manifest).encode()
    with tarfile.open(archive, mode="w:gz") as tar:
        info = tarfile.TarInfo("manifest.json")
        info.size = len(payload)
        tar.addfile(info, io.BytesIO(payload))

    response = client.post("/api/plugins/install", json={"url": archive.as_uri()})
    assert response.status_code == 409
