"""
One-shot / migrate helpers for HR master data.

Does NOT invent ESWASA departments or staff — only disables known ERPNext
install fixtures and applies HR Settings flags from the brief §1.
"""

from __future__ import annotations

import frappe

from eswasa_hr.sensitive import apply_field_levels  # J12: Employee field levels in Desk

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


HR_SETTINGS_FLAG = "eswasa_hr_settings_applied_v1"


def apply_hr_settings() -> None:
    """Brief §1.6: native HR Settings flags, set once per site so HR's later changes in HR Settings stay."""
    if not frappe.db.exists("DocType", "HR Settings") or frappe.db.get_default(HR_SETTINGS_FLAG):
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
    frappe.db.set_default(HR_SETTINGS_FLAG, "1")


CASE_DOCTYPES = ("Employee Grievance", "Disciplinary Case")


def keep_cases_out_of_search() -> int:
    """Brief §10: cases never appear in global search. Removes them from Global Search Settings if listed."""
    if not frappe.db.exists("DocType", "Global Search DocType"):
        return 0
    n = 0
    for row in frappe.get_all("Global Search DocType", filters={"document_type": ["in", list(CASE_DOCTYPES)]}, fields=["name"]):
        frappe.db.delete("Global Search DocType", {"name": row.name})
        n += 1
    for dt in CASE_DOCTYPES:
        if frappe.db.exists("DocType", dt):
            frappe.db.delete("__global_search", {"doctype": dt})
    return n


def load_master_data(path: str, dry_run: bool = False) -> dict:
    """Plan 09: load ESWASA's signed-off master-data JSON (see eswasa_hr.master_data_load). Refuses the example file.

    bench --site <site> execute eswasa_hr.setup.load_master_data --kwargs '{"path": "...", "dry_run": true}'
    """
    import json

    from eswasa_hr.master_data_load import load

    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    out = load(data, dry_run=dry_run)
    if not dry_run and out["ok"]:
        frappe.db.commit()
    return out


def after_migrate() -> None:
    from eswasa_hr.seed_records import seed_once

    apply_hr_settings()
    seed_once()
    keep_cases_out_of_search()
    apply_field_levels()
    # Only disable fixtures when no Active employees yet (safe on greenfield).
    if frappe.db.count("Employee", {"status": "Active"}) == 0:
        disable_erpnext_department_fixtures()
