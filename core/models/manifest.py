from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ComponentType = Literal["widget", "app", "action"]
SettingType = Literal["text", "number", "boolean", "select", "password"]
ActionMode = Literal["toggle", "momentary"]


class ComponentSize(BaseModel):
    model_config = ConfigDict(extra="forbid")

    w: int = Field(ge=1)
    h: int = Field(ge=1)


class SettingOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    value: str


class WidgetSetting(BaseModel):
    """Declarative widget setting field (manifest components.settings)."""

    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    type: SettingType
    default: str | int | float | bool | None = None
    options: list[SettingOption] | None = None


class ManifestComponent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: ComponentType
    name: str
    entry: str = Field(description="HTML entry path relative to plugin root, e.g. src/widget.html")
    icon: str | None = None
    size: ComponentSize | None = None
    min_size: ComponentSize | None = None
    settings: list[WidgetSetting] | None = None
    action_mode: ActionMode | None = Field(
        default=None,
        description="For type=action: toggle (latched) or momentary (press)",
    )


class ManifestRequires(BaseModel):
    model_config = ConfigDict(extra="forbid")

    core: str | None = Field(default=None, description="Minimum HomelabOS core semver")


class PluginManifest(BaseModel):
    """Plugin manifest.json — source of truth for bundled and installed plugins."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z][a-z0-9-]*$")
    name: str
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    api_version: Literal[1] = 1
    requires: ManifestRequires | None = None
    dependencies: list[str] | None = None
    backend: str | None = Field(default=None, description="Python entry module, e.g. main.py")
    components: list[ManifestComponent] = Field(min_length=1)

    @field_validator("dependencies")
    @classmethod
    def strip_empty_dependencies(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and len(value) == 0:
            return None
        return value
