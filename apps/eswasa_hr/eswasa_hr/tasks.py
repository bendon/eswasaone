"""Daily HR jobs: R-H7 integrity first, then R-H1…R-H6, R-L1 leave escalation, recruitment reminders and lifecycle dates."""

from __future__ import annotations

import frappe
from frappe.utils import getdate, today


def daily() -> None:
    """Nightly HR HRMS/custom cron entrypoint."""
    rh7_integrity()  # first, so the later steps run on a known picture of the records
    release_deciders()  # managers and approvers can read what they decide (imports set reports_to without hooks)
    rh1_probation_reviews()
    recompute_authorisation_statuses()  # statuses first, so R-H3/R-H4 see today's Current/Expiring
    rh2_contract_end_alerts()
    rh3_authorisation_expiry_alerts()
    rh4_single_holder_alerts()
    rh5_declarations()
    rh5_late_declarations()
    lifecycle_due()
    rh6_appraisal_reminders()
    rl1_leave_escalation()
    expense_escalation()
    recruitment_reminders()
    document_expiry_alerts()


def release_deciders() -> int:
    """Plan 02 follow-up: narrow each decider's own-record User Permission (eswasa_hr.scope.release_deciders)."""
    from eswasa_hr.scope import release_deciders as run

    return run()


def rh7_integrity() -> dict:
    """R-H7: the nightly employee integrity check; writes the snapshot the Overview reads."""
    from eswasa_hr.integrity import run

    return run()


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


def rh6_appraisal_reminders() -> int:
    """R-H6: remind anyone with an open appraisal step 10 and 3 working days before the cycle end date."""
    from eswasa_hr.performance import rh6_reminders

    return rh6_reminders()


def rh5_declarations() -> int:
    """R-H5: on the first day of the declaration year, a ToDo for everyone who hasn't signed."""
    from eswasa_hr.declarations import rh5_open_year

    return rh5_open_year()


def rh5_late_declarations() -> int:
    """R-H5 (provisional 10 days): an unsigned declaration reaches the line manager, once."""
    from eswasa_hr.declarations import rh5_escalate

    return rh5_escalate()


def lifecycle_due() -> tuple[int, int]:
    """Approved promotions/transfers whose date has come are submitted; last days are processed (brief §4)."""
    from eswasa_hr.lifecycle import process_last_days, submit_due_changes

    return submit_due_changes(), process_last_days()


def rl1_leave_escalation() -> int:
    """R-L1 (provisional): an Open leave request past its 2-working-day SLA goes to the named HR Managers, once."""
    from eswasa_hr.leave import escalate_overdue

    return escalate_overdue()


def expense_escalation() -> int:
    """Plan 05 (provisional): a Draft expense claim past its 3-working-day SLA alerts the named Accounts Managers, once."""
    from eswasa_hr.expenses import escalate_overdue

    return escalate_overdue()


def recruitment_reminders() -> int:
    """Interview feedback 1 working day late, and offers unanswered after 5 working days (provisional)."""
    from eswasa_hr.hiring import remind_due

    return remind_due()


def document_expiry_alerts() -> int:
    """Plan 06: employee documents at their alert days before expiry, and on the day they expire."""
    from eswasa_hr.documents import expiry_alerts

    return expiry_alerts()
