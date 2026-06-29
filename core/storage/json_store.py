"""Atomic JSON persistence with Pydantic validation."""

from __future__ import annotations

import json
import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, RootModel, ValidationError

T = TypeVar("T", bound=BaseModel)


class JsonStoreError(Exception):
    """Raised when a JSON document cannot be read or written."""


class JsonStore[T: BaseModel]:
    """Read/write a single JSON file validated by a Pydantic model."""

    def __init__(
        self,
        path: Path,
        model: type[T],
        default_factory: Callable[[], T],
    ) -> None:
        self.path = path
        self.model = model
        self.default_factory = default_factory

    def read(self) -> T:
        if not self.path.is_file():
            return self.default_factory()
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise JsonStoreError(f"Invalid JSON in {self.path}") from exc
        try:
            return self.model.model_validate(raw)
        except ValidationError as exc:
            raise JsonStoreError(f"Validation failed for {self.path}") from exc

    def write(self, document: T) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = document.model_dump(mode="json", by_alias=True)
        encoded = json.dumps(payload, indent=2) + "\n"

        fd, tmp_name = tempfile.mkstemp(dir=self.path.parent, prefix=f".{self.path.name}.", suffix=".tmp")
        tmp_path = Path(tmp_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            tmp_path.replace(self.path)
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise