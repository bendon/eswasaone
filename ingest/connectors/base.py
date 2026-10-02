"""Shared connector types."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

Rights = Literal["open", "public", "licensed"]


class FetchedRecord(BaseModel):
    """Normalized record produced by a connector."""

    external_id: str
    title: str
    url: str | None = None
    jurisdiction: str | None = None
    summary: str = ""
    rights: Rights = "open"
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    raw: dict[str, Any] = Field(default_factory=dict)
    content_bytes: bytes = b""

    model_config = {"arbitrary_types_allowed": True}
