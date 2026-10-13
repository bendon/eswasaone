"""
Items issued to staff and offboarding clearance (additions plan 02; screens H19, E11, record Items tab).

HR records what a person holds (laptop, phone, access card, vehicle, PPE, equipment) as an ``HR Issued Item``.
The holder gets a do card in Approvals ("Acknowledge receipt of …"); marking it done records the acknowledgement.
HR, or the line manager for their reports, takes an item back. Only an HR Manager can mark one lost or written
off, with a note.

Clearance: when HR prepares a leaver, the offboarding checklist gains "Return issued items (n)" owned by HR, and
that task can't be ticked while anything is still out. On the last day, items still out raise one alert to the
HR Managers and the line manager ("Items not returned"); the daily job repeats the check for leavers, once.

Item types come from ``HR Settings.custom_issued_item_types`` (one per line). The list is ESWASA's to supply
(A2); until it exists nothing can be issued. The optional ``asset`` link points at ERPNext Asset when Finance
tracks the item there; HR never writes to Asset.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable

DOCTYPE = "HR Issued Item"
TYPES_FIELD = "custom_issued_item_types"
HR_ROLES = ("HR Manager", "HR User", "System Manager")
MANAGER_ROLES = ("HR Manager", "System Manager")
ISSUED, ACKNOWLEDGED, RETURNED, LOST, WRITTEN_OFF = "Issued", "Acknowledged", "Returned", "Lost", "Written off"
OUT = (ISSUED, ACKNOWLEDGED)
OUTCOMES = (RETURNED, LOST, WRITTEN_OFF)
CLEARANCE_ACTIVITY = "Return issued items"
ALERT_RULE = "Items not returned"
AWAITING = "Add item types in HR setup first (awaiting ESWASA A2)."


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def parse_types(raw: Any) -> list[str]:
    """HR Settings list, one type per line (commas tolerated), blanks and repeats dropped, order kept."""
    out: list[str] = []
    for part in str(raw or "").replace(",", "\n").splitlines():
        t = part.strip()
        if t and t not in out:
            out.append(t)
    return out


def issue_errors(item_type: str | None, types: list[str], employee_status: str | None) -> list[str]:
    if not types:
        return [AWAITING]
    errs = []
    if employee_status != "Active":
        errs.append("Only an active employee can be issued an item.")
    if (item_type or "").strip() not in types:
        errs.append("Choose an item type from the HR setup list.")
    return errs


def return_errors(status: str | None, outcome: str = RETURNED, note: str | None = None, hr_manager: bool = False) -> list[str]:
    if status not in OUT:
        return ["Only an item that is still out can be returned."]
    if outcome not in OUTCOMES:
        return ["Choose returned, lost or written off."]
    errs = []
    if outcome != RETURNED:
        if not hr_manager:
            errs.append("Only an HR Manager can mark an item lost or written off.")
        if not (note or "").strip():
            errs.append("Say what happened to it.")
    return errs


def outstanding(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in rows if r.get("status") in OUT]


def label(row: dict[str, Any]) -> str:
    return " ".join(x for x in (row.get("item_type"), row.get("tag")) if x) or row.get("name") or "item"


def clearance_blocked(rows: Iterable[dict[str, Any]]) -> str | None:
    """Why the clearance task can't be ticked, or None when everything is back."""
    out = outstanding(rows)
    if not out:
        return None
    n = len(out)
    return f"{n} item{'s are' if n != 1 else ' is'} still out: {', '.join(label(r) for r in out)}."


def is_overdue(row: dict[str, Any], day: date) -> bool:
    due = _d(row.get("return_due"))
    return row.get("status") in OUT and due is not None and due < day


def clearance_activity(n: int) -> str:
    return f"{CLEARANCE_ACTIVITY} ({n})"


def is_clearance_activity(name: str | None) -> bool:
    return str(name or "").startswith(CLEARANCE_ACTIVITY)


def acknowledge_title(item_type: str, tag: str | None) -> str:
    return f"Acknowledge receipt of {item_type}" + (f" {tag}" if tag else "")


def alert_title(employee_name: str, rows: list[dict[str, Any]]) -> str:
    n = len(rows)
    return f"Items not returned: {employee_name} has left with {n} item{'s' if n != 1 else ''} out ({', '.join(label(r) for r in rows)})"


def alert_key(employee: str) -> str:
    return f"items:{employee}:lastday"


# ---------------------------------------------------------------- Frappe glue


FIELDS = ["name", "employee", "employee_name", "department", "item_type", "description", "tag", "asset", "issued_on", "issued_by",
          "condition_out", "acknowledged_on", "return_due", "returned_on", "received_by", "condition_in", "note", "status"]


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _roles() -> set[str]:
    import frappe

    return set(frappe.get_roles())


def _is_hr() -> bool:
    return bool(_roles() & set(HR_ROLES))


def _require_hr() -> None:
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can do this.", frappe.PermissionError)


def _has_doctype() -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", DOCTYPE))


def types() -> list[str]:
    from eswasa_hr.settings import _raw

    return parse_types(_raw(TYPES_FIELD))


def _row(r: dict[str, Any], day: date | None = None) -> dict[str, Any]:
    day = day or _today()
    out = {k: (str(r[k]) if k in ("issued_on", "acknowledged_on", "return_due", "returned_on") and r.get(k) else r.get(k)) for k in FIELDS}
    out["overdue"] = is_overdue(r, day)
    return out


def _rows(filters: dict[str, Any], order_by: str = "issued_on desc") -> list[dict[str, Any]]:
    import frappe

    if not _has_doctype():
        return []
    return [dict(r) for r in frappe.get_all(DOCTYPE, filters=filters, fields=FIELDS, order_by=order_by, limit=0)]


def _employee(employee: str) -> dict[str, Any]:
    import frappe

    e = frappe.db.get_value("Employee", employee, ["name", "employee_name", "status", "department", "user_id", "reports_to"], as_dict=True)
    if not e:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    return dict(e)


def _manages(employee: str) -> bool:
    from eswasa_hr.scope import viewer_for

    return employee in viewer_for().reports


def _require_see(employee: str) -> None:
    import frappe

    from eswasa_hr.scope import viewer_for

    if _is_hr():
        return
    if employee not in viewer_for().people:
        frappe.throw("You can't see this person's items.", frappe.PermissionError)


def _close_todos(name: str) -> None:
    import frappe

    for t in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": name, "status": "Open"}, fields=["name"], limit=0):
        frappe.db.set_value("ToDo", t["name"], "status", "Closed")


def outstanding_for(employee: str) -> list[dict[str, Any]]:
    return _rows({"employee": employee, "status": ["in", list(OUT)]}, "issued_on asc")


def types_impl() -> dict[str, Any]:
    t = types()
    return {"types": t, "awaiting": None if t else "A2"}


def register_impl(status: str | None = None, item_type: str | None = None, department: str | None = None, overdue: Any = None) -> dict[str, Any]:
    """H19: every item, HR only. ``status`` "out" means Issued or Acknowledged."""
    _require_hr()
    day = _today()
    filters: dict[str, Any] = {}
    if status == "out":
        filters["status"] = ["in", list(OUT)]
    elif status:
        filters["status"] = status
    if item_type:
        filters["item_type"] = item_type
    if department:
        filters["department"] = department
    rows = [_row(r, day) for r in _rows(filters)]
    if str(overdue or "").lower() in ("1", "true", "yes"):
        rows = [r for r in rows if r["overdue"]]
    return {"items": rows, "types": types(), "out": sum(1 for r in rows if r["status"] in OUT), "overdue": sum(1 for r in rows if r["overdue"])}


def employee_items_impl(employee: str) -> dict[str, Any]:
    """Record Items tab: HR, the line manager (direct or indirect) and the person."""
    _require_see(employee)
    e = _employee(employee)
    day = _today()
    rows = [_row(r, day) for r in _rows({"employee": employee})]
    return {
        "employee": employee,
        "employee_name": e["employee_name"],
        "items": rows,
        "types": types(),
        "can_issue": _is_hr(),
        "can_return": _is_hr() or _manages(employee),
        "can_write_off": bool(_roles() & set(MANAGER_ROLES)),
    }


def issue_impl(employee: str, item_type: str, description: str | None = None, tag: str | None = None, condition_out: str | None = None,
               return_due: str | None = None, asset: str | None = None) -> dict[str, Any]:
    import frappe

    _require_hr()
    e = _employee(employee)
    errs = issue_errors(item_type, types(), e["status"])
    if asset and not frappe.db.exists("Asset", asset):
        errs.append("That asset isn't in Finance's asset register.")
    if return_due and _d(return_due) and _d(return_due) < _today():
        errs.append("The return date can't be in the past.")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    d = frappe.get_doc(
        {
            "doctype": DOCTYPE,
            "employee": employee,
            "employee_name": e["employee_name"],
            "department": e.get("department"),
            "item_type": item_type.strip(),
            "description": (description or "").strip() or None,
            "tag": (tag or "").strip() or None,
            "asset": asset or None,
            "issued_on": _today().isoformat(),
            "issued_by": frappe.session.user,
            "condition_out": (condition_out or "").strip() or None,
            "return_due": return_due or None,
            "status": ISSUED,
        }
    )
    d.insert(ignore_permissions=True)
    if e.get("user_id"):
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": e["user_id"],
                "description": acknowledge_title(d.item_type, d.tag),
                "reference_type": DOCTYPE,
                "reference_name": d.name,
                "status": "Open",
                "priority": "Medium",
                "assigned_by": frappe.session.user,
                "date": _today().isoformat(),
            }
        ).insert(ignore_permissions=True)
    return employee_items_impl(employee)


def acknowledge_impl(name: str) -> dict[str, Any]:
    """The holder confirms they received the item (own record only)."""
    import frappe

    r = frappe.db.get_value(DOCTYPE, name, ["name", "employee", "status"], as_dict=True)
    if not r:
        frappe.throw("Item not found.", frappe.DoesNotExistError)
    holder = frappe.db.get_value("Employee", r["employee"], "user_id")
    if not holder or holder != frappe.session.user:
        frappe.throw("Only the person holding the item can acknowledge it.", frappe.PermissionError)
    if r["status"] != ISSUED:
        frappe.throw("This item was already acknowledged or returned.", frappe.ValidationError)
    frappe.db.set_value(DOCTYPE, name, {"status": ACKNOWLEDGED, "acknowledged_on": _today().isoformat()})
    _close_todos(name)
    return my_items_impl()


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler for the do card: Done records the acknowledgement."""
    import frappe

    if (action or "").strip().lower() not in ("approve", "done", "acknowledge"):
        frappe.throw("Acknowledge receipt of the item.", frappe.ValidationError)
    acknowledge_impl(name)
    return {"ok": True, "doctype": DOCTYPE, "name": name, "action": action, "workflow_action": None, "status": ACKNOWLEDGED, "message": "Item acknowledged"}


def return_impl(name: str, outcome: str = RETURNED, condition_in: str | None = None, note: str | None = None) -> dict[str, Any]:
    """HR, or the line manager for their reports. Lost and written off need an HR Manager and a note."""
    import frappe

    from eswasa_hr.alerts import close_for

    r = frappe.db.get_value(DOCTYPE, name, ["name", "employee", "status"], as_dict=True)
    if not r:
        frappe.throw("Item not found.", frappe.DoesNotExistError)
    if not (_is_hr() or _manages(r["employee"])):
        frappe.throw("Only HR or the person's line manager can take an item back.", frappe.PermissionError)
    outcome = outcome or RETURNED
    errs = return_errors(r["status"], outcome, note, bool(_roles() & set(MANAGER_ROLES)))
    if errs:
        exc = frappe.PermissionError if errs[0].startswith("Only an HR Manager") else frappe.ValidationError
        frappe.throw(" ".join(errs), exc)
    changes: dict[str, Any] = {"status": outcome, "note": (note or "").strip() or None}
    if outcome == RETURNED:
        changes.update({"returned_on": _today().isoformat(), "received_by": frappe.session.user, "condition_in": (condition_in or "").strip() or None})
    frappe.db.set_value(DOCTYPE, name, changes)
    _close_todos(name)
    if not outstanding_for(r["employee"]):
        close_for(r["employee"], ALERT_RULE)
    return employee_items_impl(r["employee"])


def my_items_impl() -> dict[str, Any]:
    import frappe

    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not emp:
        return {"employee": None, "items": [], "waiting": 0}
    day = _today()
    rows = [_row(r, day) for r in _rows({"employee": emp})]
    return {"employee": emp, "items": rows, "waiting": sum(1 for r in rows if r["status"] == ISSUED)}


# ---------------------------------------------------------------- offboarding hooks (lifecycle, onboarding)


def separation_activity(employee: str, hr_user: str | None) -> dict[str, Any] | None:
    """The clearance activity for a leaver's checklist, owned by HR, when anything is out."""
    n = len(outstanding_for(employee))
    if not n:
        return None
    return {"activity_name": clearance_activity(n), "group": "HR", "user": hr_user}


def clearance_error(employee: str | None, activity_name: str | None) -> str | None:
    """Why this offboarding task can't be ticked yet (only the clearance activity is checked)."""
    if not employee or not is_clearance_activity(activity_name):
        return None
    return clearance_blocked(outstanding_for(employee))


def offboarding_items(detail: dict[str, Any]) -> dict[str, Any]:
    """The offboarding detail with the items still out, and on the clearance task why it can't be ticked."""
    rows = outstanding_for(detail["employee"]) if detail.get("employee") else []
    day = _today()
    blocked = clearance_blocked(rows)
    for a in detail.get("activities") or []:
        if is_clearance_activity(a.get("activity_name")) and a.get("status") not in ("Completed", "Cancelled"):
            a["blocked"] = blocked
    return {**detail, "items_out": [_row(r, day) for r in rows]}


def last_day_alert(employee: str, employee_name: str | None = None, manager_user: str | None = None) -> int:
    """Items still out when the person leaves: one alert to the HR Managers and the line manager."""
    from eswasa_hr.alerts import raise_alert, recipients
    from eswasa_hr.recruitment import _hr_manager_users

    rows = outstanding_for(employee)
    if not rows:
        return 0
    return raise_alert(alert_key(employee), ALERT_RULE, alert_title(employee_name or employee, rows), recipients(_hr_manager_users(), manager_user),
                       _today().isoformat(), employee=employee, subject=("Employee", employee))


def on_last_day(e: dict[str, Any], manager_user: str | None) -> int:
    """Called by ``lifecycle.process_last_days`` before the leaver's ToDos move: acknowledgement cards are
    closed (a manager can't acknowledge for them) and the alert is raised if items are still out."""
    import frappe

    if not _has_doctype():
        return 0
    if e.get("user_id"):
        for t in frappe.get_all("ToDo", filters={"allocated_to": e["user_id"], "reference_type": DOCTYPE, "status": "Open"}, fields=["name"], limit=0):
            frappe.db.set_value("ToDo", t["name"], "status", "Cancelled")
    return last_day_alert(e["name"], e.get("employee_name"), manager_user)


def items_not_returned() -> int:
    """Daily: every leaver whose last day has passed with items still out has the alert, once."""
    import frappe

    if not _has_doctype():
        return 0
    day = _today()
    n = 0
    holders = {r["employee"] for r in _rows({"status": ["in", list(OUT)]})}
    for emp in sorted(holders):
        e = frappe.db.get_value("Employee", emp, ["name", "employee_name", "status", "relieving_date", "reports_to"], as_dict=True)
        if not e or not (e.get("status") == "Left" or (_d(e.get("relieving_date")) and _d(e.get("relieving_date")) <= day)):
            continue
        manager_user = frappe.db.get_value("Employee", e["reports_to"], "user_id") if e.get("reports_to") else None
        n += last_day_alert(emp, e.get("employee_name"), manager_user)
    return n


def setup_step() -> dict[str, Any]:
    """HR setup: the item type list ESWASA supplies (A2)."""
    from eswasa_hr.overview import AWAITING as AWAIT_STATE, DONE, step

    t = types()
    if t:
        return step("item_types", "Item types", DONE, f"{len(t)} item types staff can be issued: {', '.join(t[:4])}{'…' if len(t) > 4 else ''}.", "hr-settings", desk=True)
    return step("item_types", "Item types", AWAIT_STATE, "Awaiting ESWASA (A2): which items are issued to staff. Nothing can be issued until the list exists.",
                "hr-settings", awaiting="A2", desk=True)


# ---------------------------------------------------------------- permission hooks (hooks.py)


def query(user: str | None = None, doctype: str | None = None) -> str:
    """HR sees every item; others their own and their reports' (narrowing only)."""
    import frappe

    from eswasa_hr.scope import _in, viewer_for

    v = viewer_for(user)
    if v.hr:
        return ""
    return _in(f"`tab{DOCTYPE}`.`employee`", v.people, frappe.db.escape)


def has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    from eswasa_hr.scope import viewer_for

    v = viewer_for(user)
    if v.hr:
        return True
    employee = doc.get("employee") if isinstance(doc, dict) else getattr(doc, "employee", None)
    if not employee:
        return False
    if ptype not in (None, "read", "print", "email", "export", "report"):
        return False  # writes go through the methods below
    return employee in v.people


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


def _confirm(confirm: Any) -> None:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)


@_whitelist
def register(status: str | None = None, item_type: str | None = None, department: str | None = None, overdue: Any = None) -> dict[str, Any]:
    return register_impl(status, item_type, department, overdue)


@_whitelist
def item_types() -> dict[str, Any]:
    return types_impl()


@_whitelist
def employee_items(employee: str) -> dict[str, Any]:
    return employee_items_impl(employee)


@_whitelist
def issue(employee: str, item_type: str, description: str | None = None, tag: str | None = None, condition_out: str | None = None,
          return_due: str | None = None, asset: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return issue_impl(employee, item_type, description, tag, condition_out, return_due, asset)


@_whitelist
def return_item(name: str, outcome: str = RETURNED, condition_in: str | None = None, note: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return return_impl(name, outcome, condition_in, note)


@_whitelist
def my_items() -> dict[str, Any]:
    return my_items_impl()


@_whitelist
def acknowledge(name: str, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return acknowledge_impl(name)
