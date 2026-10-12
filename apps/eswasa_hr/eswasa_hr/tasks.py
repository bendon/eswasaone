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
    rh5_declarations()
    # R-H6 needs appraisal-cycle config from §0.5


def rh1_probation_reviews() -> int:
    """R-H1: a probation-review ToDo for the line manager 30 days before scheduled_confirmation_date."""
    from eswasa_hr.team import open_probation_reviews

    return open_probation_reviews()


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


def rh5_declarations() -> int:
    """R-H5: on the first day of the declaration year, a ToDo for everyone who hasn't signed."""
    from eswasa_hr.declarations import rh5_open_year

    return rh5_open_year()
