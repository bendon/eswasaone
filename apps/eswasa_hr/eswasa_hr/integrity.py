"""
Nightly employee integrity check (R-H7, brief §2.4): what each Active record still needs for routing and
self-service.

``run()`` writes the single ``HR Integrity Snapshot`` that the Overview's Record quality card reads, and raises
one ``HR Alert`` to the HR Managers on a night when the number of people with gaps goes up.

The person at the top is whoever holds ``Eswasa Executive Director`` through their User: only they may lack a
line manager. Nobody holding it is itself a gap ("No Executive Director set"); the check never guesses one.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Iterable

from eswasa_hr import settings

SNAPSHOT = "HR Integrity Snapshot"
TOP_ROLE = "Eswasa Executive Director"
RULE = "Record gaps"
MAX_ROWS = 500

# (field, label) in the order the Overview lists them. ``department`` also covers a group or disabled department.
CHECKS = (
    ("department", "No department"),
    ("department_invalid", "Department is a group or disabled"),
    ("designation", "No designation"),
    ("grade", "No grade"),
    ("holiday_list", "No holiday list"),
    ("reports_to", "No line manager"),
    ("leave_approver", "No leave approver"),
    ("user_id", "No login linked"),
)
NO_TOP = ("executive_director", "No Executive Director set")


# ---------------------------------------------------------------- pure rules


def gaps(row: dict[str, Any], top: Iterable[str] = (), departments: dict[str, dict[str, Any]] | None = None) -> list[str]:
    """The CHECKS fields this Active employee is missing. ``top`` are the Executive Director's employee names."""
    out: list[str] = []
    dept = row.get("department")
    if not dept:
        out.append("department")
    elif departments is not None:
        d = departments.get(dept)
        if d is None or int(d.get("is_group") or 0) or int(d.get("disabled") or 0):
            out.append("department_invalid")
    for f in ("designation", "grade", "holiday_list"):
        if not row.get(f):
            out.append(f)
    if not row.get("reports_to") and row.get("name") not in set(top):
        out.append("reports_to")
    for f in ("leave_approver", "user_id"):
        if not row.get(f):
            out.append(f)
    return out


def summarise(rows: Iterable[dict[str, Any]], top: Iterable[str] = (), departments: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    """Counts per gap, people with any gap, and the people themselves (capped at MAX_ROWS)."""
    top = list(top)
    by_field = {f: 0 for f, _ in CHECKS}
    people: list[dict[str, Any]] = []
    for r in rows:
        g = gaps(r, top, departments)
        for f in g:
            by_field[f] += 1
        if g:
            people.append({"employee": r.get("name"), "employee_name": r.get("employee_name"), "gaps": g})
    if not top:
        by_field[NO_TOP[0]] = 1
    return {"people": len(people), "by_field": by_field, "rows": people[:MAX_ROWS]}


def quality(counts: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Overview ``record_quality`` rows ({field, label, count}) for every gap that has a count."""
    by = (counts or {}).get("by_field") or {}
    out = [{"field": f, "label": label, "count": int(by.get(f) or 0)} for f, label in (*CHECKS, NO_TOP)]
    return [r for r in out if r["count"]]


def went_up(before: dict[str, Any] | None, after: dict[str, Any]) -> bool:
    """Alert only when more people have gaps than at the last run (the first run counts from zero)."""
    return int(after.get("people") or 0) > int((before or {}).get("people") or 0)


def alert_title(people: int, day: date) -> str:
    who = "1 employee record has" if people == 1 else f"{people} employee records have"
    return f"{who} gaps after the {day.day} {day.strftime('%b %Y')} integrity check. Fix them in the directory"


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _loads(v: Any) -> Any:
    if v in (None, ""):
        return None
    return v if isinstance(v, (dict, list)) else json.loads(v)


def top_employees() -> list[str]:
    """Active employees whose User holds the Executive Director role."""
    import frappe

    users = sorted({r.get("parent") for r in frappe.get_all("Has Role", filters={"role": TOP_ROLE, "parenttype": "User"}, fields=["parent"], limit=0)} - {None, "Administrator"})
    if not users:
        return []
    return [e.get("name") for e in frappe.get_all("Employee", filters={"user_id": ["in", users], "status": "Active"}, fields=["name"], limit=0)]


def _active_rows() -> list[dict[str, Any]]:
    """Active employees; a Company's default holiday list counts as the employee's (as workdays.holidays does)."""
    import frappe

    rows = frappe.get_all(
        "Employee",
        filters=settings.live({"status": "Active"}),
        fields=["name", "employee_name", "department", "designation", "grade", "holiday_list", "company", "reports_to", "leave_approver", "user_id"],
        limit=0,
    )
    defaults: dict[str, Any] = {}
    for r in rows:
        if not r.get("holiday_list") and r.get("company"):
            if r["company"] not in defaults:
                defaults[r["company"]] = frappe.db.get_value("Company", r["company"], "default_holiday_list")
            r["holiday_list"] = defaults[r["company"]]
    return rows


def _departments() -> dict[str, dict[str, Any]]:
    import frappe

    return {d["name"]: d for d in frappe.get_all("Department", fields=["name", "is_group", "disabled"], limit=0)}


def current() -> dict[str, Any] | None:
    """Last night's snapshot: {ran_on, counts, rows}, or None before the first run (or before migrate)."""
    import frappe

    if not frappe.db.exists("DocType", SNAPSHOT):
        return None
    doc = frappe.get_doc(SNAPSHOT)
    if not doc.get("ran_on"):
        return None
    return {"ran_on": str(doc.ran_on), "counts": _loads(doc.counts) or {}, "rows": _loads(doc.rows) or []}


def run() -> dict[str, Any]:
    """Daily (tasks.daily): recompute, overwrite the snapshot, alert the HR Managers if gaps went up."""
    import frappe
    from frappe.utils import now_datetime

    from eswasa_hr.alerts import raise_alert, recipients
    from eswasa_hr.recruitment import _hr_manager_users

    if not frappe.db.exists("DocType", SNAPSHOT):
        return {"people": 0, "raised": 0}
    day = _today()
    before = (current() or {}).get("counts")
    summary = summarise(_active_rows(), top_employees(), _departments())
    counts = {"people": summary["people"], "by_field": summary["by_field"]}
    doc = frappe.get_doc(SNAPSHOT)
    doc.ran_on = now_datetime()
    doc.counts = json.dumps(counts, sort_keys=True)
    doc.rows = json.dumps(summary["rows"])
    doc.flags.ignore_permissions = True
    doc.save()
    raised = 0
    if went_up(before, counts) and frappe.db.exists("DocType", "HR Alert"):
        raised = raise_alert(f"integrity:{day.isoformat()}", RULE, alert_title(counts["people"], day), recipients(_hr_manager_users()), day.isoformat())
    return {"people": counts["people"], "raised": raised}
