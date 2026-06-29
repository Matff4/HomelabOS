from fastapi import APIRouter

from core.routes import config, events, plugins, system

api_router = APIRouter()
api_router.include_router(config.router)
api_router.include_router(system.router)
api_router.include_router(events.router)
api_router.include_router(plugins.router)
