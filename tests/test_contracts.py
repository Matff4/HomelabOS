"""Contract shape tests — guard frozen API/SDK surfaces."""

from core.constants import PostMessageType, SSEChannel


def test_platform_endpoint(client):
    response = client.get("/api/platform")
    assert response.status_code == 200
    body = response.json()
    assert body["core_version"]
    assert body["plugin_api_version"] == 1
    assert body["sdk_version"]
    assert body["supported_manifest_api_versions"] == [1]


def test_components_shape(client):
    response = client.get("/api/components")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_frozen_post_message_types():
    expected = {
        "PLUGIN_READY",
        "OS_THEME_UPDATE",
        "WIDGET_CONFIG",
        "WIDGET_CONFIG_UPDATE",
        "SAVE_WIDGET_CONFIG",
        "SSE_RELAY",
        "CLOSE_APP",
    }
    actual = {
        PostMessageType.PLUGIN_READY,
        PostMessageType.OS_THEME_UPDATE,
        PostMessageType.WIDGET_CONFIG,
        PostMessageType.WIDGET_CONFIG_UPDATE,
        PostMessageType.SAVE_WIDGET_CONFIG,
        PostMessageType.SSE_RELAY,
        PostMessageType.CLOSE_APP,
    }
    assert actual == expected


def test_frozen_sse_channels():
    assert SSEChannel.HEARTBEAT == "system.heartbeat"
    assert SSEChannel.STATS == "system.stats"
    assert SSEChannel.DISPLAY == "system.display"
    assert SSEChannel.plugin("uptime", "tick") == "plugin.uptime.tick"


def test_system_backup(client, data_dir):
    (data_dir / "config.json").write_text('{"theme":"dark"}', encoding="utf-8")
    response = client.get("/api/system/backup")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/gzip")
    assert len(response.content) > 32
