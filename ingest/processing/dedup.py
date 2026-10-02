"""Content-hash deduplication helpers."""

from __future__ import annotations

import hashlib
from pathlib import Path


def content_hash(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def already_stored(store_root: Path, digest: str) -> bool:
    """True if a raw file with this hash already exists under the object store."""
    # Layout: {root}/{prefix}/{digest}.json
    prefix = digest[:2]
    return (store_root / prefix / f"{digest}.json").exists()
