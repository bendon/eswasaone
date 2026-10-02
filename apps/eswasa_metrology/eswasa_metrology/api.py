# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Whitelisted metrology / LIMS API — MetrologyJobSummary (OpenAPI `/metrology/jobs`).

Discoverable methods (A4 / Core):
  - eswasa_metrology.api.list_calibration_jobs(status=None, limit=20)
  - eswasa_metrology.api.get_calibration_job(job_code)
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, getdate

SMOKE_METHODS = ["list_calibration_jobs", "get_calibration_job"]


def _status_of(row: Any) -> str:
    return (getattr(row, "workflow_state", None) or "Received").strip() or "Received"


def _customer_for_instrument(instrument: str | None) -> str | None:
    if not instrument:
        return None
    return frappe.db.get_value("Instrument", instrument, "owner_customer")


def _serialize_job(row: Any, *, include_results: bool = False) -> dict[str, Any]:
    due = getattr(row, "due_on", None)
    item: dict[str, Any] = {
        "id": row.job_code or row.name,
        "instrument": row.instrument,
        "customer": _customer_for_instrument(row.instrument),
        "status": _status_of(row),
        "due_date": str(getdate(due)) if due else None,
    }
    if include_results:
        results = frappe.get_all(
            "Result",
            filters={"calibration_job": row.name},
            fields=[
                "result_id",
                "parameter",
                "measured_value",
                "unit",
                "uncertainty",
                "pass_fail",
            ],
            order_by="creation asc",
        )
        item["results"] = [
            {
                "id": r.result_id or r.name,
                "parameter": r.parameter,
                "measured_value": r.measured_value,
                "unit": r.unit,
                "uncertainty": r.uncertainty,
                "pass_fail": r.pass_fail,
            }
            for r in results
        ]
        item["test_method"] = getattr(row, "test_method", None)
        item["received_on"] = str(row.received_on) if getattr(row, "received_on", None) else None
        item["assigned_to"] = getattr(row, "assigned_to", None)
    return item


@frappe.whitelist()
def list_calibration_jobs(status: str | None = None, limit: int = 20) -> dict[str, Any]:
    """List calibration / LIMS jobs for Core `/api/metrology/jobs`."""
    if not frappe.has_permission("Calibration Job", "read"):
        frappe.throw(_("Not permitted to read Calibration Job"), frappe.PermissionError)

    filters: dict[str, Any] = {}
    if status:
        filters["workflow_state"] = status

    rows = frappe.get_all(
        "Calibration Job",
        filters=filters,
        fields=[
            "name",
            "job_code",
            "instrument",
            "due_on",
            "workflow_state",
            "received_on",
            "assigned_to",
            "test_method",
        ],
        order_by="due_on asc, modified desc",
        limit_page_length=cint(limit) or 20,
    )
    return {"items": [_serialize_job(r) for r in rows]}


@frappe.whitelist()
def get_calibration_job(job_code: str | None = None) -> dict[str, Any]:
    """Single calibration job with Result rows."""
    if not job_code:
        frappe.throw(_("job_code is required"), frappe.ValidationError)

    if not frappe.has_permission("Calibration Job", "read"):
        frappe.throw(_("Not permitted to read Calibration Job"), frappe.PermissionError)

    name = job_code
    if not frappe.db.exists("Calibration Job", name):
        name = frappe.db.get_value("Calibration Job", {"job_code": job_code}, "name")
    if not name:
        return {
            "id": job_code,
            "instrument": None,
            "customer": None,
            "status": "not_found",
            "due_date": None,
            "results": [],
        }

    row = frappe.db.get_value(
        "Calibration Job",
        name,
        [
            "name",
            "job_code",
            "instrument",
            "due_on",
            "workflow_state",
            "received_on",
            "assigned_to",
            "test_method",
        ],
        as_dict=True,
    )
    return _serialize_job(row, include_results=True)
