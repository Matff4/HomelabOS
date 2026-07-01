"""Bundled demo reference plugins (widget, actions, app)."""

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.app import create_app, reset_runtime
from core.settings import settings

DEMO_PLUGINS = ("demo-widget", "demo-buttons", "demo-app")


@pytest.fixture
def client_with_demos(data_dir, apps_dir, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", data_dir)
    monkeypatch.setattr(settings, "apps_dir", apps_dir)
    monkeypatch.setattr(settings, "plugins_dir", data_dir / "plugins")
    monkeypatch.setattr(settings, "dev", True)
    monkeypatch.setattr(settings, "mock_hal", True)

    repo_apps = Path(__file__).resolve().parent.parent / "apps"
    for plugin_id in DEMO_PLUGINS:
        src = repo_apps / plugin_id
        if src.is_dir():
            shutil.copytree(src, apps_dir / plugin_id)

    reset_runtime()
    with TestClient(create_app()) as test_client:
        yield test_client
    reset_runtime()


def test_demo_plugins_discovered(client_with_demos):
    plugins = client_with_demos.get("/api/plugins").json()
    ids = {row["id"] for row in plugins}
    for plugin_id in DEMO_PLUGINS:
        assert plugin_id in ids

    components = client_with_demos.get("/api/components").json()
    types = {row["type"] for row in components}
    assert "widget" in types
    assert "action" in types
    assert "app" in types


def test_demo_buttons_momentary_and_toggle(client_with_demos):
    pulse = client_with_demos.post(
        "/api/plugins/demo-buttons/action/demo_pulse",
        json={"mode": "momentary"},
    )
    assert pulse.status_code == 200
    assert pulse.json()["state"] == "pulsed"

    lamp = client_with_demos.post(
        "/api/plugins/demo-buttons/action/demo_lamp",
        json={"mode": "toggle"},
    )
    assert lamp.status_code == 200
    assert lamp.json()["active"] is True

    state = client_with_demos.get("/api/plugins/demo-buttons/action/demo_lamp/state")
    assert state.status_code == 200
    assert state.json()["active"] is True

    lamp2 = client_with_demos.post(
        "/api/plugins/demo-buttons/action/demo_lamp",
        json={"mode": "toggle"},
    )
    assert lamp2.json()["active"] is False


def test_demo_app_backend(client_with_demos):
    info = client_with_demos.get("/api/plugins/demo-app/info")
    assert info.status_code == 200
    assert info.json()["plugin"] == "demo-app"

    html = client_with_demos.get("/apps/demo-app/src/app.html")
    assert html.status_code == 200
