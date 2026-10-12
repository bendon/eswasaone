"""Daily HR jobs: R-H1…R-H5 and lifecycle dates. R-H6 runs with performance."""

from __future__ import annotations

import frappe
from frappe.utils import getdate, today


def daily() -> None:
    """Nightly HR HRMS/custom cron entrypoint."""
    rh1_probation_reviews()
    recompute_authorisation_statuses()  # statuses first, so R-H3/R-H4 see today's Current/Expiring
    rh2_contract_end_alerts()
    rh3_authorisation_expiry_alerts()
    rh4_single_holder_alerts()
    rh5_declarations()
    lifecycle_due()
    # R-H6 needs appraisal-cycle config from §0.5


def rh1_probation_reviews() -> int:
    """R-H1: a probation-review ToDo for the line manager 30 days before scheduled_confirmation_date."""
    from eswasa_hr.team import open_probation_reviews

    return open_probation_reviews()


def rh2_contract_end_alerts() -> int:
    """R-H2: alert HR Managers + line manager once a contract is within 60 days of contract_end_date."""
    from eswasa_hr.alerts import contract_end_alerts

    return contract_end_alerts()


def rh3_authorisation_expiry_alerts() -> int:
    """R-H3: alert the employee, line manager and HR at 60 / 30 / 7 days before Staff Authorisation.valid_to."""
    from eswasa_hr.alerts import authorisation_expiry_alerts

    return authorisation_expiry_alerts()


def rh4_single_holder_alerts() -> int:
    """R-H4: alert the department head when a competence has one or zero Current holders."""
    from eswasa_hr.alerts import thin_cover_alerts

    return thin_cover_alerts()


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


def lifecycle_due() -> tuple[int, int]:
    """Approved promotions/transfers whose date has come are submitted; last days are processed (brief §4)."""
    from eswasa_hr.lifecycle import process_last_days, submit_due_changes

    return submit_due_changes(), process_last_days()
