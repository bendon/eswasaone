"""
Plan 02: every Active employee with a login gets a User Permission on their own Employee record.

Older records were linked without ``create_user_permission``. The new permission applies to the Employee doctype
only (``apply_to_all_doctypes = 0``) and is the person's default, so self-service forms pick their record.

A line manager is skipped: a User Permission on Employee would hide their reports, which eswasa_hr.scope lets
them see. ``scope.release_deciders`` (daily, and on Employee/Department save) gives every decider the narrowed
form instead: their own record on each Employee-linked doctype except the scoped ones. Idempotent: anyone who
already has a User Permission on their Employee record is left alone.
"""

from __future__ import annotations

from typing import Any


def missing(employees: list[dict[str, Any]], existing: set[tuple[str, str]], managers: set[str]) -> list[dict[str, Any]]:
    """The User Permissions to create. ``existing`` holds (user, employee) pairs already allowed on Employee."""
    out = []
    for e in employees:
        user, name = e.get("user_id"), e.get("name")
        if not user or not name or name in managers or (user, name) in existing:
            continue
        out.append(
            {
                "doctype": "User Permission",
                "user": user,
                "allow": "Employee",
                "for_value": name,
                "apply_to_all_doctypes": 0,
                "applicable_for": "Employee",
                "is_default": 1,
            }
        )
    return out


def execute() -> None:
    import frappe

    employees = frappe.get_all("Employee", filters={"status": "Active", "user_id": ["is", "set"]}, fields=["name", "user_id"], limit=0)
    existing = {
        (r["user"], r["for_value"])
        for r in frappe.get_all("User Permission", filters={"allow": "Employee"}, fields=["user", "for_value"], limit=0)
    }
    managers = {
        r["reports_to"]
        for r in frappe.get_all("Employee", filters={"status": "Active", "reports_to": ["is", "set"]}, fields=["reports_to"], limit=0)
    }
    for row in missing(employees, existing, managers):
        frappe.get_doc(row).insert(ignore_permissions=True)
