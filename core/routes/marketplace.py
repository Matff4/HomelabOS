from fastapi import APIRouter

from core.models.marketplace import MarketplaceCatalog
from core.services.marketplace import fetch_marketplace_catalog, resolve_marketplace_url
from core.storage import config_store

router = APIRouter(tags=["marketplace"])


@router.get("/api/marketplace/catalog")
async def marketplace_catalog() -> MarketplaceCatalog:
    config = config_store().read()
    url = resolve_marketplace_url(
        str(config.marketplaceUrl) if config.marketplaceUrl else None
    )
    return fetch_marketplace_catalog(url)
