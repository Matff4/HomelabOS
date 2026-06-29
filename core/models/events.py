from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SSEMessage(BaseModel):
    """Envelope for every server-sent event on GET /api/events."""

    model_config = ConfigDict(extra="forbid")

    channel: str
    data: dict[str, Any] = Field(default_factory=dict)
    ts: datetime | None = None
