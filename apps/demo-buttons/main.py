"""Taskbar action handlers — momentary pulse and toggle lamp."""

from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

router = APIRouter()

_lamp_on = False
_last_pulse_at: float | None = None


class ActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: str = "momentary"


@router.get("/ping")
async def ping() -> dict[str, bool]:
    return {"pong": True}


@router.get("/action/{component_id}/state")
async def action_state(component_id: str) -> dict[str, str | bool]:
    if component_id == "demo_lamp":
        return {"ok": True, "state": "on" if _lamp_on else "off", "active": _lamp_on}
    if component_id == "demo_pulse":
        return {"ok": True, "state": "idle", "active": False}
    raise HTTPException(status_code=404, detail="Unknown action")


@router.post("/action/{component_id}")
async def run_action(component_id: str, body: ActionRequest) -> dict[str, str | bool]:
    global _lamp_on, _last_pulse_at

    if component_id == "demo_pulse":
        _last_pulse_at = time.time()
        return {"ok": True, "state": "pulsed", "active": False}

    if component_id == "demo_lamp":
        if body.mode == "toggle":
            _lamp_on = not _lamp_on
        else:
            _lamp_on = True
        return {"ok": True, "state": "on" if _lamp_on else "off", "active": _lamp_on}

    raise HTTPException(status_code=404, detail="Unknown action")
