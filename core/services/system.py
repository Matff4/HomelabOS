"""System metrics and display detection."""

from __future__ import annotations

import logging
import os
import subprocess
import time

import psutil

from core.models.api import DisplayInfo, SystemStats

logger = logging.getLogger(__name__)

_stats_cache: dict[str, object] = {"data": None, "timestamp": 0.0}
CACHE_TTL = 2.0


def collect_system_stats() -> SystemStats:
    now = time.time()
    cached = _stats_cache.get("data")
    ts = _stats_cache.get("timestamp", 0.0)
    if isinstance(cached, SystemStats) and (now - float(ts)) < CACHE_TTL:
        return cached

    cpu = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    result = SystemStats(
        cpu_percent=round(cpu, 1),
        mem_used_mb=round(mem.used / (1024 * 1024), 1),
        mem_total_mb=round(mem.total / (1024 * 1024), 1),
        mem_percent=round(mem.percent, 1),
        uptime_seconds=round(time.time() - psutil.boot_time(), 1),
    )
    _stats_cache["data"] = result
    _stats_cache["timestamp"] = now
    return result


def detect_display(*, mock_hal: bool) -> DisplayInfo:
    if mock_hal:
        return DisplayInfo(width=1424, height=280, kiosk=False)

    width = int(os.environ.get("HOMELABOS_DISPLAY_WIDTH", "0"))
    height = int(os.environ.get("HOMELABOS_DISPLAY_HEIGHT", "0"))
    if width > 0 and height > 0:
        return DisplayInfo(width=width, height=height, kiosk=True)

    geometry = _probe_wayland_display() or _probe_drm_display()
    if geometry:
        return DisplayInfo(width=geometry[0], height=geometry[1], kiosk=True)

    logger.warning("Display geometry unknown — using 1920x1080 fallback")
    return DisplayInfo(width=1920, height=1080, kiosk=True)


def _probe_wayland_display() -> tuple[int, int] | None:
    try:
        result = subprocess.run(
            ["wlr-randr"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None

    current_name: str | None = None
    for line in result.stdout.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if not stripped.startswith(" ") and stripped.endswith(":"):
            current_name = stripped[:-1]
            continue
        if current_name and "current" in stripped and "x" in stripped:
            # e.g. 1424x280 px, 60.000000 Hz (current)
            token = stripped.split("current", 1)[0].strip().split()[0]
            if "x" in token:
                w_str, h_str = token.split("x", 1)
                return int(w_str), int(h_str.split()[0])
    return None


def _probe_drm_display() -> tuple[int, int] | None:
    drm_root = os.path.join(os.sep, "sys", "class", "drm")
    if not os.path.isdir(drm_root):
        return None
    for entry in sorted(os.listdir(drm_root)):
        modes_path = os.path.join(drm_root, entry, "modes")
        if not os.path.isfile(modes_path):
            continue
        with open(modes_path, encoding="utf-8") as handle:
            for line in handle:
                if "x" in line:
                    w_str, h_str = line.strip().split("x", 1)
                    return int(w_str), int(h_str)
    return None
