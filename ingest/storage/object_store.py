"""Raw object store under INGEST_OBJECT_STORE_PATH."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from processing.dedup import content_hash


class ObjectStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, digest: str, suffix: str = ".json") -> Path:
        return self.root / digest[:2] / f"{digest}{suffix}"

    def write_bytes(self, data: bytes, *, suffix: str = ".json") -> tuple[str, Path]:
        digest = content_hash(data)
        path = self.path_for(digest, suffix=suffix)
        if path.exists():
            return digest, path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return digest, path

    def write_json(self, payload: dict[str, Any]) -> tuple[str, Path]:
        data = json.dumps(payload, ensure_ascii=False, default=str, indent=2).encode("utf-8")
        return self.write_bytes(data, suffix=".json")
