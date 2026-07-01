from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RegistryEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    version: str
    source: str
    installed_at: datetime


class PluginRegistry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plugins: list[RegistryEntry] = Field(default_factory=list)
