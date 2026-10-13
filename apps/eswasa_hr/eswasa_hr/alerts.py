"""
HR alerts (brief §4, §6.2; registry family ``alert``): R-H2 contract end, R-H3 authorisation expiry,
R-H4 thin competence cover.

Each alert is one ``HR Alert`` row with a unique ``key``, so the daily job can run any number of times (or
miss a day) and still raise each alert once. Every recipient is a named user with their own low-priority
ToDo; acknowledging in Approvals closes only that person's ToDo.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable

from eswasa_hr import settings

DOCTYPE = "HR Alert"
# R-H2 / R-H3 / R-H4 windows and the thin-cover threshold come from HR Settings (eswasa_hr.settings).


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def fmt(d: date) -> str:
    return f"{d.day} {d.strftime('%b %Y')}"


def contract_due(end: Any, day: date, notice: int | None = None) -> bool:
    """R-H2: the contract ends within the notice window and hasn't ended yet."""
    e = _d(end)
    return e is not None and 0 <= (e - day).days <= (notice if notice is not None else settings.get("contract_notice_days"))


def expiry_threshold(valid_to: Any, day: date) -> int | None:
    """R-H3: the smallest alert threshold already reached (HR Settings, e.g. 60, 30, 7 days), or None."""
    e = _d(valid_to)
    if e is None:
        return None
    left = (e - day).days
    if left < 0:
        return None
    reached = [t for t in settings.get("expiry_alert_days") if left <= t]
    return min(reached) if reached else None


def thin_cover(skills: Iterable[str], cov: dict[str, dict[str, int]]) -> list[tuple[str, int]]:
    """R-H4: (skill, holders) for every catalogue skill with one or zero current holders."""
    return [(s, cov.get(s, {}).get("holders", 0)) for s in skills if cov.get(s, {}).get("holders", 0) <= settings.get("thin_cover")]


def recipients(*users: Any) -> list[str]:
    """Named users only, in order, without blanks, duplicates or Administrator."""
    out: list[str] = []
    for group in users:
        for u in group if isinstance(group, (list, tuple, set)) else [group]:
            if u and u != "Administrator" and u not in out:
                out.append(u)
    return out


def contract_title(employee_name: str, end: date) -> str:
    return f"Fixed-term contract ends {fmt(end)}: {employee_name}. Renew, make permanent or let it end"


def expiry_title(employee_name: str, skill: str, valid_to: date, threshold: int) -> str:
    return f"Authorisation expires {fmt(valid_to)} ({threshold} days): {employee_name}, {skill}"


def cover_title(skill: str, holders: int) -> str:
    who = "nobody holds" if holders == 0 else ("only one person holds" if holders == 1 else f"only {holders} people hold")
    return f"Competence cover alert: {who} {skill}"


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _user_of(employee: str | None) -> str | None:
    import frappe

    return frappe.db.get_value("Employee", employee, "user_id") if employee else None


def raise_alert(key: str, rule: str, title: str, users: list[str], due: Any, employee: str | None = None, subject: tuple[str, str] | None = None,
                notify: tuple[str, dict[str, Any]] | None = None) -> int:
    """Create the alert and one ToDo per user, once per key. Returns 1 if raised now, else 0.

    ``notify`` = (template, context) also emails the same users, for high-value alerts only (R-H2, R-H3 at 7 days).
    """
    import frappe

    if not users or frappe.db.exists(DOCTYPE, {"key": key}):
        return 0
    doc = frappe.get_doc(
        {
            "doctype": DOCTYPE,
            "key": key,
            "rule": rule,
            "message": title,
            "employee": employee,
            "subject_doctype": subject[0] if subject else None,
            "subject_name": subject[1] if subject else None,
            "due": due,
        }
    )
    doc.insert(ignore_permissions=True)
    for user in users:
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": user,
                "description": title,
                "reference_type": DOCTYPE,
                "reference_name": doc.name,
                "status": "Open",
                "priority": "Low",
                "assigned_by": "Administrator",
                "date": due,
            }
        ).insert(ignore_permissions=True)
    if notify:
        from eswasa_hr import notify as outbox

        outbox.queue(f"alert:{key}", users, notify[0], notify[1])
    return 1


def close_for(employee: str, rule: str) -> int:
    """Close every open ToDo of this rule's alerts for one person (e.g. once the contract is decided)."""
    import frappe

    n = 0
    for a in frappe.get_all(DOCTYPE, filters={"employee": employee, "rule": rule}, fields=["name"], limit=0):
        for t in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": a["name"], "status": "Open"}, fields=["name"], limit=0):
            frappe.db.set_value("ToDo", t["name"], "status", "Closed")
            n += 1
    return n


def contract_end_alerts() -> int:
    """R-H2: HR Managers and the line manager, once, when a contract enters its notice window (HR Settings)."""
    import frappe
    from frappe.utils import add_days

    from eswasa_hr.recruitment import _hr_manager_users

    day = _today()
    hr = _hr_manager_users()
    n = 0
    for e in frappe.get_all(
        "Employee",
        filters={"status": "Active", "contract_end_date": ["between", [day, add_days(day, settings.get("contract_notice_days"))]]},
        fields=["name", "employee_name", "contract_end_date", "reports_to"],
        limit=0,
    ):
        end = _d(e["contract_end_date"])
        if not contract_due(end, day):
            continue
        users = recipients(hr, _user_of(e.get("reports_to")))
        n += raise_alert(f"R-H2:{e['name']}:{end.isoformat()}", "R-H2", contract_title(e["employee_name"], end), users, end, e["name"], ("Employee", e["name"]),
                         ("contract_ending", {"employee_name": e["employee_name"], "end_date": fmt(end)}))
    return n


def authorisation_expiry_alerts() -> int:
    """R-H3: the employee, line manager and HR Managers at each HR Settings alert threshold before valid_to."""
    import frappe
    from frappe.utils import add_days

    from eswasa_hr.recruitment import _hr_manager_users

    if not frappe.db.exists("DocType", "Staff Authorisation"):
        return 0
    day = _today()
    hr = _hr_manager_users()
    n = 0
    for a in frappe.get_all(
        "Staff Authorisation",
        filters={"docstatus": 1, "status": ["in", ["Current", "Expiring"]], "valid_to": ["between", [day, add_days(day, max(settings.get("expiry_alert_days")))]]},
        fields=["name", "person_type", "employee", "external_person", "department", "skill", "valid_to"],
        limit=0,
    ):
        end = _d(a["valid_to"])
        t = expiry_threshold(end, day)
        if t is None:
            continue
        if a.get("employee"):
            e = frappe.db.get_value("Employee", a["employee"], ["employee_name", "user_id", "reports_to"], as_dict=True) or {}
            name, person_user, manager = e.get("employee_name") or a["employee"], e.get("user_id"), _user_of(e.get("reports_to"))
        else:
            # Plan 07 step 7: an external person has no line manager; the head of the authorisation's department is told.
            from eswasa_hr.authorisations import department_head, subject

            who = subject(a)
            name, person_user, manager = who["name"], who["user"], department_head(who["department"])[1]
        users = recipients(person_user, manager, hr)
        title = expiry_title(name, a["skill"], end, t)
        mail = ("authorisation_expiring", {"employee_name": name, "competence": a["skill"], "valid_to": fmt(end)}) if t == min(settings.get("expiry_alert_days")) else None
        n += raise_alert(f"R-H3:{a['name']}:{end.isoformat()}:{t}", "R-H3", title, users, end, a.get("employee"), ("Staff Authorisation", a["name"]), mail)
    return n


def thin_cover_alerts() -> int:
    """R-H4: heads of the departments that use a competence, at most once a month while cover stays thin."""
    import frappe

    from eswasa_hr.authorisations import _all_rows, cover
    from eswasa_hr.recruitment import _hr_manager_users

    if not frappe.db.exists("DocType", "Staff Authorisation"):
        return 0
    day = _today()
    rows = [r for r in _all_rows() if r["status"] != "Withdrawn"]
    skills = [s["name"] for s in frappe.get_all("Skill", filters={"custom_kind": ["is", "set"]}, fields=["name"], limit=0)]
    n = 0
    for skill, holders in thin_cover(skills, cover(rows)):
        people = {r["employee"] for r in rows if r["skill"] == skill}
        depts = {frappe.db.get_value("Employee", p, "department") for p in people} - {None}
        heads = [_user_of(frappe.db.get_value("Department", d, "custom_head")) for d in sorted(depts)]
        # No department uses it yet, or no head is set: HR owns the catalogue, so HR is told.
        users = recipients(heads) or recipients(_hr_manager_users())
        n += raise_alert(f"R-H4:{skill}:{day.strftime('%Y-%m')}", "R-H4", cover_title(skill, holders), users, day, None, ("Skill", skill))
    return n


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler: Acknowledge closes only your own ToDo for the alert."""
    import frappe

    if (action or "").strip().lower() != "approve":
        frappe.throw("Alerts can only be acknowledged.", frappe.ValidationError)
    mine = frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": name, "allocated_to": frappe.session.user, "status": "Open"}, fields=["name"], limit=0)
    if not mine:
        frappe.throw("This alert isn't open for you.", frappe.ValidationError)
    for t in mine:
        frappe.db.set_value("ToDo", t["name"], "status", "Closed")
    return {"ok": True, "doctype": DOCTYPE, "name": name, "action": action, "workflow_action": None, "status": "Acknowledged", "message": "Alert acknowledged"}
