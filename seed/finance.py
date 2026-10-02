"""Finance KPI notes + thin invoice narrative (no full ERPNext GL by default)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from seed.client import FrappeClient, FrappeError
from seed.config import A10_MARKER, ANCHORS, FINANCE_MONTHS, KPI_TARGETS

log = logging.getLogger("seed.finance")

DATA_DIR = Path(__file__).resolve().parent / "data"


def write_kpi_notes(path: Path | None = None) -> Path:
    """Persist mock-aligned finance/KPI snapshot for portals / Core to consume later."""
    path = path or (DATA_DIR / "kpi_targets.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "docs/mocks/eswasaone-institutional-portal.html",
        "marker": A10_MARKER,
        "kpis": KPI_TARGETS,
        "finance_months_szl_thousands": FINANCE_MONTHS,
        "revenue_ytd_label": "3.63M",
        "variance_note": "8% below budget",
        # TODO: wire real — ERPNext GL / Sales Invoice monthly rollup
        "gl_status": "stub",
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    log.info("Wrote KPI notes %s", path)
    return path


def ensure_invoice_anchor(client: FrappeClient) -> dict[str, Any]:
    """Ensure INV-2025-0394 narrative without requiring full CoA/Item setup.

    Prefer a tagged ToDo + optional Customer stub. Full Sales Invoice is deferred.
    # TODO: wire real — Sales Invoice INV-2025-0394 with SZL 18,500 overdue
    """
    inv = ANCHORS["invoice"]
    out: dict[str, Any] = {"invoice": inv, "mode": "narrative", "todo": None}

    if client.doctype_exists("ToDo"):
        marker = f"{A10_MARKER}:invoice:{inv}"
        found = client.get_list(
            "ToDo",
            filters=[["description", "like", f"%{marker}%"]],
            fields=["name"],
            limit=20,
        )
        desc = (
            f"<p>{marker}</p>"
            f"<p>Invoice {inv} overdue — SZL 18,500 — Swazi Textiles</p>"
            "<p># TODO: wire real ERPNext Sales Invoice + GL months Apr–Sep</p>"
        )
        if found:
            out["todo"] = found[0]["name"]
            try:
                client.set_value("ToDo", out["todo"], "description", desc)
                client.set_value("ToDo", out["todo"], "status", "Open")
            except FrappeError:
                pass
            for dup in found[1:]:
                try:
                    client.delete("ToDo", dup["name"])
                except FrappeError:
                    pass
        else:
            try:
                doc = client.insert(
                    {
                        "doctype": "ToDo",
                        "description": desc,
                        "status": "Open",
                        "priority": "High",
                        "date": "2025-09-18",
                        "allocated_to": "Administrator",
                    }
                )
                out["todo"] = doc.get("name")
            except FrappeError as exc:
                log.warning("Invoice ToDo failed: %s", exc)

        # Best-effort Customer for later GL wiring (groups may differ by ERPNext version)
        if client.doctype_exists("Customer"):
            try:
                existing = client.get_list(
                    "Customer",
                    filters={"customer_name": "Swazi Textiles"},
                    fields=["name"],
                    limit=1,
                )
                if existing:
                    out["customer"] = existing[0]["name"]
                else:
                    # TODO: wire real — Customer + Sales Invoice INV-2025-0394
                    log.info(
                        "Skipping Customer create (CoA/territory not seeded); "
                        "invoice remains narrative ToDo"
                    )
            except FrappeError as exc:
                log.warning("Customer lookup skipped: %s", exc)

    return out


def ensure_finance(client: FrappeClient) -> dict[str, Any]:
    notes = write_kpi_notes()
    invoice = ensure_invoice_anchor(client)
    return {
        "kpi_notes": str(notes),
        "months": FINANCE_MONTHS,
        "invoice": invoice,
        "revenue_ytd_szl": KPI_TARGETS["revenue_ytd_szl"],
    }
