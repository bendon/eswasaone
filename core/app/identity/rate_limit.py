"""In-memory rate limit stub for /auth/* routes."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status

_LOCK = Lock()
_HITS: dict[str, list[float]] = defaultdict(list)

# Stub limits — tighten via Redis later
WINDOW_SECONDS = 60
MAX_HITS = 120


def reset_auth_rate_limit() -> None:
    with _LOCK:
        _HITS.clear()


def check_auth_rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    key = f"auth:{ip}"
    now = time.time()
    with _LOCK:
        bucket = [t for t in _HITS[key] if now - t < WINDOW_SECONDS]
        if len(bucket) >= MAX_HITS:
            _HITS[key] = bucket
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many auth attempts — try again shortly",
            )
        bucket.append(now)
        _HITS[key] = bucket
