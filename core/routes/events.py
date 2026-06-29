from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from core.events.bus import get_bus

router = APIRouter(tags=["events"])


@router.get("/api/events")
async def sse_events() -> StreamingResponse:
    bus = get_bus()
    return StreamingResponse(bus.subscribe(), media_type="text/event-stream")
