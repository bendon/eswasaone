"""Deterministic local embeddings (no LLM key required).

Uses a hashing trick over tokens → fixed 384-d unit vector so Qdrant ingest
works offline. Swap for a real model when LLM_API_KEY / local embedder lands.
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Sequence

_TOKEN = re.compile(r"[a-z0-9]+", re.I)
EMBED_DIM = 384


def embed_text(text: str, dim: int = EMBED_DIM) -> list[float]:
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


def embed_texts(texts: Sequence[str], dim: int = EMBED_DIM) -> list[list[float]]:
    return [embed_text(t, dim=dim) for t in texts]
