from typing import Literal

from pydantic import AnyUrl, BaseModel, ConfigDict, Field

from core.constants import DEFAULT_MARKETPLACE_URL


TimeFormat = Literal["12", "24"]
RamFormat = Literal["percent", "absolute"]
Theme = Literal["dark", "light"]
BarHeight = Literal["small", "medium", "big"]
AccentColor = Literal["blue", "green", "purple", "red", "orange", "yellow"]


class SystemConfig(BaseModel):
    """System-wide UI preferences persisted in data/config.json."""

    model_config = ConfigDict(extra="forbid")

    timeFormat: TimeFormat = "24"
    ramFormat: RamFormat = "percent"
    theme: Theme = "dark"
    barHeight: BarHeight = "medium"
    widgetBarHeight: BarHeight = "medium"
    accentColor: AccentColor = "blue"
    marketplaceUrl: AnyUrl | None = Field(default=DEFAULT_MARKETPLACE_URL)
    paneCount: int = Field(default=1, ge=1, le=8)
    taskbarActions: list[str] = Field(
        default_factory=list,
        description="Component ids (type=action) pinned to the taskbar",
    )
