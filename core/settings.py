from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HOMELABOS_", env_file=".env", extra="ignore")

    dev: bool = False
    mock_hal: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # Resolved at runtime relative to repo root
    root_dir: Path = Path(__file__).resolve().parent.parent
    data_dir: Path | None = None
    apps_dir: Path | None = None
    plugins_dir: Path | None = None
    shell_dist_dir: Path | None = None

    def model_post_init(self, __context) -> None:
        if self.data_dir is None:
            object.__setattr__(self, "data_dir", self.root_dir / "data")
        if self.apps_dir is None:
            object.__setattr__(self, "apps_dir", self.root_dir / "apps")
        if self.plugins_dir is None:
            object.__setattr__(self, "plugins_dir", self.data_dir / "plugins")
        if self.shell_dist_dir is None:
            object.__setattr__(self, "shell_dist_dir", self.root_dir / "shell" / "dist")

    @property
    def config_path(self) -> Path:
        assert self.data_dir
        return self.data_dir / "config.json"

    @property
    def layout_path(self) -> Path:
        assert self.data_dir
        return self.data_dir / "layout.json"

    @property
    def registry_path(self) -> Path:
        assert self.data_dir
        return self.data_dir / "registry.json"


settings = Settings()
if settings.dev:
    settings.mock_hal = True
