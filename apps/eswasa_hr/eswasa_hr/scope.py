"""
Who can see whose HR records (brief §11, Acceptance §14.8), in Desk and REST as well as the portal.

These are ``permission_query_conditions`` / ``has_permission`` hooks, so they only narrow what a role already
allows; they never grant. HR Manager, HR User and System Manager see everything. Everyone else sees:

- Employee: their own record plus their direct and indirect reports.
- Leave Application: their own requests and the ones they are the leave approver for.
- Appraisal: their own and their reports' (the reports-to chain).
- Staff Authorisation: their own and those of people in a department they head.
- Employee Document: their own only.

The slice methods read through ``frappe.get_all`` / ``frappe.db`` after their own checks, so these hooks don't
change what they return. Approvals checks ``frappe.has_permission`` before showing a card, and each decider
(leave approver, line manager, department head) is inside the rule for that doctype.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

HR_ROLES = ("HR Manager", "HR User", "System Manager")
DOCTYPES = ("Employee", "Leave Application", "Appraisal", "Staff Authorisation", "Employee Document")


# ---------------------------------------------------------------- pure rules


def report_tree(manager: str, edges: list[tuple[str, str | None]]) -> list[str]:
    """Everyone under ``manager`` in (employee, reports_to) edges, breadth first, cycle-safe."""
    children: dict[str, list[str]] = {}
    for emp, boss in edges:
        if boss:
            children.setdefault(boss, []).append(emp)
    out: list[str] = []
    seen = {manager}
    queue = list(children.get(manager, []))
    while queue:
        e = queue.pop(0)
        if e in seen:
            continue
        seen.add(e)
        out.append(e)
        queue.extend(children.get(e, []))
    return out


def is_hr(roles: Iterable[str]) -> bool:
    return bool(set(roles or ()) & set(HR_ROLES))


def visible(viewer_roles: Iterable[str], viewer_employee: str | None, subject: str | None, edges: list[tuple[str, str | None]]) -> bool:
    """HR sees everyone, a person sees themselves, a line manager sees direct and indirect reports; nobody else."""
    if is_hr(viewer_roles):
        return True
    if not viewer_employee or not subject:
        return False
    return subject == viewer_employee or subject in report_tree(viewer_employee, edges)


@dataclass
class Viewer:
    user: str
    roles: list[str]
    employee: str | None = None
    reports: list[str] = field(default_factory=list)
    headed: list[str] = field(default_factory=list)  # departments whose custom_head is this employee

    @property
    def hr(self) -> bool:
        return is_hr(self.roles)

    @property
    def people(self) -> list[str]:
        """Own record plus reports."""
        return ([self.employee] if self.employee else []) + [r for r in self.reports if r != self.employee]


def can_see(doctype: str, viewer: Viewer, row: dict[str, Any]) -> bool:
    """Row rule for one record. ``row`` carries name / employee / leave_approver / department (of the employee)."""
    if viewer.hr:
        return True
    me = viewer.employee
    if doctype == "Employee":
        return bool(row.get("name")) and row.get("name") in viewer.people
    if doctype == "Leave Application":
        return bool(me and row.get("employee") == me) or (row.get("leave_approver") or None) == viewer.user
    if doctype == "Appraisal":
        return bool(row.get("employee")) and row.get("employee") in viewer.people
    if doctype == "Staff Authorisation":
        return bool(me and row.get("employee") == me) or bool(row.get("department") and row.get("department") in viewer.headed)
    if doctype == "Employee Document":
        return bool(me and row.get("employee") == me)
    return True  # not a scoped doctype: leave it to the role permissions


def _in(column: str, values: list[str], esc: Callable[[str], str]) -> str:
    return f"{column} in ({', '.join(esc(v) for v in values)})" if values else "1=0"


def conditions(doctype: str, viewer: Viewer, esc: Callable[[str], str]) -> str:
    """The WHERE fragment for list queries: "" for HR (no narrowing), otherwise a restriction, never a widening."""
    if viewer.hr:
        return ""
    t = f"`tab{doctype}`"
    own = [viewer.employee] if viewer.employee else []
    if doctype == "Employee":
        return _in(f"{t}.`name`", viewer.people, esc)
    if doctype == "Leave Application":
        return f"({_in(f'{t}.`employee`', own, esc)} or {t}.`leave_approver` = {esc(viewer.user)})"
    if doctype == "Appraisal":
        return _in(f"{t}.`employee`", viewer.people, esc)
    if doctype == "Staff Authorisation":
        headed = (
            f"({t}.`employee` in (select `name` from `tabEmployee` where {_in('`department`', viewer.headed, esc)})"
            # plan 07: an external person's authorisation carries its own department
            f" or (ifnull({t}.`employee`, '') = '' and {_in(f'{t}.`department`', viewer.headed, esc)}))"
            if viewer.headed
            else "1=0"
        )
        return f"({_in(f'{t}.`employee`', own, esc)} or {headed})"
    if doctype == "Employee Document":
        return _in(f"{t}.`employee`", own, esc)
    return ""


# Deciders and their own-record User Permission.
#
# HRMS's ``create_user_permission`` (set on every hire and import) gives a login a User Permission on its own
# Employee record that applies to all doctypes. For someone who decides for others (line manager, leave or
# expense approver, department head) that hides the very records they decide: their reports' Employee rows,
# leave, appraisals and claims, in Desk, in REST and in Approvals' has_permission check. So for a decider the
# permission is narrowed instead of removed: one row per Employee-linked doctype, except the ones these hooks
# (or expenses.py) already scope. Salary Slip, Attendance and the rest stay limited to their own record.

SCOPED_DOCTYPES = DOCTYPES + ("Expense Claim",)


def deciders(employees: list[dict[str, Any]], heads: Iterable[str]) -> dict[str, str]:
    """``{employee: user}`` for Active people with a login who decide for someone else."""
    user_of = {e["name"]: e["user_id"] for e in employees if e.get("user_id")}
    employee_of = {u: n for n, u in user_of.items()}
    out: dict[str, str] = {}
    for e in employees:
        boss = e.get("reports_to")
        if boss in user_of and boss != e["name"]:
            out[boss] = user_of[boss]
        for key in ("leave_approver", "expense_approver"):
            who = employee_of.get(e.get(key) or "")
            if who and who != e["name"]:
                out[who] = user_of[who]
    for head in heads:
        if head in user_of:
            out[head] = user_of[head]
    return out


def decider_permissions(user: str, employee: str, perms: list[dict[str, Any]], linked: Iterable[str]) -> tuple[list[str], list[dict[str, Any]]]:
    """(User Permission names to delete, rows to insert) so ``user`` keeps their own-record limit everywhere
    except the scoped doctypes. Only the person's own record is touched; other permissions stay."""
    own = [p for p in perms if p.get("user") == user and p.get("allow") == "Employee" and p.get("for_value") == employee]
    drop = [p["name"] for p in own if p.get("apply_to_all_doctypes") or p.get("applicable_for") in SCOPED_DOCTYPES]
    kept = [p for p in own if p["name"] not in drop]
    have = {p.get("applicable_for") for p in kept}
    add = [
        {"doctype": "User Permission", "user": user, "allow": "Employee", "for_value": employee,
         "apply_to_all_doctypes": 0, "applicable_for": dt, "is_default": 0}
        for dt in sorted(set(linked) - set(SCOPED_DOCTYPES) - have)
    ]
    if add and not any(p.get("is_default") for p in kept):
        add[0]["is_default"] = 1  # self-service forms still pick the person's own record
    return drop, add


# ---------------------------------------------------------------- Frappe glue


def _employee_of(user: str) -> str | None:
    import frappe

    return frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")


def employee_tree(manager: str) -> list[str]:
    """Active direct and indirect reports of ``manager`` (read without permission hooks)."""
    import frappe

    edges = [(r["name"], r.get("reports_to")) for r in frappe.get_all("Employee", filters={"status": "Active"}, fields=["name", "reports_to"], limit=0)]
    return report_tree(manager, edges)


def viewer_for(user: str | None = None) -> Viewer:
    import frappe

    user = user or frappe.session.user
    cache = getattr(getattr(frappe, "local", None), "eswasa_hr_scope", None)
    if cache is not None and user in cache:
        return cache[user]
    roles = list(frappe.get_roles(user))
    v = Viewer(user=user, roles=roles)
    if not v.hr:
        v.employee = _employee_of(user)
        if v.employee:
            v.reports = employee_tree(v.employee)
            v.headed = [r["name"] for r in frappe.get_all("Department", filters={"custom_head": v.employee}, fields=["name"], limit=0)]
    if getattr(frappe, "local", None) is not None:
        try:
            frappe.local.eswasa_hr_scope = {**(cache or {}), user: v}
        except AttributeError:
            pass
    return v


def _field(doc: Any, key: str) -> Any:
    return doc.get(key) if isinstance(doc, dict) else getattr(doc, key, None)


def _row(doctype: str, doc: Any) -> dict[str, Any]:
    import frappe

    if isinstance(doc, str):
        fields = ["name", "employee"] + (["leave_approver"] if doctype == "Leave Application" else [])
        doc = frappe.db.get_value(doctype, doc, fields, as_dict=True) or {"name": doc}
    row = {k: _field(doc, k) for k in ("name", "employee", "leave_approver")}
    if doctype == "Staff Authorisation" and row.get("employee"):
        row["department"] = frappe.db.get_value("Employee", row["employee"], "department")
    elif doctype == "Staff Authorisation":  # plan 07: an external person's authorisation names its department
        row["department"] = _field(doc, "department") or frappe.db.get_value(doctype, row.get("name"), "department")
    return row


def _query(doctype: str, user: str | None) -> str:
    import frappe

    return conditions(doctype, viewer_for(user), frappe.db.escape)


def _has(doctype: str, doc: Any, user: str | None) -> bool:
    v = viewer_for(user)
    if v.hr:
        return True
    row = _row(doctype, doc)
    if not row.get("name") and doctype != "Employee" and not row.get("employee"):
        return True  # a new, unsaved row: the role permission decides whether it can be created
    return can_see(doctype, v, row)


# permission_query_conditions (hooks.py)


def employee_query(user: str | None = None, doctype: str | None = None) -> str:
    return _query("Employee", user)


def leave_query(user: str | None = None, doctype: str | None = None) -> str:
    return _query("Leave Application", user)


def appraisal_query(user: str | None = None, doctype: str | None = None) -> str:
    return _query("Appraisal", user)


def authorisation_query(user: str | None = None, doctype: str | None = None) -> str:
    return _query("Staff Authorisation", user)


def document_query(user: str | None = None, doctype: str | None = None) -> str:
    return _query("Employee Document", user)


# has_permission (hooks.py)


def employee_has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    v = viewer_for(user)
    if v.hr:
        return True
    name = _field(doc, "name") if not isinstance(doc, str) else doc
    if not name or getattr(doc, "is_new", lambda: False)():
        return True  # creating: the role permission decides
    return can_see("Employee", v, {"name": name})


def leave_has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    return _has("Leave Application", doc, user)


def appraisal_has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    return _has("Appraisal", doc, user)


def authorisation_has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    return _has("Staff Authorisation", doc, user)


def document_has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    return _has("Employee Document", doc, user)


# Deciders' User Permissions (see decider_permissions): Employee and Department on_update, and the daily job.


def linked_doctypes() -> list[str]:
    """Non-table doctypes with a Link to Employee (standard or custom), like Frappe's apply-to-all expands to."""
    import frappe

    names = {r["parent"] for r in frappe.get_all("DocField", filters={"fieldtype": "Link", "options": "Employee", "parenttype": "DocType"}, fields=["parent"], limit=0)}
    names |= {r["dt"] for r in frappe.get_all("Custom Field", filters={"fieldtype": "Link", "options": "Employee"}, fields=["dt"], limit=0)}
    names.add("Employee")
    tables = {r["name"] for r in frappe.get_all("DocType", filters={"name": ["in", sorted(names)], "istable": 1}, fields=["name"], limit=0)}
    return sorted(names - tables)


def release(employee: str, user: str, linked: list[str] | None = None) -> int:
    """Narrow one decider's own-record User Permission. Returns the number of rows changed."""
    import frappe

    perms = frappe.get_all(
        "User Permission",
        filters={"user": user, "allow": "Employee", "for_value": employee},
        fields=["name", "user", "allow", "for_value", "apply_to_all_doctypes", "applicable_for", "is_default"],
        limit=0,
    )
    drop, add = decider_permissions(user, employee, perms, linked if linked is not None else linked_doctypes())
    for name in drop:
        frappe.delete_doc("User Permission", name, ignore_permissions=True)
    for row in add:
        frappe.get_doc(row).insert(ignore_permissions=True)
    return len(drop) + len(add)


def _current_deciders() -> dict[str, str]:
    import frappe

    employees = frappe.get_all("Employee", filters={"status": "Active"},
                               fields=["name", "user_id", "reports_to", "leave_approver", "expense_approver"], limit=0)
    heads = [r["custom_head"] for r in frappe.get_all("Department", filters={"custom_head": ["is", "set"]}, fields=["custom_head"], limit=0)]
    return deciders(employees, heads)


def release_deciders() -> int:
    """Daily (plan 02 follow-up): every current decider's own-record permission narrowed. Idempotent."""
    linked = linked_doctypes()
    return sum(release(employee, user, linked) for employee, user in _current_deciders().items())


def on_employee_update(doc: Any, method: str | None = None) -> None:
    """Employee on_update: whoever this record names as manager or approver, and this person if they decide."""
    import frappe

    names = {_field(doc, "reports_to"), _field(doc, "name")}
    for key in ("leave_approver", "expense_approver"):
        if _field(doc, key):
            names.add(frappe.db.get_value("Employee", {"user_id": _field(doc, key)}, "name"))
    found = _current_deciders()
    linked = None
    for employee in names:
        if employee and employee in found:
            linked = linked or linked_doctypes()
            release(employee, found[employee], linked)


def on_department_update(doc: Any, method: str | None = None) -> None:
    """Department on_update: a newly named head decides authorisations for the department."""
    import frappe

    head = _field(doc, "custom_head")
    user = frappe.db.get_value("Employee", head, "user_id") if head else None
    if user:
        release(head, user)
