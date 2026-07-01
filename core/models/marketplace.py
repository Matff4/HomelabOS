from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class MarketplaceEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    tarball_url: HttpUrl
    description: str | None = None
    icon: str | None = None
    api_version: Literal[1] = 1
    homelabos_min: str | None = Field(default=None, pattern=r"^\d+\.\d+\.\d+$")


class MarketplaceCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    updated_at: datetime | None = None
    plugins: list[MarketplaceEntry] = Field(default_factory=list)
