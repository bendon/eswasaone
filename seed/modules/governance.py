"""Governance stubs — approvals queue (7) via ToDo markers."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from seed.client import FrappeClient, FrappeError
from seed.config import A10_MARKER, ANCHORS, KPI_TARGETS

log = logging.getLogger("seed.modules.governance")

_APPROVALS = [
    ("APR-001", "CERT-0042: advance to Audit Scheduled", "certification", True),
    ("APR-002", f"Invoice credit note {ANCHORS['invoice']}", "finance", False),
    ("APR-003", "Board resolution BR-2026-01 for sign-off", "governance", False),
    ("APR-004", "Purchase order PO-4412: metrology standards", "finance", True),
    ("APR-005", "Standard ballot SZNS draft: TC vote close", "standards", False),
    ("APR-006", "Surveillance visit schedule: Swazi Textiles", "certification", False),
    ("APR-007", "TBT impact assessment G/TBT/N/EU/891", "tbt", True),
]


def ensure_approvals(client: FrappeClient) -> list[str]:
    """Create Open ToDos tagged as A10 approvals (target 7)."""
    if not client.doctype_exists("ToDo"):
        return []

    ensured: list[str] = []
    existing = client.get_list(
        "ToDo",
        filters=[["description", "like", f"%{A10_MARKER}:approval:%"]],
        fields=["name", "description", "status"],
        limit=50,
    )
    by_key: dict[str, str] = {}
    for row in existing:
        desc = row.get("description") or ""
        for key, *_ in _APPROVALS:
            if f"{A10_MARKER}:approval:{key}" in desc:
                by_key[key] = row["name"]

    today = date.today()
    for i, (key, title, module, sla) in enumerate(_APPROVALS[: KPI_TARGETS["approvals_queue"]]):
        due = today + timedelta(days=(-2 if sla else 3 + i))
        desc = (
            f"<p>{A10_MARKER}:approval:{key} module={module}</p>"
            f"<p>{title}</p>"
            f"<p>due={due.isoformat()} sla_breached={str(sla).lower()}</p>"
        )
        if key in by_key:
            name = by_key[key]
            try:
                client.set_value("ToDo", name, "description", desc)
                client.set_value("ToDo", name, "status", "Open")
                client.set_value("ToDo", name, "date", due.isoformat())
            except FrappeError as exc:
                log.warning("approval refresh %s: %s", key, exc)
            ensured.append(name)
            continue
        try:
            doc = client.insert(
                {
                    "doctype": "ToDo",
                    "description": desc,
                    "status": "Open",
                    "priority": "High" if sla else "Medium",
                    "date": due.isoformat(),
                    "allocated_to": "Administrator",
                }
            )
            ensured.append(doc.get("name") or key)
        except FrappeError as exc:
            log.warning("approval insert %s: %s", key, exc)

    log.info("Approvals ensured: %s", len(ensured))
    return ensured


def ensure_board_stub(client: FrappeClient) -> str | None:
    if not client.doctype_exists("Board Pack"):
        return None
    try:
        return client.upsert(
            "Board Pack",
            "BP-2025-Q3",
            {
                "pack_code": "BP-2025-Q3",
                "title": "Q3 2025 Board Pack (demo)",
                "meeting_date": "2025-09-30",
                "agenda": f"{A10_MARKER}: governance stub for institution board rail.",
                "workflow_state": "Draft",
            },
        )
    except FrappeError as exc:
        log.warning("Board Pack stub: %s", exc)
        return None
