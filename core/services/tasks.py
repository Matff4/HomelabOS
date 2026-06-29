"""Background asyncio tasks."""

from __future__ import annotations

import asyncio
import logging

from core.constants import SSEChannel
from core.events.bus import EventBus
from core.services.system import collect_system_stats, detect_display
from core.settings import settings

logger = logging.getLogger(__name__)


async def run_publishers(bus: EventBus) -> None:
    stats_task = asyncio.create_task(_stats_loop(bus), name="homelabos-stats")
    heartbeat_task = asyncio.create_task(_heartbeat_loop(bus), name="homelabos-heartbeat")
    display_task = asyncio.create_task(_display_loop(bus), name="homelabos-display")
    try:
        await asyncio.gather(stats_task, heartbeat_task, display_task)
    except asyncio.CancelledError:
        for task in (stats_task, heartbeat_task, display_task):
            task.cancel()
        await asyncio.gather(stats_task, heartbeat_task, display_task, return_exceptions=True)
        raise


async def _stats_loop(bus: EventBus) -> None:
    while True:
        try:
            stats = collect_system_stats()
            await bus.publish(SSEChannel.STATS, stats.model_dump())
        except Exception:
            logger.exception("stats publisher failed")
        await asyncio.sleep(2)


async def _heartbeat_loop(bus: EventBus) -> None:
    while True:
        try:
            await bus.publish(SSEChannel.HEARTBEAT, {"ok": True})
        except Exception:
            logger.exception("heartbeat publisher failed")
        await asyncio.sleep(30)


async def _display_loop(bus: EventBus) -> None:
    display = detect_display(mock_hal=settings.mock_hal)
    await bus.publish(SSEChannel.DISPLAY, display.model_dump())
    while True:
        await asyncio.sleep(300)
        try:
            display = detect_display(mock_hal=settings.mock_hal)
            await bus.publish(SSEChannel.DISPLAY, display.model_dump())
        except Exception:
            logger.exception("display publisher failed")
