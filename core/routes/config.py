from fastapi import APIRouter, HTTPException

from core.models.api import WidgetConfigPatch
from core.models.config import SystemConfig
from core.models.layout import Layout, LayoutItem
from core.storage import config_store, layout_store

router = APIRouter(tags=["data"])


@router.get("/api/config")
async def get_config() -> SystemConfig:
    return config_store().read()


@router.put("/api/config")
async def put_config(body: SystemConfig) -> SystemConfig:
    config_store().write(body)
    return body


@router.get("/api/layout")
async def get_layout() -> list[LayoutItem]:
    return layout_store().read().root


@router.put("/api/layout")
async def put_layout(body: list[LayoutItem]) -> list[LayoutItem]:
    document = Layout.model_validate(body)
    layout_store().write(document)
    return document.root


@router.patch("/api/layout/widget")
async def patch_widget_config(body: WidgetConfigPatch) -> LayoutItem:
    store = layout_store()
    layout = store.read()
    for item in layout.root:
        if item.instance_id == body.instance_id:
            updated = item.model_copy(update={"config": body.config})
            new_root = [
                updated if row.instance_id == body.instance_id else row for row in layout.root
            ]
            store.write(Layout(new_root))
            return updated
    raise HTTPException(status_code=404, detail=f"Unknown instance_id: {body.instance_id}")
