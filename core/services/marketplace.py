"""Fetch and validate marketplace catalog JSON."""

from __future__ import annotations

import json
import logging
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import url2pathname, urlopen

from fastapi import HTTPException
from pydantic import ValidationError

from core.constants import DEFAULT_MARKETPLACE_URL
from core.models.marketplace import MarketplaceCatalog

logger = logging.getLogger(__name__)


def resolve_marketplace_url(configured: str | None) -> str:
    if configured:
        return configured
    return DEFAULT_MARKETPLACE_URL


def fetch_marketplace_catalog(url: str) -> MarketplaceCatalog:
    try:
        payload = _download(url)
    except OSError as exc:
        logger.warning("Marketplace fetch failed for %s: %s", url, exc)
        raise HTTPException(status_code=502, detail=f"Failed to fetch marketplace catalog: {exc}") from exc

    try:
        raw = json.loads(payload)
        return MarketplaceCatalog.model_validate(raw)
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.warning("Invalid marketplace catalog from %s: %s", url, exc)
        raise HTTPException(status_code=502, detail="Marketplace catalog is invalid") from exc


def _download(url: str) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme == "file":
        path = url2pathname(parsed.path)
        with open(path, "rb") as handle:
            return handle.read()

    if parsed.scheme not in ("http", "https"):
        raise OSError(f"Unsupported URL scheme: {parsed.scheme or '(none)'}")

    with urlopen(url, timeout=30) as response:
        return response.read()
