"""
One-shot / migrate helpers for HR master data.

Does NOT invent ESWASA departments or staff — only disables known ERPNext
install fixtures and applies HR Settings flags from the brief §1.
"""

from __future__ import annotations

import frappe

# ERPNext default leaf departments (install fixtures). Safe to disable until
# ESWASA's real tree arrives (§0.5 #1). Names may include " - {company abbr}".
_ERPNEXT_DEPT_STEMS = {
    "Accounts",
    "Marketing",
    "Sales",
    "Purchase",
    "Operations",
    "Production",
    "Dispatch",
    "Customer Service",
    "Human Resources",
    "Management",
    "Quality Management",
    "Research & Development",
    "Legal",
}


def disable_erpnext_department_fixtures(company: str | None = None) -> int:
    """Set disabled=1 on ERPNext install departments. Returns count updated."""
    filters: dict = {"is_group": 0, "disabled": 0}
    if company:
        filters["company"] = company
    rows = frappe.get_all("Department", filters=filters, fields=["name", "department_name"])
    n = 0
    for row in rows:
        stem = (row.department_name or row.name or "").split(" - ")[0].strip()
        if stem in _ERPNEXT_DEPT_STEMS:
            frappe.db.set_value("Department", row.name, "disabled", 1)
            n += 1
    return n


def apply_hr_settings() -> None:
    """Brief §1.6 — native HR Settings flags."""
    if not frappe.db.exists("DocType", "HR Settings"):
        return
    doc = frappe.get_single("HR Settings")
    updates = {
        "leave_approver_mandatory_in_leave_application": 1,
        "expense_approver_mandatory_in_expense_claim": 1,
        "prevent_self_leave_approval": 1,
        "prevent_self_expense_approval": 1,
        "restrict_backdated_leave_application": 1,
        "check_vacancies": 1,
        "emp_created_by": "Naming Series",
    }
    dirty = False
    for key, val in updates.items():
        if hasattr(doc, key) and doc.get(key) != val:
            doc.set(key, val)
            dirty = True
    if dirty:
        doc.save(ignore_permissions=True)


def after_migrate() -> None:
    apply_hr_settings()
    # Only disable fixtures when no Active employees yet (safe on greenfield).
    if frappe.db.count("Employee", {"status": "Active"}) == 0:
        disable_erpnext_department_fixtures()
