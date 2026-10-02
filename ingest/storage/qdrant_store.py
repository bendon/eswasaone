"""Qdrant writer — collection prefix ``eswasaone_``."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Sequence

import httpx

from enrich.embeddings import EMBED_DIM
from processing.chunking import Chunk

logger = logging.getLogger(__name__)


class QdrantStore:
    """Minimal Qdrant REST client (no hard dependency on qdrant-client at runtime)."""

    def __init__(self, url: str, collection: str, vector_size: int = EMBED_DIM):
        self.url = url.rstrip("/")
        self.collection = collection
        self.vector_size = vector_size
        self.client = httpx.Client(base_url=self.url, timeout=30.0)

    def close(self) -> None:
        self.client.close()

    def ensure_collection(self) -> str:
        resp = self.client.get(f"/collections/{self.collection}")
        if resp.status_code == 200:
            return self.collection
        create = self.client.put(
            f"/collections/{self.collection}",
            json={
                "vectors": {
                    "size": self.vector_size,
                    "distance": "Cosine",
                }
            },
        )
        create.raise_for_status()
        logger.info("Created Qdrant collection %s", self.collection)
        return self.collection

    def upsert_chunks(
        self,
        *,
        external_id: str,
        title: str,
        url: str | None,
        rights: str,
        chunks: Sequence[Chunk],
        vectors: Sequence[Sequence[float]],
        content_hash: str,
    ) -> int:
        if rights == "licensed":
            # Never store licensed full text for public retrieval corpora.
            logger.info("Skipping Qdrant upsert for licensed document %s", external_id)
            return 0
        points = []
        for chunk, vector in zip(chunks, vectors, strict=True):
            point_id = str(
                uuid.uuid5(uuid.NAMESPACE_URL, f"{self.collection}:{external_id}:{chunk.index}")
            )
            points.append(
                {
                    "id": point_id,
                    "vector": list(vector),
                    "payload": {
                        "external_id": external_id,
                        "title": title,
                        "url": url,
                        "rights": rights,
                        "chunk_index": chunk.index,
                        "text": chunk.text,
                        "content_hash": content_hash,
                        "source": "eping_tbt",
                    },
                }
            )
        if not points:
            return 0
        resp = self.client.put(
            f"/collections/{self.collection}/points",
            params={"wait": "true"},
            json={"points": points},
        )
        resp.raise_for_status()
        return len(points)

    def health(self) -> dict[str, Any]:
        try:
            r = self.client.get("/collections")
            r.raise_for_status()
            names = [c["name"] for c in r.json().get("result", {}).get("collections", [])]
            return {"ok": True, "collections": names, "target": self.collection}
        except httpx.HTTPError as exc:
            return {"ok": False, "error": str(exc), "target": self.collection}
