"""ePing / WTO TBT connector — end-to-end fetch via public Azure Search API.

API: ``GET {EPING_API_BASE}/v1/azureSearch/getAll``
Docs: https://eping.wto.org/api/swagger (WTO ODbL / open notifications).
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Iterator
from urllib.parse import urljoin
from urllib.robotparser import RobotFileParser

import httpx

from connectors.base import FetchedRecord
from config import Settings, get_settings

logger = logging.getLogger(__name__)

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = _TAG_RE.sub(" ", value)
    return re.sub(r"\s+", " ", text).strip()


class EPingTBTConnector:
    """Fetch TBT notifications from ePing (open WTO Member notices)."""

    SOURCE_TITLE = "WTO ePing TBT"
    SOURCE_URL = "https://eping.wto.org/"
    RIGHTS = "open"  # WTO ODbL / public notifications

    def __init__(self, settings: Settings | None = None, client: httpx.Client | None = None):
        self.settings = settings or get_settings()
        self._owns_client = client is None
        self.client = client or httpx.Client(
            base_url=self.settings.eping_api_base.rstrip("/"),
            timeout=60.0,
            headers={
                "Accept": "application/json",
                "User-Agent": self.settings.eping_user_agent,
            },
            follow_redirects=True,
        )
        self._robots: RobotFileParser | None = None

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

    def __enter__(self) -> EPingTBTConnector:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def _load_robots(self) -> RobotFileParser:
        if self._robots is not None:
            return self._robots
        rp = RobotFileParser()
        robots_url = urljoin(self.SOURCE_URL, "robots.txt")
        try:
            resp = self.client.get(robots_url)
            if resp.status_code == 200 and "text" in (resp.headers.get("content-type") or ""):
                rp.parse(resp.text.splitlines())
            else:
                # No robots (404 HTML) — allow with rate limit only.
                rp.parse(["User-agent: *", "Allow: /"])
        except httpx.HTTPError as exc:
            logger.warning("robots.txt fetch failed (%s); allowing with rate limit", exc)
            rp.parse(["User-agent: *", "Allow: /"])
        self._robots = rp
        return rp

    def robots_allowed(self, path: str = "/api/v1/azureSearch/getAll") -> bool:
        rp = self._load_robots()
        return rp.can_fetch(self.settings.eping_user_agent, urljoin(self.SOURCE_URL, path))

    def fetch_page(
        self,
        *,
        page: int = 1,
        page_size: int | None = None,
        language: int = 1,
        free_text: str | None = None,
    ) -> dict[str, Any]:
        """Fetch one page of TBT notifications (DomainIds=1 / Areas=TBT)."""
        if not self.robots_allowed():
            raise PermissionError("robots.txt disallows ePing azureSearch fetch")

        params: list[tuple[str, str | int]] = [
            ("Language", language),
            ("DomainIds", 1),  # TBT
            ("Areas", "TBT"),
            ("Page", page),
            ("PageSize", page_size or self.settings.eping_page_size),
            ("SortBy", "distributionDate"),
            ("SortDirection", "desc"),
            ("ForPublic", "true"),
        ]
        if free_text:
            params.append(("FreeText", free_text))

        time.sleep(max(0.0, self.settings.eping_rate_limit_seconds))
        resp = self.client.get("/v1/azureSearch/getAll", params=params)
        resp.raise_for_status()
        return resp.json()

    def iter_notifications(
        self,
        *,
        max_pages: int | None = None,
        page_size: int | None = None,
    ) -> Iterator[FetchedRecord]:
        pages = max_pages if max_pages is not None else self.settings.eping_max_pages
        for page in range(1, pages + 1):
            payload = self.fetch_page(page=page, page_size=page_size)
            items = payload.get("items") or []
            if not items:
                break
            for item in items:
                yield self._to_record(item)
            total = int(payload.get("totalCount") or 0)
            end_row = int(payload.get("endRow") or 0)
            if end_row >= total:
                break

    def _to_record(self, item: dict[str, Any]) -> FetchedRecord:
        external_id = str(item.get("id") or item.get("documentSymbol") or "").strip()
        title = _strip_html(item.get("titlePlain") or item.get("title") or external_id)
        symbol = _strip_html(item.get("documentSymbol") or "")
        member = item.get("notifyingMember") or ""
        description = _strip_html(
            item.get("descriptionPlain") or item.get("description") or ""
        )
        products = _strip_html(
            item.get("productsFreeTextPlain") or item.get("productsFreeText") or ""
        )
        link = item.get("linkToNotification") or item.get("dolLink")
        if link and isinstance(link, str) and link.startswith("/"):
            link = urljoin(self.SOURCE_URL, link)
        elif not link and symbol:
            link = f"https://eping.wto.org/en/Search?DocumentSymbol={symbol.strip()}"

        summary_parts = [
            p
            for p in [
                f"Symbol: {symbol}" if symbol else "",
                f"Member: {member}" if member else "",
                f"Type: {item.get('notificationType') or ''}",
                f"Products: {products}" if products else "",
                description[:1200] if description else "",
            ]
            if p
        ]
        summary = "\n".join(summary_parts)
        # Persist a compact JSON raw for object store (open rights — full notice OK).
        import json

        raw_bytes = json.dumps(item, ensure_ascii=False, default=str).encode("utf-8")
        dist = item.get("distributionDate")
        fetched_at = datetime.now(timezone.utc)
        if isinstance(dist, str):
            try:
                fetched_at = datetime.fromisoformat(dist.replace("Z", "+00:00"))
            except ValueError:
                pass

        return FetchedRecord(
            external_id=external_id or symbol or title[:64],
            title=f"{symbol.strip()}: {title}" if symbol else title,
            url=link if isinstance(link, str) else None,
            jurisdiction=member or None,
            summary=summary,
            rights="open",
            fetched_at=fetched_at,
            raw=item,
            content_bytes=raw_bytes,
        )


def fetch_tbt_notifications(
    max_pages: int = 1,
    page_size: int = 20,
    settings: Settings | None = None,
) -> list[FetchedRecord]:
    """Convenience: fetch TBT notifications as a list."""
    with EPingTBTConnector(settings=settings) as conn:
        return list(conn.iter_notifications(max_pages=max_pages, page_size=page_size))
