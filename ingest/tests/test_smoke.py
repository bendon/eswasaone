"""Smoke tests for ePing/TBT connector + pipeline pieces."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from connectors.eping_tbt import EPingTBTConnector, fetch_tbt_notifications
from enrich.embeddings import EMBED_DIM, embed_text
from processing.chunking import chunk_text
from processing.dedup import content_hash
from storage.object_store import ObjectStore
from storage.qdrant_store import QdrantStore


def test_embed_dim() -> None:
    v = embed_text("TBT notification carbon dioxide beverage")
    assert len(v) == EMBED_DIM
    assert abs(sum(x * x for x in v) - 1.0) < 1e-6


def test_chunk_and_hash() -> None:
    chunks = chunk_text("word " * 500, size=100, overlap=20)
    assert len(chunks) > 1
    assert content_hash(b"abc") == content_hash("abc")


def test_object_store_dedup(tmp_path: Path) -> None:
    store = ObjectStore(tmp_path)
    d1, p1 = store.write_bytes(b'{"a":1}')
    d2, p2 = store.write_bytes(b'{"a":1}')
    assert d1 == d2
    assert p1 == p2
    assert p1.exists()


@pytest.mark.integration
def test_eping_fetch_live() -> None:
    records = fetch_tbt_notifications(max_pages=1, page_size=3)
    assert len(records) >= 1
    assert records[0].rights == "open"
    assert records[0].external_id
    assert records[0].content_bytes
    raw = json.loads(records[0].content_bytes.decode("utf-8"))
    assert raw.get("area") == "TBT"


@pytest.mark.integration
def test_qdrant_collection(tmp_path: Path) -> None:
    from config import get_settings

    settings = get_settings()
    store = QdrantStore(settings.qdrant_url, settings.tbt_collection)
    try:
        name = store.ensure_collection()
        assert name.startswith("eswasaone_")
        health = store.health()
        assert health["ok"]
        assert name in health["collections"]
    finally:
        store.close()


@pytest.mark.integration
def test_robots_check() -> None:
    with EPingTBTConnector() as conn:
        # Missing robots → allow; if robots present, path should still be allowed for public API.
        assert isinstance(conn.robots_allowed(), bool)
