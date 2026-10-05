"""Content routes — /api/content/*.

Public-facing content endpoints (no auth required). Currently provides
latest updates / announcements for the service-portal landing page.

TODO: wire real — fetch from Frappe Update / Announcement doctype when it exists.
"""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["content"])


class UpdateItem(BaseModel):
    """A single update / announcement card for the landing page."""

    id: str
    title: str
    summary: str
    tag: str  # "new" | "review" | "published" | "notice"
    date: str  # ISO date string
    href: str
    foot_icon: str  # icon name from shared-ui sprite
    foot_label: str


# TODO: wire real — replace fixtures with Frappe Update doctype query.
# Per AGENTS.md rule 3 (stubs over blocking), these seeded fixtures keep
# the landing page functional until the Frappe doctype is created.
_SEED_UPDATES: list[UpdateItem] = [
    UpdateItem(
        id="szns-ai-003-review",
        title="SZNS AI 003: Training data quality and provenance",
        summary=(
            "The third AI standard is open for public comment until 26 October 2026. "
            "It covers dataset provenance, labelling, consent, and bias documentation."
        ),
        tag="review",
        date="2026-09-22",
        href="/ai-tech/standards/szns-ai-003",
        foot_icon="i-clock",
        foot_label="34 days remaining",
    ),
    UpdateItem(
        id="ai-lab-opening",
        title="AI & Technology Testing Lab opens in Mbabane",
        summary=(
            "ESWASA's newest laboratory is now accepting AI fairness audits, software "
            "conformity tests and cybersecurity assessments. First cohort is free "
            "for registered MSMEs."
        ),
        tag="new",
        date="2026-09-18",
        href="/ai-tech/lab",
        foot_icon="i-flask",
        foot_label="Read announcement",
    ),
    UpdateItem(
        id="szns-1043-published",
        title="SZNS 1043:2026 Processed fruit and vegetable products",
        summary=(
            "Updated specification for locally processed fruit and vegetable products, "
            "harmonised with the SADC regional standard. Available now in the e-store."
        ),
        tag="published",
        date="2026-09-12",
        href="/standards/SZNS-1043",
        foot_icon="i-book",
        foot_label="Browse standard",
    ),
]


@router.get("/updates", response_model=list[UpdateItem])
async def list_updates(
    limit: int = Query(default=6, ge=1, le=20),
) -> list[UpdateItem]:
    """Return the latest published updates for the landing page.

    TODO: wire real — query Frappe Update doctype, filter by status=published,
    order by publish_date desc. Fall back to seed fixtures when none exist.
    """
    # For now, return seed data sliced by limit.
    # When Frappe is wired: fetch from doctype, merge with seeds if empty.
    return _SEED_UPDATES[:limit]


@router.get("/updates/{update_id}", response_model=UpdateItem)
async def get_update(update_id: str) -> UpdateItem:
    """Return a single update by ID.

    TODO: wire real — fetch from Frappe by doctype name.
    """
    for item in _SEED_UPDATES:
        if item.id == update_id:
            return item
    from fastapi import HTTPException

    raise HTTPException(status_code=404, detail="Update not found")