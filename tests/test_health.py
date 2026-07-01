"""Phase 1 tests."""

from fastapi.testclient import TestClient

from core.app import create_app, reset_runtime


def test_health():
    reset_runtime()
    with TestClient(create_app()) as client:
        r = client.get("/api/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body["version"] == "1.0.0"
    reset_runtime()
