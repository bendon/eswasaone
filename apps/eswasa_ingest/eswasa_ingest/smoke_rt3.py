# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Live-site smoke for R-T3 curation gate.

Run:
  cd /srv/projects/eswasaone/engine/frappe-bench
  bench --site eswasaone.localhost execute eswasa_ingest.smoke_rt3.run
"""

from __future__ import annotations

from typing import Any


def run() -> dict[str, Any]:
    import frappe

    from eswasa_ingest.api import check_applicability
    from eswasa_ingest.rules import is_authoritative, needs_review

    assert needs_review("Pending Review")
    assert needs_review("needs-review")
    assert not is_authoritative("Pending Review")
    assert is_authoritative("Approved")

    # Ensure a Source exists
    source_name = "SMOKE-TBT-SOURCE"
    if not frappe.db.exists("Source", source_name):
        # Source may use hash autoname — find by title
        existing = frappe.db.get_value("Source", {"title": "Smoke TBT Source"}, "name")
        if existing:
            source_name = existing
        else:
            src = frappe.get_doc(
                {
                    "doctype": "Source",
                    "title": "Smoke TBT Source",
                    "source_type": "api",
                    "url": "https://eping.wto.org/",
                    "rights": "open",
                    "status": "Active",
                }
            )
            src.insert(ignore_permissions=True)
            source_name = src.name

    # Clean prior smoke doc by external_id
    for name in frappe.get_all(
        "Ingested Document", filters={"external_id": "SMOKE-RT3-DOC"}, pluck="name"
    ):
        for task in frappe.get_all("Curation Task", filters={"document": name}, pluck="name"):
            frappe.delete_doc("Curation Task", task, force=True, ignore_permissions=True)
        frappe.delete_doc("Ingested Document", name, force=True, ignore_permissions=True)

    doc = frappe.get_doc(
        {
            "doctype": "Ingested Document",
            "title": "Smoke RT3 Pending Review Doc",
            "source": source_name,
            "external_id": "SMOKE-RT3-DOC",
            "jurisdiction": "WTO",
            "rights": "open",
            "status": "Pending Review",
            "summary": "Must not surface publicly until Approved.",
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()

    tasks = frappe.get_all(
        "Curation Task",
        filters={"document": doc.name, "status": ("in", ["Open", "In Progress"])},
        fields=["name", "assignee", "status"],
    )
    # Public applicability must not cite Pending Review
    app_pending = check_applicability(query="Smoke RT3 Pending Review Doc")
    cites_pending = any(
        c.get("source_id") == doc.name for c in app_pending.get("citations") or []
    )

    # Approve → authoritative
    doc.status = "Approved"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    doc.reload()

    open_tasks = frappe.get_all(
        "Curation Task",
        filters={"document": doc.name, "status": ("in", ["Open", "In Progress"])},
        pluck="name",
    )
    app_approved = check_applicability(query="Smoke RT3 Pending Review Doc")
    cites_approved = any(
        c.get("source_id") == doc.name for c in app_approved.get("citations") or []
    )

    result = {
        "ok": bool(tasks) and not cites_pending and cites_approved and not open_tasks,
        "curation_tasks_created": len(tasks),
        "task": tasks[0].name if tasks else None,
        "blocked_while_pending": not cites_pending,
        "surfaced_when_approved": cites_approved,
        "tasks_closed_on_approve": len(open_tasks) == 0,
        "authoritative": is_authoritative(doc.status),
    }
    print(result)
    if not result["ok"]:
        raise AssertionError(f"R-T3 smoke failed: {result}")
    return result
