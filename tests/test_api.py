from unittest.mock import patch

import pytest


def test_config_defaults(client):
    response = client.get("/api/config")
    assert response.status_code == 200
    body = response.json()
    assert body["theme"] == "dark"
    assert body["timeFormat"] == "24"


def test_config_put_round_trip(client):
    payload = {"theme": "light", "accentColor": "green"}
    put = client.put("/api/config", json=payload)
    assert put.status_code == 200
    assert put.json()["theme"] == "light"

    get = client.get("/api/config")
    assert get.json()["theme"] == "light"
    assert get.json()["accentColor"] == "green"


def test_layout_put_and_patch(client):
    item = {
        "instance_id": "inst_1",
        "component_id": "demo_widget",
        "x": 0,
        "y": 0,
        "w": 2,
        "h": 2,
        "pane": 0,
        "config": {"title": "Hello"},
    }
    put = client.put("/api/layout", json=[item])
    assert put.status_code == 200
    assert len(put.json()) == 1

    patch = client.patch("/api/layout/widget", json={"instance_id": "inst_1", "config": {"title": "Updated"}})
    assert patch.status_code == 200
    assert patch.json()["config"]["title"] == "Updated"


def test_layout_patch_unknown_instance(client):
    response = client.patch(
        "/api/layout/widget",
        json={"instance_id": "missing", "config": {}},
    )
    assert response.status_code == 404


def test_system_stats(client):
    response = client.get("/api/system/stats")
    assert response.status_code == 200
    body = response.json()
    assert "cpu_percent" in body
    assert "mem_total_mb" in body
    assert "uptime_seconds" in body


def test_system_display_mock_defaults(client, monkeypatch):
    monkeypatch.delenv("HOMELABOS_DISPLAY_WIDTH", raising=False)
    monkeypatch.delenv("HOMELABOS_DISPLAY_HEIGHT", raising=False)
    response = client.get("/api/system/display")
    assert response.status_code == 200
    assert response.json() == {"width": 1920, "height": 1080, "kiosk": False}


def test_system_display_mock_env_override(client, monkeypatch):
    monkeypatch.setenv("HOMELABOS_DISPLAY_WIDTH", "1424")
    monkeypatch.setenv("HOMELABOS_DISPLAY_HEIGHT", "280")
    response = client.get("/api/system/display")
    assert response.status_code == 200
    assert response.json() == {"width": 1424, "height": 280, "kiosk": False}


def test_system_power(client, monkeypatch):
    monkeypatch.setattr("core.routes.system.shutil.which", lambda _: None)
    with patch("core.routes.system.subprocess.Popen") as popen:
        response = client.post("/api/system/power", json={"action": "reboot"})
    assert response.status_code == 200
    assert response.json()["action"] == "reboot"
    popen.assert_called_once()
    assert popen.call_args[0][0] == ["systemctl", "reboot"]


def test_plugins_empty(client):
    response = client.get("/api/plugins")
    assert response.status_code == 200
    assert response.json() == []


def test_demo_plugin_hidden_from_shell_lists(client_with_demo):
    plugins = client_with_demo.get("/api/plugins")
    assert plugins.status_code == 200
    assert plugins.json() == []

    components = client_with_demo.get("/api/components")
    assert components.status_code == 200
    assert not any(row["id"] == "demo_widget" for row in components.json())

    health = client_with_demo.get("/api/plugins/demo/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    ping = client_with_demo.get("/api/plugins/demo/ping")
    assert ping.status_code == 200
    assert ping.json()["pong"] is True

    widget = client_with_demo.get("/apps/demo/src/widget.html")
    assert widget.status_code == 200


def test_plugin_install_not_implemented(client):
    response = client.post("/api/plugins/install", json={"url": "https://example.com/not-a-real.tgz"})
    assert response.status_code == 502


def _write_plugin_tarball(path: Path, plugin_id: str = "sample") -> None:
    import io
    import json
    import tarfile

    manifest = {
        "id": plugin_id,
        "name": "Sample Plugin",
        "version": "1.0.0",
        "api_version": 1,
        "backend": "main.py",
        "components": [
            {
                "id": f"{plugin_id}_widget",
                "type": "widget",
                "name": "Sample",
                "entry": "src/widget.html",
                "size": {"w": 2, "h": 2},
            }
        ],
    }
    backend = (
        "from fastapi import APIRouter\n"
        "router = APIRouter()\n\n"
        "@router.get('/ping')\n"
        "async def ping() -> dict[str, bool]:\n"
        "    return {'pong': True}\n"
    )
    widget = "<!DOCTYPE html><html><body>sample</body></html>"

    with tarfile.open(path, mode="w:gz") as archive:
        for name, payload in (
            ("manifest.json", json.dumps(manifest, indent=2).encode()),
            ("main.py", backend.encode()),
            ("src/widget.html", widget.encode()),
        ):
            info = tarfile.TarInfo(name=name)
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))


def test_plugin_install_from_tarball(client, tmp_path):
    archive = tmp_path / "sample.tgz"
    _write_plugin_tarball(archive)
    url = archive.as_uri()

    response = client.post("/api/plugins/install", json={"url": url})
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "sample"
    assert body["restart_required"] is False

    plugins = client.get("/api/plugins").json()
    assert any(row["id"] == "sample" for row in plugins)

    widget = client.get("/apps/sample/src/widget.html")
    assert widget.status_code == 200
    assert "text/html" in widget.headers.get("content-type", "")

    ping = client.get("/api/plugins/sample/ping")
    assert ping.status_code == 200
    assert ping.json()["pong"] is True

    delete = client.delete("/api/plugins/sample")
    assert delete.status_code == 200
    assert client.get("/api/plugins").json() == []
    assert client.get("/api/layout").json() == []


def test_plugin_remove_clears_layout_widgets(client, tmp_path):
    archive = tmp_path / "sample.tgz"
    _write_plugin_tarball(archive)
    url = archive.as_uri()

    client.post("/api/plugins/install", json={"url": url})
    layout_item = {
        "instance_id": "inst_sample",
        "component_id": "sample_widget",
        "x": 0,
        "y": 0,
        "w": 2,
        "h": 2,
        "pane": 0,
        "config": {},
    }
    client.put("/api/layout", json=[layout_item])
    assert len(client.get("/api/layout").json()) == 1

    delete = client.delete("/api/plugins/sample")
    assert delete.status_code == 200
    assert client.get("/api/layout").json() == []


def test_event_bus_publish():
    import asyncio

    from core.events.bus import EventBus

    async def _run() -> None:
        bus = EventBus()
        messages: list[str] = []

        async def consume() -> None:
            async for msg in bus.subscribe():
                messages.append(msg)
                return

        consumer = asyncio.create_task(consume())
        await asyncio.sleep(0.05)
        await bus.publish("system.stats", {"cpu_percent": 1.0})
        await asyncio.wait_for(consumer, timeout=2.0)
        assert messages
        assert "system.stats" in messages[0]

    asyncio.run(_run())


def test_json_store_atomic_write(tmp_path):
    from core.models.config import SystemConfig
    from core.storage.json_store import JsonStore

    path = tmp_path / "config.json"
    store = JsonStore(path, SystemConfig, SystemConfig)
    store.write(SystemConfig(theme="light"))
    assert path.is_file()
    assert store.read().theme == "light"


def test_json_store_invalid_file(tmp_path):
    from core.models.config import SystemConfig
    from core.storage.json_store import JsonStore, JsonStoreError

    path = tmp_path / "config.json"
    path.write_text("{not json", encoding="utf-8")
    store = JsonStore(path, SystemConfig, SystemConfig)
    with pytest.raises(JsonStoreError):
        store.read()
