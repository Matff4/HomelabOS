import pytest
from fastapi.testclient import TestClient

from core.app import create_app, reset_runtime
from core.settings import settings


@pytest.fixture
def data_dir(tmp_path):
    path = tmp_path / "data"
    path.mkdir()
    return path


@pytest.fixture
def apps_dir(tmp_path):
    path = tmp_path / "apps"
    path.mkdir()
    return path


@pytest.fixture
def client(data_dir, apps_dir, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", data_dir)
    monkeypatch.setattr(settings, "apps_dir", apps_dir)
    monkeypatch.setattr(settings, "plugins_dir", data_dir / "plugins")
    monkeypatch.setattr(settings, "dev", True)
    monkeypatch.setattr(settings, "mock_hal", True)
    reset_runtime()
    with TestClient(create_app()) as test_client:
        yield test_client
    reset_runtime()


@pytest.fixture
def client_with_demo(data_dir, apps_dir, monkeypatch):
    import shutil
    from pathlib import Path

    monkeypatch.setattr(settings, "data_dir", data_dir)
    monkeypatch.setattr(settings, "apps_dir", apps_dir)
    monkeypatch.setattr(settings, "plugins_dir", data_dir / "plugins")
    monkeypatch.setattr(settings, "dev", True)
    monkeypatch.setattr(settings, "mock_hal", True)

    repo_demo = Path(__file__).resolve().parent.parent / "apps" / "demo"
    shutil.copytree(repo_demo, apps_dir / "demo")
    reset_runtime()
    with TestClient(create_app()) as test_client:
        yield test_client
    reset_runtime()
