"""WTO / TBT ingest helpers shaped for ``eswasa_tbt`` and ingest handoff.

Open-source notifications (ePing / WTO TBT) carry ``rights=open``. Real fetch
lives in WS8 connectors; this adapter normalizes payloads and builds a typed
handoff so the Core events bus can fan out without waiting on Frappe DocTypes.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

RightsFlag = Literal["open", "public", "licensed"]
TbtSource = Literal["eping", "wto_tbt", "manual"]


class TbtNotification(BaseModel):
    """One TBT / ePing notification ready for tagging & notify."""

    notification_id: str
    title: str
    country: str | None = None
    hs_codes: list[str] = Field(default_factory=list)
    products: list[str] = Field(default_factory=list)
    sectors: list[str] = Field(default_factory=list)
    published_at: datetime | None = None
    url: str | None = None
    summary: str | None = None
    rights: RightsFlag = "open"
    source: TbtSource = "eping"
    raw: dict[str, Any] = Field(default_factory=dict)


class TbtHandoffPayload(BaseModel):
    """Batch payload for ``eswasa_tbt`` / ``eswasa_ingest`` consumption."""

    source: TbtSource = "eping"
    notifications: list[TbtNotification]
    ingested_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    target_doctype: str = "TBT Notification"
    rights: RightsFlag = "open"


class TbtHandoffResult(BaseModel):
    """Outcome of attempting a handoff (live HTTP or stub)."""

    accepted: int
    stubbed: bool = False
    detail: str | None = None
    payload: TbtHandoffPayload | None = None


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        parts = [p.strip() for p in value.replace(";", ",").split(",")]
        return [p for p in parts if p]
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return [str(v).strip() for v in value if str(v).strip()]
    return [str(value)]


def _parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    text = str(value).strip()
    if not text:
        return None
    # Support trailing Z
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def normalize_eping_item(raw: Mapping[str, Any], *, source: TbtSource = "eping") -> TbtNotification:
    """Map a raw ePing / WTO item (or stub dict) into :class:`TbtNotification`.

    >>> n = normalize_eping_item({"id": "TBT/SZL/1", "title": "Labeling", "country": "SZL"})
    >>> n.notification_id, n.rights
    ('TBT/SZL/1', 'open')
    """
    data = dict(raw)
    nid = str(
        data.get("notification_id")
        or data.get("id")
        or data.get("documentSymbol")
        or data.get("document_symbol")
        or ""
    )
    title = str(data.get("title") or data.get("description") or nid or "Untitled TBT notice")
    url_val = data.get("url") or data.get("link")
    return TbtNotification(
        notification_id=nid or f"tbt-{hash(title) & 0xFFFFFFFF:x}",
        title=title,
        country=_opt_str(data.get("country") or data.get("member") or data.get("notifyingMember")),
        hs_codes=_as_list(data.get("hs_codes") or data.get("hsCodes") or data.get("ics")),
        products=_as_list(
            data.get("products") or data.get("productCovered") or data.get("productsCovered")
        ),
        sectors=_as_list(data.get("sectors") or data.get("sector") or data.get("tags")),
        published_at=_parse_dt(
            data.get("published_at") or data.get("distributionDate") or data.get("date")
        ),
        url=str(url_val) if url_val else None,
        summary=_opt_str(data.get("summary") or data.get("abstract") or data.get("description")),
        rights="open",
        source=source,
        raw=data,
    )


def build_handoff(
    items: Sequence[Mapping[str, Any] | TbtNotification],
    *,
    source: TbtSource = "eping",
) -> TbtHandoffPayload:
    """Build a handoff batch from raw dicts and/or already-normalized models."""
    notifications: list[TbtNotification] = []
    for item in items:
        if isinstance(item, TbtNotification):
            notifications.append(item)
        else:
            notifications.append(normalize_eping_item(item, source=source))
    return TbtHandoffPayload(source=source, notifications=notifications)


def mock_recent_notifications(*, limit: int = 3) -> list[TbtNotification]:
    """Deterministic sandbox fixtures when no live ePing credentials exist."""
    samples = [
        {
            "id": "G/TBT/N/SWZ/12",
            "title": "Draft technical regulation on packaged drinking water labelling",
            "country": "SWZ",
            "hsCodes": ["2201", "2202"],
            "sectors": ["food", "labelling"],
            "distributionDate": "2026-01-15T00:00:00Z",
            "url": "https://epingalert.org/",
            "summary": "Open WTO/TBT notice — paraphrase only; cite source.",
        },
        {
            "id": "G/TBT/N/ZAF/280",
            "title": "Electrotechnical products — safety marking requirements",
            "country": "ZAF",
            "hsCodes": ["8501"],
            "sectors": ["electrotechnical"],
            "distributionDate": "2026-02-01T00:00:00Z",
            "url": "https://epingalert.org/",
        },
        {
            "id": "G/TBT/N/KEN/145",
            "title": "Cosmetics — ingredient disclosure",
            "country": "KEN",
            "products": ["cosmetics"],
            "sectors": ["chemicals"],
            "distributionDate": "2026-03-10T00:00:00Z",
        },
    ]
    return [normalize_eping_item(s) for s in samples[: max(0, limit)]]


class TbtAdapter:
    """Normalize + hand off TBT alerts. Live HTTP optional via ``TBT_HANDOFF_URL``."""

    def __init__(self, *, handoff_url: str | None = None):
        self.handoff_url = (
            handoff_url if handoff_url is not None else os.getenv("TBT_HANDOFF_URL", "")
        ).strip()

    def normalize_many(
        self, items: Sequence[Mapping[str, Any]], *, source: TbtSource = "eping"
    ) -> list[TbtNotification]:
        return [normalize_eping_item(i, source=source) for i in items]

    async def handoff(
        self,
        payload: TbtHandoffPayload,
        *,
        http_post: Any | None = None,
    ) -> TbtHandoffResult:
        """Deliver a handoff batch.

        Without ``TBT_HANDOFF_URL``, returns a stub acceptance (log + typed result)
        so WS4 can proceed before WS3/WS8 endpoints exist.

        ``http_post`` is an optional async callable ``(url, json) -> None`` for tests.
        """
        if not self.handoff_url:
            logger.info(
                "TBT handoff stubbed: %s notification(s) source=%s",
                len(payload.notifications),
                payload.source,
            )
            return TbtHandoffResult(
                accepted=len(payload.notifications),
                stubbed=True,
                detail="TBT_HANDOFF_URL empty — stubbed handoff for eswasa_tbt/ingest",
                payload=payload,
            )

        body = payload.model_dump(mode="json")
        if http_post is not None:
            await http_post(self.handoff_url, body)
        else:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(self.handoff_url, json=body)
                resp.raise_for_status()

        return TbtHandoffResult(
            accepted=len(payload.notifications),
            stubbed=False,
            detail="Handoff POSTed",
            payload=payload,
        )


def _opt_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


# Convenience for events bus


def ingest_normalize(raw_items: Sequence[Mapping[str, Any]]) -> TbtHandoffPayload:
    """Events-bus entry: raw connector items → handoff payload."""
    return build_handoff(raw_items)


async def handoff_notifications(
    items: Sequence[Mapping[str, Any] | TbtNotification],
    *,
    source: TbtSource = "eping",
) -> TbtHandoffResult:
    payload = build_handoff(items, source=source)
    return await TbtAdapter().handoff(payload)
