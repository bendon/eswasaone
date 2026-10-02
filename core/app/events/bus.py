"""Events bus — in-process fan-out to WebSocket subscribers.

Events are shaped as OpenAPI ``FeedItem`` (id, type, title, created_at, …)
so Institution ``useFeed`` / dock can consume ``/ws/feed`` directly.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any, Literal

logger = logging.getLogger(__name__)

Severity = Literal["info", "success", "warn", "critical"]


class FeedBus:
    """Simple pub/sub for `/ws/feed` and webhook producers."""

    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue[dict[str, Any]]] = []
        self._history: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()
        self._seq = 0

    async def publish(
        self,
        event_type: str,
        payload: dict[str, Any] | None = None,
        *,
        title: str | None = None,
        body: str | None = None,
        severity: Severity = "info",
        href: str | None = None,
    ) -> dict[str, Any]:
        """Publish a FeedItem-compatible event (plus optional ``payload`` extras)."""
        data = payload or {}
        resolved_title = title or str(data.get("title") or event_type)
        resolved_body = body
        if resolved_body is None:
            if "body" in data:
                resolved_body = str(data.get("body") or "")
            elif data:
                # Compact summary from known keys; avoid dumping secrets
                bits = [
                    f"{k}={data[k]}"
                    for k in (
                        "status",
                        "reference_id",
                        "doctype",
                        "name",
                        "to_role",
                        "source",
                        "reason",
                    )
                    if data.get(k) is not None
                ]
                resolved_body = "; ".join(bits) if bits else None

        async with self._lock:
            self._seq += 1
            seq = self._seq
            event: dict[str, Any] = {
                "id": f"evt-{seq}",
                "type": event_type,
                "title": resolved_title,
                "body": resolved_body,
                "severity": severity,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            if href or data.get("href"):
                event["href"] = href or data.get("href")
            if data:
                event["payload"] = data
            self._history.append(event)
            if len(self._history) > 200:
                self._history = self._history[-200:]
            subs = list(self._subscribers)

        for q in subs:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("Dropping feed event for slow subscriber")
        return event

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[dict[str, Any]]) -> None:
        if q in self._subscribers:
            self._subscribers.remove(q)

    def recent(self, limit: int = 20) -> list[dict[str, Any]]:
        return self._history[-limit:]

    def clear(self) -> None:
        """Test helper — wipe history/subscribers."""
        self._history.clear()
        self._subscribers.clear()
        self._seq = 0


_bus: FeedBus | None = None


def get_feed_bus() -> FeedBus:
    global _bus
    if _bus is None:
        _bus = FeedBus()
    return _bus


def reset_feed_bus() -> FeedBus:
    """Replace the process-wide bus (tests)."""
    global _bus
    _bus = FeedBus()
    return _bus


async def iter_feed(bus: FeedBus | None = None) -> AsyncIterator[dict[str, Any]]:
    feed = bus or get_feed_bus()
    q = feed.subscribe()
    try:
        while True:
            event = await q.get()
            yield event
    finally:
        feed.unsubscribe(q)
