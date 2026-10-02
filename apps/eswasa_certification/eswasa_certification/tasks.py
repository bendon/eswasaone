"""Scheduled tasks for the certification app (R-C4…C7 + overdue audits)."""

from __future__ import annotations

import frappe
from frappe.utils import today

from eswasa_certification.rules import (
    rc4_certificate_expiry_reminders,
    rc5_surveillance_due,
    rc6_assessment_sla_sweep,
    rc7_auditor_competence_expiry,
)


def mark_overdue_audits() -> None:
    """Flip Planned/In Progress audits with due_date < today to Overdue."""
    names = frappe.get_all(
        "Audit",
        filters={
            "due_date": ("<", today()),
            "status": ("in", ["Planned", "In Progress"]),
        },
        pluck="name",
    )
    for name in names:
        frappe.db.set_value("Audit", name, "status", "Overdue", update_modified=False)


def run_daily_cert_rules() -> None:
    """Daily sweep: overdue audits + R-C4…C7."""
    mark_overdue_audits()
    try:
        rc4_certificate_expiry_reminders()
    except Exception:
        frappe.log_error(title="eswasa_certification R-C4 failed")
    try:
        rc5_surveillance_due()
    except Exception:
        frappe.log_error(title="eswasa_certification R-C5 failed")
    try:
        rc6_assessment_sla_sweep()
    except Exception:
        frappe.log_error(title="eswasa_certification R-C6 failed")
    try:
        rc7_auditor_competence_expiry()
    except Exception:
        frappe.log_error(title="eswasa_certification R-C7 failed")
