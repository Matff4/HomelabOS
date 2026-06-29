from typing import Literal

from pydantic import BaseModel, ConfigDict, HttpUrl


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
    marketplaceUrl: HttpUrl | None = None
