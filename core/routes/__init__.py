from fastapi import APIRouter

from core.routes import config, events, marketplace, plugin_api, plugin_assets, plugins, system

api_router = APIRouter()
api_router.include_router(plugin_assets.router)
api_router.include_router(config.router)
api_router.include_router(system.router)
api_router.include_router(events.router)
api_router.include_router(plugins.router)
api_router.include_router(marketplace.router)
api_router.include_router(plugin_api.router)
