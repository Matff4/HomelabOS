"""Phase 1 tests."""

from fastapi.testclient import TestClient

from core.app import create_app


def test_health():
    client = TestClient(create_app())
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["version"] == "2.0.0"
