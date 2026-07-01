"""Config migration tests."""

from core.services.config_migrate import migrate_config
from core.storage import config_store


def test_migrate_clears_taskbar_actions(data_dir, monkeypatch):
    from core.settings import settings

    monkeypatch.setattr(settings, "data_dir", data_dir)
    store = config_store()
    store.write(
        store.read().model_copy(update={"taskbarActions": ["demo_pulse", "demo_lamp"]}),
    )

    migrate_config()

    assert store.read().taskbarActions == []
