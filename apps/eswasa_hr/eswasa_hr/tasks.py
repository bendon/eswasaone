"""R-H1…H6 scaffolds — activate once §0.5 dates and owners are set."""

from __future__ import annotations

import frappe
from frappe.utils import add_days, getdate, today


def daily() -> None:
    """Nightly HR HRMS/custom cron entrypoint."""
    rh1_probation_reviews()
    rh2_contract_end_alerts()
    rh3_authorisation_expiry_alerts()
    rh4_single_holder_alerts()
    # R-H5 / R-H6 need leave-year and appraisal-cycle config from §0.5


def rh1_probation_reviews() -> int:
    """R-H1: do-ToDo for reports_to 30 days before scheduled_confirmation_date."""
    target = add_days(today(), 30)
    rows = frappe.get_all(
        "Employee",
        filters={
            "status": "Active",
            "scheduled_confirmation_date": target,
            "final_confirmation_date": ["in", ["", None]],
        },
        fields=["name", "employee_name", "reports_to", "user_id"],
        limit=200,
    )
    n = 0
    for row in rows:
        if not row.reports_to:
            continue
        mgr_user = frappe.db.get_value("Employee", row.reports_to, "user_id")
        if not mgr_user:
            continue
        # TODO: wire real — create do-family ToDo via Approvals registry, not raw ToDo pool
        n += 1
    return n


def rh2_contract_end_alerts() -> int:
    """R-H2: alert HR Manager + line manager 60 days before contract_end_date."""
    target = add_days(today(), 60)
    return frappe.db.count(
        "Employee",
        filters={"status": "Active", "contract_end_date": target},
    )


def rh3_authorisation_expiry_alerts() -> int:
    """R-H3: alert at 60 / 30 / 7 days before Staff Authorisation.valid_to."""
    if not frappe.db.exists("DocType", "Staff Authorisation"):
        return 0
    count = 0
    for days in (60, 30, 7):
        target = add_days(today(), days)
        count += frappe.db.count(
            "Staff Authorisation",
            filters={"docstatus": 1, "valid_to": target, "status": ["in", ["Current", "Expiring"]]},
        )
    return count


def rh4_single_holder_alerts() -> int:
    """R-H4: alert when a competence has one or zero Current holders."""
    if not frappe.db.exists("DocType", "Staff Authorisation"):
        return 0
    # TODO: wire real — group by skill, alert heads of department
    return 0


def recompute_authorisation_statuses() -> int:
    """Mark Current → Expiring (≤60d) → Expired."""
    if not frappe.db.exists("DocType", "Staff Authorisation"):
        return 0
    today_d = getdate(today())
    rows = frappe.get_all(
        "Staff Authorisation",
        filters={"docstatus": 1},
        fields=["name", "valid_to", "status"],
        limit=2000,
    )
    n = 0
    for row in rows:
        end = getdate(row.valid_to) if row.valid_to else None
        if not end:
            continue
        if end < today_d:
            new = "Expired"
        elif (end - today_d).days <= 60:
            new = "Expiring"
        else:
            new = "Current"
        if new != row.status:
            frappe.db.set_value("Staff Authorisation", row.name, "status", new, update_modified=False)
            n += 1
    return n
