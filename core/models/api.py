from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from core.models.config import SystemConfig
from core.models.layout import LayoutItem
from core.models.manifest import ComponentSize, ComponentType, SettingOption, SettingType


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
    version: str
    dev: bool
    mock_hal: bool
    time: datetime


class SystemStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cpu_percent: float = Field(ge=0, le=100)
    mem_used_mb: float = Field(ge=0)
    mem_total_mb: float = Field(ge=0)
    mem_percent: float = Field(ge=0, le=100)
    uptime_seconds: float = Field(ge=0)


class DisplayInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: int = Field(ge=1)
    height: int = Field(ge=1)
    kiosk: bool = True


PowerAction = Literal["reboot", "shutdown", "restart-kiosk"]


class PowerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: PowerAction


class PluginSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    version: str
    enabled: bool = True
    bundled: bool = False


class PluginHealth(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    status: Literal["ok", "degraded", "error"]
    message: str | None = None


class PluginInstallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(description="HTTPS URL to plugin package tarball")


class WidgetConfigPatch(BaseModel):
    """Partial layout update for one widget instance."""

    model_config = ConfigDict(extra="forbid")

    instance_id: str
    config: dict


class WidgetSettingInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    type: SettingType
    default: str | int | float | bool | None = None
    options: list[SettingOption] | None = None


class ComponentInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    plugin_id: str
    type: ComponentType
    name: str
    icon: str | None = None
    entry_url: str
    size: ComponentSize | None = None
    min_size: ComponentSize | None = None
    settings: list[WidgetSettingInfo] | None = None


# Re-export document types used by config/layout routes
ConfigDocument = SystemConfig
LayoutDocument = list[LayoutItem]
