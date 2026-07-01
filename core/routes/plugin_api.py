"""Dispatch /api/plugins/{id}/… to plugin backends without service restart."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from core.plugins.loader import get_plugin_manager
from core.settings import settings

router = APIRouter(include_in_schema=False)

_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]


def _manager():
    assert settings.apps_dir
    assert settings.plugins_dir
    manager = get_plugin_manager(settings.apps_dir, settings.plugins_dir)
    if not manager.plugins:
        manager.discover()
    return manager


@router.api_route("/api/plugins/{plugin_id}/{path:path}", methods=_METHODS)
async def plugin_backend_dispatch(plugin_id: str, path: str, request: Request) -> Response:
    plugin_router = _manager().get_backend_router(plugin_id)
    if plugin_router is None:
        raise HTTPException(status_code=404, detail="Plugin backend not found")

    sub_path = f"/{path}" if path else "/"
    scope = dict(request.scope)
    scope["path"] = sub_path
    scope["root_path"] = request.scope.get("root_path", "") + f"/api/plugins/{plugin_id}"
    scope["route"] = None

    body = b""
    status = 500
    headers: list[tuple[bytes, bytes]] = []

    async def receive():
        return await request._receive()

    async def send(message: dict) -> None:
        nonlocal body, status, headers
        if message["type"] == "http.response.start":
            status = message["status"]
            headers = message.get("headers", [])
        elif message["type"] == "http.response.body":
            body += message.get("body", b"")

    await plugin_router(scope, receive, send)
    decoded_headers = {
        key.decode("latin-1"): value.decode("latin-1") for key, value in headers
    }
    return Response(content=body, status_code=status, headers=decoded_headers)
