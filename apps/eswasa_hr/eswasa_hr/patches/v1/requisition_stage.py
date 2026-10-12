"""
Plan 08: Job Requisitions from before the head-of-department stage get ``custom_stage``.

A Pending one stays with HR (its HR Manager ToDos are already open); anything decided is Done. Post-model-sync
patches run before fixtures are synced, so the custom field is created here first (same definition as the
fixture). Idempotent: rows that already have a stage are left alone.
"""

from __future__ import annotations

from typing import Any

FIELD = {
    "fieldname": "custom_stage",
    "label": "Approval stage",
    "fieldtype": "Select",
    "options": "\nHead\nHR\nDone",
    "insert_after": "status",
    "read_only": 1,
    "description": "Head of department, then HR (brief §12.1). Set by EswasaOne.",
}


def updates(rows: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """(name, stage) for rows without a stage."""
    from eswasa_hr.recruitment import legacy_stage

    return [(r["name"], legacy_stage(r.get("status"))) for r in rows if not r.get("custom_stage")]


def execute() -> None:
    import frappe
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field

    if not frappe.db.exists("DocType", "Job Requisition"):
        return
    if not frappe.get_meta("Job Requisition").has_field("custom_stage"):
        create_custom_field("Job Requisition", FIELD)
        frappe.clear_cache(doctype="Job Requisition")
    rows = frappe.get_all("Job Requisition", fields=["name", "status", "custom_stage"], limit=0)
    for name, stage in updates(rows):
        frappe.db.set_value("Job Requisition", name, "custom_stage", stage, update_modified=False)
