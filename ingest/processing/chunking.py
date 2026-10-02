"""Simple text chunking for embedding / Qdrant upsert."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    index: int
    text: str


def chunk_text(text: str, *, size: int = 800, overlap: int = 100) -> list[Chunk]:
    cleaned = " ".join((text or "").split())
    if not cleaned:
        return []
    if len(cleaned) <= size:
        return [Chunk(index=0, text=cleaned)]

    chunks: list[Chunk] = []
    start = 0
    idx = 0
    while start < len(cleaned):
        end = min(len(cleaned), start + size)
        chunks.append(Chunk(index=idx, text=cleaned[start:end]))
        if end >= len(cleaned):
            break
        start = max(0, end - overlap)
        idx += 1
    return chunks
