from typing import Any

from pydantic import BaseModel, ConfigDict, Field, RootModel


class LayoutItem(BaseModel):
    """One widget instance on the dashboard grid."""

    model_config = ConfigDict(extra="forbid")

    instance_id: str = Field(description="Unique instance id, e.g. inst_1710000000123")
    component_id: str = Field(description="Globally unique component id from a plugin manifest")
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)
    pane: int = Field(ge=0, description="Workspace pane index (0 = first)")
    config: dict[str, Any] = Field(default_factory=dict, description="Per-instance widget settings")


class Layout(RootModel[list[LayoutItem]]):
    """Dashboard layout persisted in data/layout.json."""

    root: list[LayoutItem]
