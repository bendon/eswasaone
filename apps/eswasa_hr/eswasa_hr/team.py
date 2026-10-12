"""
My team (brief §4, §11.2; screens T1–T4): line managers see their direct and indirect reports.

Frappe permission hooks can only narrow access, so managers are not given Employee read rights. Instead these
methods check the reports_to tree and return job fields only — never personal or pay fields (brief §11.3).

Probation (R-H1): 30 days before ``scheduled_confirmation_date`` the line manager gets one review ToDo. The
manager confirms (sets ``final_confirmation_date``), extends (moves ``scheduled_confirmation_date``), or
recommends ending, which goes to the HR Managers — the manager can't end employment alone.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from eswasa_hr.scope import employee_tree, report_tree  # noqa: F401  (report_tree re-exported for callers)

PROBATION_NOTICE_DAYS = 30  # brief §4 R-H1
CONTRACT_NOTICE_DAYS = 60  # brief §4 R-H2
OUTCOMES = ("confirm", "extend", "end")


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def probation_due(scheduled: Any, final: Any, today: date) -> date | None:
    """The review date when probation is still open and due within the notice window (or overdue)."""
    s = _d(scheduled)
    if not s or _d(final):
        return None
    return s if s <= today + timedelta(days=PROBATION_NOTICE_DAYS) else None


def contract_ending(end: Any, today: date) -> date | None:
    e = _d(end)
    return e if e and today <= e <= today + timedelta(days=CONTRACT_NOTICE_DAYS) else None


def probation_errors(outcome: str, summary: str, extend_to: Any, scheduled: Any) -> list[str]:
    errs: list[str] = []
    if outcome not in OUTCOMES:
        errs.append("Choose confirm, extend or recommend ending.")
    if len((summary or "").strip()) < 10:
        errs.append("Say briefly how the probation went; it goes on the record.")
    if outcome == "extend":
        new, old = _d(extend_to), _d(scheduled)
        if not new:
            errs.append("Choose the new review date.")
        elif old and new <= old:
            errs.append("The new review date must be after the current one.")
    return errs


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _me() -> str | None:
    import frappe

    return frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name")


def _tree(manager: str) -> list[str]:
    return employee_tree(manager)


def _require_in_team(employee: str) -> str:
    import frappe

    me = _me()
    if not me or employee not in _tree(me):
        frappe.throw("This person doesn't report to you.", frappe.PermissionError)
    return me


_JOB_FIELDS = ["name", "employee_name", "designation", "department", "status", "date_of_joining", "reports_to",
               "scheduled_confirmation_date", "final_confirmation_date", "contract_end_date", "user_id", "employment_type"]


def _away_today(employees: list[str], day: date) -> dict[str, str]:
    import frappe

    if not employees:
        return {}
    away = {}
    for r in frappe.get_all(
        "Leave Application",
        filters={"employee": ["in", employees], "status": "Approved", "from_date": ["<=", day], "to_date": [">=", day], "docstatus": 1},
        fields=["employee", "leave_type"],
        limit=0,
    ):
        away[r["employee"]] = r["leave_type"]
    return away


def _member_row(e: dict[str, Any], day: date, away: dict[str, str]) -> dict[str, Any]:
    pd = probation_due(e.get("scheduled_confirmation_date"), e.get("final_confirmation_date"), day)
    ce = contract_ending(e.get("contract_end_date"), day)
    return {
        "employee": e["name"],
        "employee_name": e["employee_name"],
        "designation": e.get("designation"),
        "department": e.get("department"),
        "direct": None,
        "on_probation": bool(e.get("scheduled_confirmation_date") and not e.get("final_confirmation_date")),
        "probation_review_due": pd.isoformat() if pd else None,
        "contract_ends": ce.isoformat() if ce else None,
        "away_today": away.get(e["name"]),
        "date_of_joining": str(e["date_of_joining"]) if e.get("date_of_joining") else None,
    }


def my_team_impl() -> dict[str, Any]:
    import frappe

    me = _me()
    if not me:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    ids = _tree(me)
    day = _today()
    rows = frappe.get_all("Employee", filters={"name": ["in", ids or ["__none__"]]}, fields=_JOB_FIELDS, limit=0, order_by="employee_name asc")
    away = _away_today(ids, day)
    members = []
    for e in rows:
        m = _member_row(e, day, away)
        m["direct"] = e.get("reports_to") == me
        members.append(m)
    waiting = frappe.db.count("ToDo", {"allocated_to": frappe.session.user, "status": "Open"})
    return {
        "manager": me,
        "members": members,
        "summary": {
            "people": len(members),
            "direct": sum(1 for m in members if m["direct"]),
            "away_today": sum(1 for m in members if m["away_today"]),
            "probation_reviews_due": sum(1 for m in members if m["probation_review_due"] and m["direct"]),
            "contracts_ending": sum(1 for m in members if m["contract_ends"]),
            "waiting_for_you": waiting,
        },
    }


def member_impl(employee: str) -> dict[str, Any]:
    import frappe

    me = _require_in_team(employee)
    e = frappe.db.get_value("Employee", employee, _JOB_FIELDS, as_dict=True)
    day = _today()
    row = _member_row(dict(e), day, _away_today([employee], day))
    row["direct"] = e.reports_to == me
    row["line_manager"] = frappe.db.get_value("Employee", e.reports_to, "employee_name") if e.reports_to else None
    row["scheduled_confirmation_date"] = str(e.scheduled_confirmation_date) if e.scheduled_confirmation_date else None
    balances = []
    for a in frappe.get_all(
        "Leave Allocation",
        filters={"employee": employee, "docstatus": 1, "from_date": ["<=", day], "to_date": [">=", day]},
        fields=["leave_type", "total_leaves_allocated"],
        limit=0,
    ):
        taken = sum(
            float(x.get("total_leave_days") or 0)
            for x in frappe.get_all("Leave Application", filters={"employee": employee, "leave_type": a["leave_type"], "status": "Approved", "docstatus": 1}, fields=["total_leave_days"], limit=0)
        )
        alloc = float(a.get("total_leaves_allocated") or 0)
        balances.append({"leave_type": a["leave_type"], "allocated": alloc, "used": taken, "balance": max(0.0, alloc - taken)})
    row["balances"] = balances
    from eswasa_hr.authorisations import _all_rows

    row["authorisations"] = [r for r in _all_rows({"employee": employee}) if r["status"] != "Withdrawn"]
    return row


def calendar_impl(from_date: str, to_date: str) -> dict[str, Any]:
    import frappe

    me = _me()
    if not me:
        frappe.throw("Your login isn't linked to an employee record.", frappe.DoesNotExistError)
    start, end = _d(from_date), _d(to_date)
    if not start or not end or end < start or (end - start).days > 62:
        frappe.throw("Choose a range of up to two months.", frappe.ValidationError)
    ids = _tree(me)
    names = {r["name"]: r["employee_name"] for r in frappe.get_all("Employee", filters={"name": ["in", ids or ["__none__"]]}, fields=["name", "employee_name", "user_id"], limit=0)}
    users = {r["user_id"]: r["name"] for r in frappe.get_all("Employee", filters={"name": ["in", ids or ["__none__"]]}, fields=["name", "user_id"], limit=0) if r.get("user_id")}
    entries = []
    for r in frappe.get_all(
        "Leave Application",
        filters={"employee": ["in", ids or ["__none__"]], "status": ["in", ["Open", "Approved"]], "docstatus": ["<", 2], "from_date": ["<=", end], "to_date": [">=", start]},
        fields=["employee", "leave_type", "from_date", "to_date", "status"],
        limit=0,
    ):
        entries.append({"employee": r["employee"], "kind": "leave", "label": r["leave_type"], "from_date": str(r["from_date"]), "to_date": str(r["to_date"]), "approved": r["status"] == "Approved"})
    if users:
        for v in frappe.get_all(
            "Field Visit",
            filters={"lead_auditor": ["in", list(users)], "planned_date": ["between", [start.isoformat(), end.isoformat()]]},
            fields=["lead_auditor", "planned_date", "title"],
            limit=0,
        ):
            entries.append({"employee": users[v["lead_auditor"]], "kind": "field", "label": v.get("title") or "Field visit", "from_date": str(v["planned_date"]), "to_date": str(v["planned_date"]), "approved": True})
    return {"from_date": start.isoformat(), "to_date": end.isoformat(), "people": [{"employee": k, "employee_name": v} for k, v in sorted(names.items(), key=lambda kv: kv[1])], "entries": entries}


def probation_review_impl(employee: str, outcome: str, summary: str, extend_to: str | None) -> dict[str, Any]:
    import frappe
    from frappe.utils import add_days

    me = _require_in_team(employee)
    e = frappe.get_doc("Employee", employee)
    if e.reports_to != me:
        frappe.throw("Only the direct line manager reviews probation.", frappe.PermissionError)
    if not e.scheduled_confirmation_date or e.final_confirmation_date:
        frappe.throw("This person isn't on probation.", frappe.ValidationError)
    errs = probation_errors(outcome, summary, extend_to, e.scheduled_confirmation_date)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    day = _today()
    note = f"Probation review by {frappe.session.user}: {outcome}. {summary.strip()}"
    if outcome == "confirm":
        e.final_confirmation_date = day.isoformat()
    elif outcome == "extend":
        e.scheduled_confirmation_date = _d(extend_to).isoformat()
    e.flags.ignore_permissions = True  # the line-manager check above stands in for Employee write rights
    e.save()
    e.add_comment("Comment", note)
    for row in frappe.get_all("ToDo", filters={"reference_type": "Employee", "reference_name": employee, "status": "Open", "allocated_to": frappe.session.user}, fields=["name", "description"]):
        if "probation" in (row.get("description") or "").lower():
            frappe.db.set_value("ToDo", row["name"], "status", "Closed")
    if outcome == "end":
        from eswasa_hr.recruitment import _hr_manager_users

        for user in _hr_manager_users(exclude=frappe.session.user):
            frappe.get_doc(
                {
                    "doctype": "ToDo",
                    "allocated_to": user,
                    "description": f"Probation: {e.employee_name}'s line manager recommends ending employment. Decide with the Executive Director.",
                    "reference_type": "Employee",
                    "reference_name": employee,
                    "status": "Open",
                    "priority": "High",
                    "date": add_days(day, 3),
                }
            ).insert(ignore_permissions=True)
    return member_impl(employee)


def open_probation_reviews() -> int:
    """R-H1 (daily): one ToDo for the line manager when a probation review is within 30 days."""
    import frappe
    from frappe.utils import add_days

    day = _today()
    created = 0
    for e in frappe.get_all(
        "Employee",
        filters={"status": "Active", "scheduled_confirmation_date": ["<=", add_days(day, PROBATION_NOTICE_DAYS)], "final_confirmation_date": ["in", ["", None]]},
        fields=["name", "employee_name", "reports_to", "scheduled_confirmation_date"],
        limit=0,
    ):
        if not e.get("reports_to") or not e.get("scheduled_confirmation_date"):
            continue
        manager_user = frappe.db.get_value("Employee", e["reports_to"], "user_id")
        if not manager_user:
            continue
        if frappe.db.exists("ToDo", {"reference_type": "Employee", "reference_name": e["name"], "allocated_to": manager_user, "status": "Open", "description": ["like", "%probation%"]}):
            continue
        due = _d(e["scheduled_confirmation_date"])
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": manager_user,
                "description": f"Review {e['employee_name']}'s probation by {due.day} {due.strftime('%b %Y')}",
                "reference_type": "Employee",
                "reference_name": e["name"],
                "status": "Open",
                "priority": "Medium",
                "date": due.isoformat(),
            }
        ).insert(ignore_permissions=True)
        created += 1
    return created


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def my_team() -> dict[str, Any]:
    return my_team_impl()


@_whitelist
def member(employee: str) -> dict[str, Any]:
    return member_impl(employee)


@_whitelist
def calendar(from_date: str, to_date: str) -> dict[str, Any]:
    return calendar_impl(from_date, to_date)


@_whitelist
def probation_review(employee: str, outcome: str, summary: str = "", extend_to: str | None = None, confirm: Any = False) -> dict[str, Any]:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)
    return probation_review_impl(employee, outcome, summary, extend_to)
