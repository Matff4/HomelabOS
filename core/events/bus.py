"""Server-sent event bus."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from core.models.events import SSEMessage

logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self) -> None:
        self._clients: list[asyncio.Queue[str]] = []
        self._running = True

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def publish(self, channel: str, data: dict) -> None:
        if not self._clients:
            return
        message = SSEMessage(channel=channel, data=data, ts=datetime.now(UTC))
        payload = json.dumps(message.model_dump(mode="json"))
        for client in list(self._clients):
            await client.put(payload)

    async def subscribe(self) -> AsyncIterator[str]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        self._clients.append(queue)
        logger.info("SSE client connected (%s total)", len(self._clients))
        try:
            while self._running:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    continue
        finally:
            if queue in self._clients:
                self._clients.remove(queue)
            logger.info("SSE client disconnected (%s total)", len(self._clients))

    def stop(self) -> None:
        self._running = False


_bus: EventBus | None = None


def get_bus() -> EventBus:
    global _bus
    if _bus is None:
        _bus = EventBus()
    return _bus


def reset_bus() -> None:
    global _bus
    if _bus is not None:
        _bus.stop()
    _bus = None
