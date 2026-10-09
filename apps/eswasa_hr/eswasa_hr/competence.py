"""
Shared competence / impartiality guards.

Field Visit assignment and Calibration Job assignment must call these —
never a second source of truth. Brief §6.2 / §6.3.

# TODO: wire real — bridge Auditor Competence → Staff Authorisation for
certification schemes during migration.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import frappe
from frappe.utils import getdate


def _as_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return getdate(value)


def is_authorised(employee: str | None, skill: str | None, on_date: date | str | None = None) -> bool:
    """True when a submitted Staff Authorisation covers employee+skill on the date."""
    if not employee or not skill:
        return False
    day = _as_date(on_date) or date.today()
    if not frappe.db.exists("DocType", "Staff Authorisation"):
        return False
    rows = frappe.get_all(
        "Staff Authorisation",
        filters={
            "employee": employee,
            "skill": skill,
            "docstatus": 1,
            "status": ["in", ["Current", "Expiring"]],
        },
        fields=["valid_from", "valid_to", "status"],
        limit=20,
    )
    for row in rows:
        start = _as_date(row.get("valid_from"))
        end = _as_date(row.get("valid_to"))
        if start and day < start:
            continue
        if end and day > end:
            continue
        return True
    return False


def authorisation_block_reason(
    employee: str | None, skill: str | None, on_date: date | str | None = None
) -> str | None:
    """Plain-language reason when is_authorised is False, else None."""
    if not employee or not skill:
        return "Employee and competence are required."
    if is_authorised(employee, skill, on_date):
        return None
    day = _as_date(on_date) or date.today()
    if not frappe.db.exists("DocType", "Staff Authorisation"):
        return "Staff Authorisation is not installed yet."
    rows = frappe.get_all(
        "Staff Authorisation",
        filters={"employee": employee, "skill": skill},
        fields=["docstatus", "status", "valid_from", "valid_to"],
        order_by="modified desc",
        limit=5,
    )
    if not rows:
        return f"{employee} is not authorised for {skill}."
    row = rows[0]
    if int(row.get("docstatus") or 0) == 0:
        return f"{employee}'s authorisation for {skill} is still in training (not approved)."
    end = _as_date(row.get("valid_to"))
    if end and day > end:
        return (
            f"{employee}'s authorisation for {skill} expired on {end.isoformat()}. "
            "Renew it before assigning this work."
        )
    if end and day <= end:
        return (
            f"{employee}'s authorisation for {skill} expires on {end.isoformat()}, "
            "before or on the work date."
        )
    return f"{employee} is not authorised for {skill} on {day.isoformat()}."


def has_conflict(employee: str | None, customer: str | None, on_date: date | str | None = None) -> bool:
    """True when the employee has an interest in the customer within two years, or no signed declaration."""
    if not employee:
        return True
    day = _as_date(on_date) or date.today()
    year = day.year
    if not frappe.db.exists("DocType", "Impartiality Declaration"):
        return True
    decl = frappe.db.get_value(
        "Impartiality Declaration",
        {"employee": employee, "year": year, "docstatus": 1},
        ["name", "signed_on"],
        as_dict=True,
    )
    if not decl:
        return True
    if not customer:
        return False
    # Child table interests — look back two years
    if not frappe.db.exists("DocType", "Impartiality Interest"):
        return False
    interests = frappe.get_all(
        "Impartiality Interest",
        filters={"parent": decl.name, "organisation": customer},
        fields=["from_date", "to_date"],
        limit=20,
    )
    cutoff = date(day.year - 2, day.month, day.day)
    for interest in interests:
        to_d = _as_date(interest.get("to_date")) or day
        from_d = _as_date(interest.get("from_date")) or cutoff
        if to_d >= cutoff and from_d <= day:
            return True
    return False
