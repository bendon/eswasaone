"""Whitelisted applicability API — shape matches OpenAPI ApplicabilityResult."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _


def _mock_applicability(
    query: str,
    jurisdiction: str | None = None,
    sector: str | None = None,
    hs_code: str | None = None,
) -> dict[str, Any]:
    """Contract-shaped guided steps when corpus lookup is empty / Frappe-only."""
    where = jurisdiction or "Eswatini"
    sector_label = sector or "general goods"
    hs = f" (HS {hs_code})" if hs_code else ""
    return {
        "summary": (
            f"Preliminary applicability guidance for “{query}” in {where} "
            f"covering {sector_label}{hs}. Confirm against curated sources "
            "before relying on this for compliance decisions."
        ),
        "steps": [
            {
                "order": 1,
                "title": "Identify the product and HS code",
                "detail": (
                    "Map the product to an HS heading and note any "
                    "ICS classifications used in TBT notifications."
                ),
                "href": "https://eping.wto.org/en/Search",
            },
            {
                "order": 2,
                "title": "Search WTO/TBT notifications (ePing)",
                "detail": (
                    "Review open TBT notifications that may affect export "
                    "markets; paraphrase-and-cite licensed standards via the e-store."
                ),
                "href": "https://eping.wto.org/en/Search?domainIds=1",
            },
            {
                "order": 3,
                "title": "Check national gazette / ESWASA requirements",
                "detail": (
                    "Confirm whether a national standard or technical regulation "
                    "applies; route licensed full text through the e-store."
                ),
            },
            {
                "order": 4,
                "title": "Queue curation if uncertain",
                "detail": (
                    "Raise a Curation Task so an Ingest Curator can attach "
                    "Market Requirements and Requirement Links."
                ),
            },
        ],
        "citations": [
            {
                "source_id": "eping-tbt",
                "title": "WTO ePing SPS & TBT Platform",
                "rights": "open",
                "url": "https://eping.wto.org/",
                "excerpt": (
                    "Open WTO Member TBT/SPS notifications and trade concerns."
                ),
            }
        ],
        "buy_links": [],
    }


def _citations_from_documents(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = []
    for doc in docs:
        rights = (doc.get("rights") or "public").lower()
        excerpt = doc.get("summary") or ""
        # Never emit licensed full text in a free answer.
        if rights == "licensed":
            excerpt = _(
                "Licensed content — paraphrase only; purchase via e-store."
            )
        elif len(excerpt) > 280:
            excerpt = excerpt[:277] + "…"
        citations.append(
            {
                "source_id": doc.get("name") or doc.get("external_id") or "unknown",
                "title": doc.get("title") or "Ingested Document",
                "rights": rights if rights in {"open", "public", "licensed"} else "public",
                "url": doc.get("document_url") or None,
                "excerpt": excerpt or None,
            }
        )
    return citations


@frappe.whitelist()
def check_applicability(
    query: str,
    jurisdiction: str | None = None,
    sector: str | None = None,
    hs_code: str | None = None,
) -> dict[str, Any]:
    """Return ApplicabilityResult — permissions inherited from session user."""
    if not query or not str(query).strip():
        frappe.throw(_("query is required"), frappe.ValidationError)

    # Permission gate: must be able to read Ingested Document (or Source).
    if not (
        frappe.has_permission("Ingested Document", "read")
        or frappe.has_permission("Source", "read")
    ):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    filters: dict[str, Any] = {"status": "Approved"}  # R-T3: authoritative only
    if jurisdiction:
        filters["jurisdiction"] = ["like", f"%{jurisdiction}%"]

    or_filters = []
    q = str(query).strip()
    or_filters.append(["title", "like", f"%{q}%"])
    or_filters.append(["summary", "like", f"%{q}%"])
    if sector:
        or_filters.append(["summary", "like", f"%{sector}%"])
    if hs_code:
        or_filters.append(["summary", "like", f"%{hs_code}%"])

    docs: list[dict[str, Any]] = []
    try:
        docs = frappe.get_all(
            "Ingested Document",
            filters=filters,
            or_filters=or_filters,
            fields=[
                "name",
                "title",
                "external_id",
                "document_url",
                "rights",
                "summary",
                "jurisdiction",
            ],
            limit_page_length=5,
            order_by="fetched_at desc",
        )
    except Exception:
        # DocType may not be migrated yet — fall back to mock.
        docs = []

    result = _mock_applicability(q, jurisdiction, sector, hs_code)
    if docs:
        result["citations"] = _citations_from_documents(docs)
        result["summary"] = (
            f"Found {len(docs)} ingested document(s) related to “{q}”. "
            + result["summary"]
        )
        # Surface buy links for any licensed hits.
        for doc in docs:
            if (doc.get("rights") or "").lower() == "licensed":
                result.setdefault("buy_links", []).append(
                    {
                        "standard_code": doc.get("external_id") or doc.get("name"),
                        "title": doc.get("title"),
                        "url": "/estore",  # TODO: wire real e-store deep link
                    }
                )
    return result


@frappe.whitelist()
def list_curation_queue(status: str | None = "Open", limit: int = 50) -> list[dict[str, Any]]:
    """Curation review queue for Ingest Curators."""
    if not frappe.has_permission("Curation Task", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    limit = min(int(limit or 50), 200)
    filters: dict[str, Any] = {}
    if status:
        filters["status"] = status

    return frappe.get_all(
        "Curation Task",
        filters=filters,
        fields=[
            "name",
            "title",
            "document",
            "task_type",
            "priority",
            "status",
            "assignee",
            "modified",
        ],
        order_by="priority desc, modified desc",
        limit_page_length=limit,
    )
