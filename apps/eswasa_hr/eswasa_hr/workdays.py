"""
Working days for HR deadlines: Monday to Friday, skipping the employee's public holidays.

One helper for every HR SLA: the leave decision date (slice 1, R-L1) and the appraisal reminders (R-H6).
The holidays come from HRMS: the employee's own ``holiday_list``, else the Company's ``default_holiday_list``.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable


# ---------------------------------------------------------------- pure rules


def is_working_day(d: date, holidays: Iterable[date] = ()) -> bool:
    return d.weekday() < 5 and d not in set(holidays)


def add_working_days(start: date, days: int, holidays: Iterable[date] = frozenset()) -> date:
    """The date ``days`` working days after ``start``."""
    off = set(holidays)
    d, left = start, days
    while left > 0:
        d += timedelta(days=1)
        if d.weekday() < 5 and d not in off:
            left -= 1
    return d


def working_days_before(end: date, n: int, holidays: Iterable[date] = ()) -> date:
    """The date ``n`` working days before ``end``."""
    off = set(holidays)
    d, left = end, n
    while left > 0:
        d -= timedelta(days=1)
        if d.weekday() < 5 and d not in off:
            left -= 1
    return d


# ---------------------------------------------------------------- Frappe glue


def _as_date(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def holiday_list(employee: str | None = None, company: str | None = None) -> str | None:
    """The employee's Holiday List, else their (or the given) Company's default."""
    import frappe

    if employee:
        row = frappe.db.get_value("Employee", employee, ["holiday_list", "company"], as_dict=True) or {}
        if row.get("holiday_list"):
            return row["holiday_list"]
        company = company or row.get("company")
    if not company:
        company = frappe.db.get_single_value("Global Defaults", "default_company")
    return frappe.db.get_value("Company", company, "default_holiday_list") if company else None


def holidays(employee: str | None = None, company: str | None = None) -> set[date]:
    """Holiday dates (weekly offs included) of the employee's or the Company's Holiday List; empty when none is set."""
    import frappe

    name = holiday_list(employee, company)
    if not name:
        return set()
    rows = frappe.get_all("Holiday", filters={"parent": name, "parenttype": "Holiday List"}, fields=["holiday_date"], limit=0)
    return {d for d in (_as_date(r.get("holiday_date")) for r in rows) if d}
