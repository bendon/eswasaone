"""
Establishment (journey J11; screens H3, H3a, H3b).

The establishment is the approved posts per department and designation in the submitted ``Staffing Plan``s.
A post can be frozen (``Staffing Plan Detail.custom_frozen_positions``): it stays approved but can't be
recruited to. Filled = active employees in that department and designation; in recruitment = open Job
Requisitions; vacant = approved − frozen − filled − in recruitment.

HR or the head of the department asks for a change (add, remove, freeze, unfreeze or regrade posts) with an
``Establishment Change``. The Executive Director decides first, in Approvals (named users with the
"Eswasa Executive Director" role, never the preparer). Adding posts or regrading also goes to the Council
HR & Remuneration Committee (Confirmation Pack H4, provisional): the Board Secretary records the committee's
decision in Approvals, with the minute reference. Only then is the Staffing Plan amended (cancel and amend,
so the history stays), or the designation regraded.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any

DOCTYPE = "Establishment Change"
PLAN = "Staffing Plan"
PLAN_ROW = "Staffing Plan Detail"
REQ = "Job Requisition"
OPEN_REQ = ["Pending", "Open & Approved", "On Hold"]
HR_ROLES = ("HR Manager", "HR User", "System Manager")
ED_ROLE = "Eswasa Executive Director"
COUNCIL_ROLE = "Eswasa Board Secretary"

CHANGES = ("Add", "Remove", "Freeze", "Unfreeze", "Regrade")
COUNCIL_CHANGES = ("Add", "Regrade")  # H4 (provisional): any increase in approved posts; grade changes
WAIT_ED, WAIT_COUNCIL = "Waiting for Executive Director", "Waiting for Council"
APPROVED, SENT_BACK, NOT_APPROVED = "Approved", "Sent back", "Not approved"
OPEN_STATES = (WAIT_ED, WAIT_COUNCIL)


# ---------------------------------------------------------------- pure rules


def post_counts(approved: int, frozen: int, filled: int, in_recruitment: int) -> dict[str, int]:
    a, f, fl, r = (max(0, int(x or 0)) for x in (approved, frozen, filled, in_recruitment))
    f = min(f, a)
    return {"approved": a, "frozen": f, "filled": fl, "in_recruitment": r, "vacant": max(0, a - f - fl - r)}


def needs_council(change: str) -> bool:
    return change in COUNCIL_CHANGES


def change_errors(change: str, count: Any, post: dict[str, int] | None, new_grade: str | None, current_grade: str | None, reason: str | None) -> list[str]:
    """Why this change can't be asked for, given the post's current counts (``post_counts``)."""
    errs: list[str] = []
    if change not in CHANGES:
        return ["Choose add, remove, freeze, unfreeze or regrade."]
    if not (reason or "").strip():
        errs.append("Say why.")
    p = post or post_counts(0, 0, 0, 0)
    if change == "Regrade":
        if not p["approved"]:
            errs.append("There are no approved posts to regrade.")
        if not (new_grade or "").strip():
            errs.append("Choose the new grade.")
        elif new_grade == current_grade:
            errs.append("The post is already on that grade.")
        return errs
    try:
        n = int(count)
    except (TypeError, ValueError):
        n = 0
    if n < 1:
        errs.append("Say how many posts.")
        return errs
    if change == "Remove":
        removable = p["approved"] - p["filled"] - p["in_recruitment"]
        if n > removable:
            errs.append(
                f"Only {max(0, removable)} of these posts are empty. Filled posts and posts in recruitment can't be removed."
            )
    elif change == "Freeze" and n > p["vacant"]:
        errs.append(f"Only {p['vacant']} of these posts are vacant, so only those can be frozen.")
    elif change == "Unfreeze" and n > p["frozen"]:
        errs.append(f"Only {p['frozen']} of these posts are frozen.")
    return errs


def apply_change(rows: list[dict[str, Any]], change: str, designation: str, count: int) -> list[dict[str, Any]]:
    """New Staffing Plan rows (designation, number_of_positions, frozen) after the change. Regrade leaves them."""
    out = [dict(r) for r in rows]
    row = next((r for r in out if r["designation"] == designation), None)
    if change == "Add":
        if row is None:
            row = {"designation": designation, "number_of_positions": 0, "frozen": 0}
            out.append(row)
        row["number_of_positions"] = int(row["number_of_positions"] or 0) + count
    elif row is not None and change == "Remove":
        row["number_of_positions"] = max(0, int(row["number_of_positions"] or 0) - count)
        row["frozen"] = min(int(row.get("frozen") or 0), row["number_of_positions"])
        if not row["number_of_positions"]:
            out.remove(row)
    elif row is not None and change == "Freeze":
        row["frozen"] = min(int(row["number_of_positions"] or 0), int(row.get("frozen") or 0) + count)
    elif row is not None and change == "Unfreeze":
        row["frozen"] = max(0, int(row.get("frozen") or 0) - count)
    return out


def change_summary(change: str, count: Any, designation: str, new_grade: str | None = None) -> str:
    if change == "Regrade":
        return f"Regrade {designation} to {new_grade}"
    n = int(count or 0)
    posts = "post" if n == 1 else "posts"
    verb = {"Add": "Add", "Remove": "Remove", "Freeze": "Freeze", "Unfreeze": "Unfreeze"}[change]
    return f"{verb} {n} {designation} {posts}"


def change_title(stage: str, summary: str, department: str) -> str:
    if stage == WAIT_COUNCIL:
        return f"Record Council decision: {summary}, {department}"
    return f"Approve establishment change: {summary}, {department}"


def track(state: str, council: bool) -> list[dict[str, Any]]:
    """Where the request is: asked → ED → (Council) → Staffing Plan updated."""
    steps = [{"title": "Asked", "state": "done"}, {"title": "Executive Director"}]
    if council:
        steps.append({"title": "Council HR & Remuneration Committee"})
    steps.append({"title": "Establishment updated"})
    if state == WAIT_ED:
        steps[1]["state"] = "now"
    elif state == WAIT_COUNCIL:
        steps[1]["state"] = "done"
        steps[2]["state"] = "now"
    elif state == APPROVED:
        for s in steps:
            s["state"] = "done"
    return steps


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _roles() -> set[str]:
    import frappe

    return set(frappe.get_roles())


def _is_hr() -> bool:
    return bool(_roles() & set(HR_ROLES))


def _is_ed() -> bool:
    return bool(_roles() & {ED_ROLE, "System Manager"})


def _my_employee() -> str | None:
    import frappe

    return frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name")


def _heads(department: str) -> bool:
    import frappe

    me = _my_employee()
    return bool(me) and frappe.db.get_value("Department", department, "custom_head") == me


def _require_reader(department: str | None = None) -> None:
    import frappe

    if _is_hr() or _is_ed() or (department and _heads(department)):
        return
    frappe.throw("Only HR, the Executive Director or the head of the department can see the establishment.", frappe.PermissionError)


def _users_with(role: str, exclude: list[str | None]) -> list[str]:
    import frappe

    users = {r.get("parent") for r in frappe.get_all("Has Role", filters={"role": role, "parenttype": "User"}, fields=["parent"], limit=0)}
    users -= {"Administrator", *exclude}
    if not users:
        return []
    return sorted(u.get("name") for u in frappe.get_all("User", filters={"name": ["in", sorted(users)], "enabled": 1}, fields=["name"], limit=0))


def approved_posts() -> dict[tuple[str, str], dict[str, int]]:
    """(department, designation) → approved and frozen posts in the submitted Staffing Plans."""
    import frappe

    out: dict[tuple[str, str], dict[str, int]] = {}
    for p in frappe.get_all(PLAN, filters={"docstatus": 1}, fields=["name", "department"], limit=0):
        for d in frappe.get_all(PLAN_ROW, filters={"parent": p.get("name")}, fields=["designation", "number_of_positions", "custom_frozen_positions"], limit=0):
            c = out.setdefault((p.get("department"), d.get("designation")), {"approved": 0, "frozen": 0})
            c["approved"] += int(d.get("number_of_positions") or 0)
            c["frozen"] += int(d.get("custom_frozen_positions") or 0)
    return out


def _post(department: str, designation: str, base: dict[str, int] | None = None) -> dict[str, int]:
    import frappe

    b = base if base is not None else approved_posts().get((department, designation), {"approved": 0, "frozen": 0})
    filled = frappe.db.count("Employee", {"status": "Active", "department": department, "designation": designation})
    reqs = frappe.db.count(REQ, {"department": department, "designation": designation, "status": ["in", OPEN_REQ]})
    return post_counts(b["approved"], b["frozen"], filled, reqs)


def _grade(designation: str) -> str | None:
    import frappe

    try:
        return frappe.db.get_value("Designation", designation, "custom_grade")
    except Exception:  # field not migrated yet
        return None


def _head(department: str) -> dict[str, Any] | None:
    import frappe

    head = frappe.db.get_value("Department", department, "custom_head")
    if not head:
        return None
    return {"id": head, "name": frappe.db.get_value("Employee", head, "employee_name") or head}


def _change_row(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r["name"],
        "department": r["department"],
        "designation": r["designation"],
        "change": r["change"],
        "count": int(r.get("count") or 0),
        "new_grade": r.get("new_grade"),
        "summary": change_summary(r["change"], r.get("count"), r["designation"], r.get("new_grade")),
        "state": r["state"],
        "council_required": bool(r.get("council_required")),
        "date": str(r["creation"])[:10] if r.get("creation") else None,
    }


_CHANGE_FIELDS = ["name", "department", "designation", "change", "count", "new_grade", "state", "council_required", "creation"]


def _changes(filters: dict[str, Any], limit: int = 50) -> list[dict[str, Any]]:
    import frappe

    if not frappe.db.exists("DocType", DOCTYPE):
        return []
    rows = frappe.get_all(DOCTYPE, filters=filters, fields=_CHANGE_FIELDS, order_by="creation desc", limit=limit)
    return [_change_row(dict(r)) for r in rows]


def establishment_impl() -> dict[str, Any]:
    """Approved, frozen, filled, in recruitment and vacant posts per department (H3)."""
    import frappe

    _require_reader()
    posts = approved_posts()
    depts = [d.get("name") for d in frappe.get_all("Department", filters={"is_group": 0}, fields=["name"], order_by="name asc", limit=0)]
    by_dept: dict[str, list[dict[str, Any]]] = {}
    for (dept, desig), base in posts.items():
        by_dept.setdefault(dept, []).append({"designation": desig, **_post(dept, desig, base)})
    out = []
    keys = ("approved", "frozen", "filled", "in_recruitment", "vacant")
    totals = {k: 0 for k in keys}
    for dept in sorted(set(depts) | set(by_dept)):
        rows = sorted(by_dept.get(dept, []), key=lambda r: r["designation"] or "")
        sums = {k: sum(r[k] for r in rows) for k in keys}
        # People in a department with no approved posts still count as filled (over establishment).
        people = frappe.db.count("Employee", {"status": "Active", "department": dept})
        sums["filled"] = max(sums["filled"], people)
        for k in keys:
            totals[k] += sums[k]
        out.append({"department": dept, "head": _head(dept), "posts": rows, **sums, "unplanned": max(0, people - sum(r["filled"] for r in rows))})
    return {
        "departments": out,
        "totals": totals,
        "has_plans": bool(posts),
        "pending": _changes({"state": ["in", list(OPEN_STATES)]}),
        "can_request": _is_hr(),
    }


def department_impl(department: str) -> dict[str, Any]:
    """One department: head, posts, people, cover warnings and establishment changes (H3a)."""
    import frappe

    from eswasa_hr.authorisations import _all_rows, cover

    if not frappe.db.exists("Department", department):
        frappe.throw("Department not found.", frappe.DoesNotExistError)
    _require_reader(department)
    posts = [{"designation": desig, "grade": _grade(desig), **_post(dept, desig, base)} for (dept, desig), base in sorted(approved_posts().items()) if dept == department]
    people = [
        {"id": e.get("name"), "name": e.get("employee_name"), "designation": e.get("designation"), "reports_to": e.get("reports_to")}
        for e in frappe.get_all(
            "Employee", filters={"status": "Active", "department": department}, fields=["name", "employee_name", "designation", "reports_to"], order_by="employee_name asc", limit=0
        )
    ]
    ids = {p["id"] for p in people}
    warnings: list[dict[str, Any]] = []
    if frappe.db.exists("DocType", "Staff Authorisation"):
        rows = [r for r in _all_rows() if r["status"] != "Withdrawn"]
        cov = cover(rows)
        for skill in sorted({r["skill"] for r in rows if r["employee"] in ids}):
            holders = cov.get(skill, {}).get("holders", 0)
            if holders <= 1:
                warnings.append({"skill": skill, "holders": holders})
    return {
        "department": department,
        "parent": frappe.db.get_value("Department", department, "parent_department"),
        "head": _head(department),
        "posts": posts,
        "people": people,
        "cover_warnings": warnings,
        "changes": _changes({"department": department}, limit=20),
        "can_request": _is_hr() or _heads(department),
        "can_set_head": _is_hr(),
    }


def detail_impl(name: str) -> dict[str, Any]:
    """One establishment change, where it is and who decides (H3b follow-up). No decision buttons here."""
    import frappe

    if not frappe.db.exists(DOCTYPE, name):
        frappe.throw("Establishment change not found.", frappe.DoesNotExistError)
    d = frappe.get_doc(DOCTYPE, name)
    _require_reader(d.department)
    todos = frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": name, "status": "Open"}, fields=["allocated_to"], limit=0)
    with_ = sorted({t.get("allocated_to") for t in todos} - {None})
    names = {u.get("name"): u.get("full_name") for u in frappe.get_all("User", filters={"name": ["in", with_]}, fields=["name", "full_name"], limit=0)} if with_ else {}
    row = _change_row(d.as_dict())
    return {
        **row,
        "reason": d.reason,
        "cost_note": d.cost_note,
        "current_grade": d.current_grade,
        "before": {"approved": int(d.approved_before or 0), "frozen": int(d.frozen_before or 0)},
        "prepared_by": d.owner,
        "ed_decision_by": d.ed_decided_by,
        "council_reference": d.council_reference,
        "decision_note": d.decision_note,
        "deciders": [{"user": u, "name": names.get(u) or u} for u in with_],
        "track": track(d.state, bool(d.council_required)),
    }


def prepare_impl(department: str, designation: str, change: str, reason: str, count: Any = None, new_grade: str | None = None, cost_note: str | None = None) -> dict[str, Any]:
    import frappe
    from frappe.utils import add_days

    if not frappe.db.exists("Department", department):
        frappe.throw("Department not found.", frappe.DoesNotExistError)
    if not frappe.db.exists("Designation", designation):
        frappe.throw("Designation not found.", frappe.DoesNotExistError)
    if not (_is_hr() or _heads(department)):
        frappe.throw("Only HR or the head of the department can ask for an establishment change.", frappe.PermissionError)
    if frappe.db.exists(DOCTYPE, {"department": department, "designation": designation, "state": ["in", list(OPEN_STATES)]}):
        frappe.throw("A change to these posts is already waiting for a decision.", frappe.ValidationError)
    base = approved_posts().get((department, designation), {"approved": 0, "frozen": 0})
    post = _post(department, designation, base)
    grade = _grade(designation)
    errs = change_errors(change, count, post, new_grade, grade, reason)
    if change == "Regrade" and new_grade and not frappe.db.exists("Employee Grade", new_grade):
        errs.append("That grade doesn't exist.")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    approvers = _users_with(ED_ROLE, [frappe.session.user])
    if not approvers:
        frappe.throw("No one holds the Executive Director role yet, so there's no one to decide. Ask the system administrator to assign it.", frappe.ValidationError)
    doc = frappe.get_doc(
        {
            "doctype": DOCTYPE,
            "department": department,
            "designation": designation,
            "change": change,
            "count": 0 if change == "Regrade" else int(count),
            "new_grade": new_grade if change == "Regrade" else None,
            "current_grade": grade,
            "approved_before": post["approved"],
            "frozen_before": post["frozen"],
            "reason": reason.strip(),
            "cost_note": (cost_note or "").strip() or None,
            "council_required": 1 if needs_council(change) else 0,
            "state": WAIT_ED,
        }
    )
    doc.insert(ignore_permissions=True)
    _route(doc, approvers, add_days(_today(), 5))
    return detail_impl(doc.name)


def _route(doc: Any, users: list[str], due: Any) -> None:
    import frappe

    title = change_title(doc.state, change_summary(doc.change, doc.count, doc.designation, doc.new_grade), doc.department)
    for user in users:
        if frappe.db.exists("ToDo", {"reference_type": DOCTYPE, "reference_name": doc.name, "allocated_to": user, "status": "Open"}):
            continue
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": user,
                "description": title,
                "reference_type": DOCTYPE,
                "reference_name": doc.name,
                "status": "Open",
                "priority": "Medium",
                "assigned_by": frappe.session.user,
                "date": due,
            }
        ).insert(ignore_permissions=True)


def _plan_rows(plan: Any) -> list[dict[str, Any]]:
    return [
        {"designation": r.designation, "number_of_positions": int(r.number_of_positions or 0), "frozen": int(getattr(r, "custom_frozen_positions", 0) or 0)}
        for r in plan.get("staffing_details") or []
    ]


def _apply(doc: Any) -> str | None:
    """Amend the Staffing Plan (or regrade the designation). Returns the new plan's name, if any."""
    import frappe
    from frappe.utils import add_days, add_years

    if doc.change == "Regrade":
        frappe.db.set_value("Designation", doc.designation, "custom_grade", doc.new_grade, update_modified=True)
        return None
    plans = frappe.get_all(PLAN, filters={"docstatus": 1, "department": doc.department}, fields=["name"], order_by="to_date desc, creation desc", limit=0)
    holder = next((p.get("name") for p in plans if frappe.db.exists(PLAN_ROW, {"parent": p.get("name"), "designation": doc.designation})), None)
    holder = holder or (plans[0].get("name") if plans else None)
    if holder:
        old = frappe.get_doc(PLAN, holder)
        rows = apply_change(_plan_rows(old), doc.change, doc.designation, int(doc.count or 0))
        new = frappe.copy_doc(old)
        new.amended_from = old.name
        old.flags.ignore_links = True  # Job Openings link to the plan; the amendment keeps the history
        old.cancel()
    else:
        from eswasa_hr.recruitment import _company

        rows = apply_change([], doc.change, doc.designation, int(doc.count or 0))
        today = _today()
        new = frappe.get_doc({"doctype": PLAN, "company": _company(), "department": doc.department, "from_date": today, "to_date": add_days(add_years(today, 1), -1)})
    keep = {r.designation: r for r in new.get("staffing_details") or []}
    new.set("staffing_details", [])
    for r in rows:
        cur = frappe.db.count("Employee", {"status": "Active", "department": doc.department, "designation": r["designation"]})
        prev = keep.get(r["designation"])
        new.append(
            "staffing_details",
            {
                "designation": r["designation"],
                # HRMS sets number_of_positions = vacancies + current_count on validate.
                "vacancies": max(0, r["number_of_positions"] - cur),
                "current_count": cur,
                "number_of_positions": r["number_of_positions"],
                "estimated_cost_per_position": getattr(prev, "estimated_cost_per_position", 0) if prev else 0,
                "custom_frozen_positions": r["frozen"],
            },
        )
    new.insert(ignore_permissions=True)
    new.submit()
    return new.name


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler. The ED decides first; the Board Secretary records the Council's decision when needed."""
    import frappe

    doc = frappe.get_doc(DOCTYPE, name)
    me = frappe.session.user
    if doc.state not in OPEN_STATES:
        frappe.throw("This was already decided.", frappe.ValidationError)
    if doc.owner == me:
        frappe.throw("You asked for this change, so someone else must decide it.", frappe.PermissionError)
    key = (action or "").strip().lower()
    note = (comment or "").strip()
    if key not in ("approve", "reject", "return"):
        frappe.throw("Approve or send back.", frappe.ValidationError)
    if key != "approve" and not note:
        frappe.throw("Say why, so whoever asked can respond.", frappe.ValidationError)
    summary = change_summary(doc.change, doc.count, doc.designation, doc.new_grade)
    dept = frappe.get_doc("Department", doc.department)
    plan = None
    if doc.state == WAIT_ED:
        if not _roles() & {ED_ROLE, "System Manager"}:
            frappe.throw("Only the Executive Director can decide this.", frappe.PermissionError)
        if key != "approve":
            doc.db_set({"state": SENT_BACK, "ed_decided_by": me, "decision_note": note})
        elif doc.council_required:
            doc.db_set({"state": WAIT_COUNCIL, "ed_decided_by": me})
            _close(name)
            secretaries = _users_with(COUNCIL_ROLE, [doc.owner, me])
            _route(doc, secretaries, None)
            dept.add_comment("Comment", f"Establishment change {name} ({summary}) approved by the Executive Director ({me}); now with the Council HR & Remuneration Committee.")
            return _result(name, action, WAIT_COUNCIL)
        else:
            doc.db_set({"ed_decided_by": me})
            plan = _apply(doc)
            doc.db_set({"state": APPROVED, "staffing_plan": plan, "decision_note": note or None})
    else:
        if not _roles() & {COUNCIL_ROLE, "System Manager"}:
            frappe.throw("Only the Board Secretary records the Council's decision.", frappe.PermissionError)
        if doc.ed_decided_by == me:
            frappe.throw("You decided this as Executive Director, so someone else must record the Council's decision.", frappe.PermissionError)
        if key == "approve":
            if not note:
                frappe.throw("Give the Council minute reference.", frappe.ValidationError)
            plan = _apply(doc)
            doc.db_set({"state": APPROVED, "staffing_plan": plan, "council_reference": note})
        else:
            doc.db_set({"state": NOT_APPROVED, "decision_note": note})
    state = doc.state
    dept.add_comment("Comment", f"Establishment change {name} ({summary}): {state.lower()} by {me}." + (f" Note: {note}" if note else ""))
    _close(name)
    return _result(name, action, state)


def _close(name: str) -> None:
    import frappe

    for row in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": name, "status": "Open"}, fields=["name"]):
        frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")


def _result(name: str, action: str, state: str) -> dict[str, Any]:
    return {"ok": True, "doctype": DOCTYPE, "name": name, "action": action, "workflow_action": None, "status": state, "message": f"{DOCTYPE}: {state}"}


def counts() -> dict[str, int]:
    """Totals for the Overview and the Board pack (no names)."""
    keys = ("approved", "frozen", "filled", "in_recruitment", "vacant")
    totals = {k: 0 for k in keys}
    for (dept, desig), base in approved_posts().items():
        p = _post(dept, desig, base)
        for k in keys:
            totals[k] += p[k]
    return totals


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def establishment() -> dict[str, Any]:
    return establishment_impl()


@_whitelist
def department(department: str) -> dict[str, Any]:
    return department_impl(department)


@_whitelist
def change_detail(name: str) -> dict[str, Any]:
    return detail_impl(name)


@_whitelist
def request_change(department: str, designation: str, change: str, reason: str, count: Any = None, new_grade: str | None = None, cost_note: str | None = None, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return prepare_impl(department, designation, change, reason, count, new_grade, cost_note)
