"""RAG over Qdrant ``eswasaone_tbt_notifications`` — mock fallback."""

from __future__ import annotations

import hashlib
import logging
import math
import re
from typing import Any, Literal

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

Rights = Literal["open", "public", "licensed"]
_TOKEN = re.compile(r"[a-z0-9]+", re.I)
_EMBED_DIM = 384
_TBT_COLLECTION = "tbt_notifications"

_MOCK_CORPUS: list[dict[str, Any]] = [
    {
        "source_id": "WTO-TBT-001",
        "title": "WTO TBT Agreement, Article 2 (paraphrase)",
        "rights": "open",
        "url": "https://www.wto.org/english/docs_e/legal_e/17-tbt_e.htm",
        "excerpt": (
            "Members shall ensure technical regulations are not prepared "
            "to create unnecessary obstacles to trade."
        ),
        "buy_url": None,
        "keywords": ["tbt", "wto", "technical regulation", "trade"],
    },
    {
        "source_id": "SZ-GAZETTE-FOOD",
        "title": "Eswatini food labelling notice (gazette paraphrase)",
        "rights": "public",
        "url": None,
        "excerpt": (
            "Pre-packaged foods must carry legible labels including "
            "ingredients and net quantity."
        ),
        "buy_url": None,
        "keywords": ["food", "labelling", "label", "gazette"],
    },
    {
        "source_id": "SZNS 001",
        "title": "SZNS 001: General requirements for product labelling",
        "rights": "licensed",
        "url": "/estore/SZNS-001",
        "excerpt": None,
        "buy_url": "/estore/SZNS-001",
        "keywords": ["labelling", "label", "product", "szns", "food"],
    },
]


def _embed(text: str, dim: int = _EMBED_DIM) -> list[float]:
    """Same hashing embedder as ingest (offline, no LLM key)."""
    vec = [0.0] * dim
    tokens = _TOKEN.findall((text or "").lower())
    if not tokens:
        return vec
    for tok in tokens:
        digest = hashlib.sha256(tok.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _payload_to_hit(payload: dict[str, Any]) -> dict[str, Any]:
    rights = str(payload.get("rights") or "open").lower()
    if rights not in {"open", "public", "licensed"}:
        rights = "open"
    text = payload.get("text") or ""
    excerpt = None
    if rights != "licensed" and text:
        excerpt = text[:280] + ("…" if len(text) > 280 else "")
    return {
        "source_id": str(payload.get("external_id") or payload.get("source_id") or "unknown"),
        "title": str(payload.get("title") or "TBT notification"),
        "rights": rights,
        "url": payload.get("url"),
        "excerpt": excerpt,
        "buy_url": "/estore" if rights == "licensed" else None,
    }


async def search_sources(query: str, *, limit: int = 5) -> list[dict[str, Any]]:
    """Vector-search ``eswasaone_tbt_notifications``; fall back to scroll / mocks."""
    settings = get_settings()
    collection = f"{settings.qdrant_collection_prefix}{_TBT_COLLECTION}"
    base = settings.qdrant_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            exists = await client.get(f"{base}/collections/{collection}")
            if exists.status_code != 200:
                logger.debug("Qdrant collection %s missing", collection)
                return _keyword_search(query, limit=limit)

            vector = _embed(query)
            search = await client.post(
                f"{base}/collections/{collection}/points/search",
                json={
                    "vector": vector,
                    "limit": limit,
                    "with_payload": True,
                },
            )
            if search.status_code == 200:
                points = search.json().get("result") or []
                hits = [
                    _payload_to_hit(p.get("payload") or {})
                    for p in points
                    if p.get("payload")
                ]
                if hits:
                    return hits

            # Scroll + keyword filter when search returns nothing useful
            scroll = await client.post(
                f"{base}/collections/{collection}/points/scroll",
                json={"limit": 50, "with_payload": True, "with_vector": False},
            )
            if scroll.status_code == 200:
                points = (scroll.json().get("result") or {}).get("points") or []
                return _filter_payloads(
                    [p.get("payload") or {} for p in points],
                    query,
                    limit=limit,
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Qdrant RAG failed (%s); using mock corpus", exc)

    return _keyword_search(query, limit=limit)


def _filter_payloads(
    payloads: list[dict[str, Any]], query: str, *, limit: int
) -> list[dict[str, Any]]:
    tokens = {t.lower() for t in _TOKEN.findall(query) if len(t) > 2}
    scored: list[tuple[int, dict[str, Any]]] = []
    for payload in payloads:
        blob = " ".join(
            str(payload.get(k) or "") for k in ("title", "text", "external_id")
        ).lower()
        score = sum(1 for t in tokens if t in blob) if tokens else 1
        if score > 0:
            scored.append((score, _payload_to_hit(payload)))
    scored.sort(key=lambda x: x[0], reverse=True)
    if scored:
        return [h for _, h in scored[:limit]]
    return [_payload_to_hit(p) for p in payloads[:limit] if p]


def _keyword_search(query: str, *, limit: int) -> list[dict[str, Any]]:
    tokens = {t.lower() for t in query.split() if len(t) > 2}
    scored: list[tuple[int, dict[str, Any]]] = []
    for doc in _MOCK_CORPUS:
        score = sum(
            1 for k in doc["keywords"] if k in tokens or any(k in t for t in tokens)
        )
        if not tokens:
            score = 1
        if score > 0:
            scored.append((score, doc))
    scored.sort(key=lambda x: x[0], reverse=True)
    if not scored:
        return _MOCK_CORPUS[:limit]
    return [d for _, d in scored[:limit]]
