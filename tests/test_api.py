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


def test_system_display_mock(client):
    response = client.get("/api/system/display")
    assert response.status_code == 200
    body = response.json()
    assert body == {"width": 1424, "height": 280, "kiosk": False}


def test_system_power(client):
    with patch("core.routes.system.subprocess.Popen") as popen:
        response = client.post("/api/system/power", json={"action": "reboot"})
    assert response.status_code == 200
    assert response.json()["action"] == "reboot"
    popen.assert_called_once()
    args = popen.call_args[0][0]
    assert "reboot" in args


def test_plugins_empty(client):
    response = client.get("/api/plugins")
    assert response.status_code == 200
    assert response.json() == []


def test_demo_plugin(client_with_demo):
    plugins = client_with_demo.get("/api/plugins")
    assert plugins.status_code == 200
    assert len(plugins.json()) == 1
    assert plugins.json()[0]["id"] == "demo"

    components = client_with_demo.get("/api/components")
    assert components.status_code == 200
    assert any(row["id"] == "demo_widget" for row in components.json())

    health = client_with_demo.get("/api/plugins/demo/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    ping = client_with_demo.get("/api/plugins/demo/ping")
    assert ping.status_code == 200
    assert ping.json()["pong"] is True

    widget = client_with_demo.get("/apps/demo/src/widget.html")
    assert widget.status_code == 200


def test_plugin_install_not_implemented(client):
    response = client.post("/api/plugins/install", json={"url": "https://example.com/p.tgz"})
    assert response.status_code == 501


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
