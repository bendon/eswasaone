"""
Contract renewal or conversion (screen H2a "Contract"; follows R-H2).

HRMS has no DocType for this, so HR prepares a ``Contract Change`` (renew to a new end date, or make
permanent). Every HR Manager except the preparer gets an approval ToDo (``eswasa_approval_handlers``).
Approving updates ``Employee.contract_end_date`` / ``employment_type`` straight away and closes the R-H2
alert; sending back needs a note and keeps the request on record. Letting a contract end is a separation
(lifecycle.py, reason "End of fixed-term contract").

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any

DOCTYPE = "Contract Change"
KINDS = ("Renew", "Make permanent")
WAITING, DONE, SENT_BACK = "Waiting for approval", "Done", "Sent back"


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def change_errors(kind: str, current_end: Any, new_end: Any, current_type: str | None, new_type: str | None, reason: str | None, day: date) -> list[str]:
    errs = []
    if kind not in KINDS:
        errs.append("Choose renew or make permanent.")
    if not (reason or "").strip():
        errs.append("Say why.")
    if kind == "Renew":
        end, cur = _d(new_end), _d(current_end)
        if not end:
            errs.append("Choose the new end date.")
        elif end <= (cur or day):
            errs.append("The new end date must be after the current one.")
    if kind == "Make permanent":
        if not (new_type or "").strip():
            errs.append("Choose the permanent employment type.")
        elif new_type == current_type:
            errs.append("This person already has that employment type.")
    return errs


def change_title(kind: str, employee_name: str, new_end: Any) -> str:
    if kind == "Renew":
        e = _d(new_end)
        return f"Approve contract renewal: {employee_name}, to {e.day} {e.strftime('%b %Y')}" if e else f"Approve contract renewal: {employee_name}"
    return f"Approve permanent contract: {employee_name}"


def employee_update(kind: str, new_end: Any, new_type: str | None) -> dict[str, Any]:
    """Employee fields to set once approved."""
    if kind == "Renew":
        return {"contract_end_date": str(_d(new_end))}
    return {"employment_type": new_type, "contract_end_date": None}


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _employee(employee: str) -> dict[str, Any]:
    import frappe

    e = frappe.db.get_value("Employee", employee, ["name", "employee_name", "status", "user_id", "employment_type", "contract_end_date"], as_dict=True)
    if not e:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    return dict(e)


def _row(r: dict[str, Any]) -> dict[str, Any]:
    changes = [{"property": "Type", "current": "", "new": r["kind"]}]
    if r["kind"] == "Renew":
        changes.append({"property": "Contract end", "current": str(r["current_end_date"] or ""), "new": str(r["new_end_date"] or "")})
    else:
        changes.append({"property": "Employment type", "current": r.get("current_employment_type") or "", "new": r.get("new_employment_type") or ""})
    return {"id": r["name"], "kind": "contract", "date": str(r["creation"])[:10] if r.get("creation") else None, "state": r["state"], "changes": changes}


def items_for(employee: str) -> list[dict[str, Any]]:
    """Contract changes for one person, in the lifecycle History shape."""
    import frappe

    if not frappe.db.exists("DocType", DOCTYPE):
        return []
    rows = frappe.get_all(
        DOCTYPE,
        filters={"employee": employee},
        fields=["name", "kind", "state", "current_end_date", "new_end_date", "current_employment_type", "new_employment_type", "creation"],
        order_by="creation desc",
        limit=20,
    )
    return [_row(dict(r)) for r in rows]


def defaults_impl(employee: str) -> dict[str, Any]:
    import frappe

    from eswasa_hr.lifecycle import _require_hr

    _require_hr()
    e = _employee(employee)
    types = [t["name"] for t in frappe.get_all("Employment Type", fields=["name"], order_by="name asc", limit=0)]
    pending = frappe.db.exists(DOCTYPE, {"employee": employee, "state": WAITING}) if frappe.db.exists("DocType", DOCTYPE) else None
    return {
        "employee": employee,
        "employee_name": e["employee_name"],
        "employment_type": e.get("employment_type"),
        "contract_end_date": str(e["contract_end_date"]) if e.get("contract_end_date") else None,
        "employment_types": types,
        "pending": pending or None,
    }


def prepare_impl(employee: str, kind: str, new_end: str | None, new_type: str | None, reason: str) -> dict[str, Any]:
    import frappe
    from frappe.utils import add_days

    from eswasa_hr.lifecycle import _require_hr, _route, changes_impl

    _require_hr()
    e = _employee(employee)
    if e["status"] != "Active":
        frappe.throw("Only an active employee's contract can change.", frappe.ValidationError)
    if frappe.db.exists(DOCTYPE, {"employee": employee, "state": WAITING}):
        frappe.throw("A contract change is already waiting for approval for this person.", frappe.ValidationError)
    errs = change_errors(kind, e.get("contract_end_date"), new_end, e.get("employment_type"), new_type, reason, _today())
    if kind == "Make permanent" and new_type and not frappe.db.exists("Employment Type", new_type):
        errs.append("That employment type doesn't exist.")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    d = frappe.get_doc(
        {
            "doctype": DOCTYPE,
            "employee": employee,
            "employee_name": e["employee_name"],
            "kind": kind,
            "current_end_date": e.get("contract_end_date"),
            "new_end_date": new_end if kind == "Renew" else None,
            "current_employment_type": e.get("employment_type"),
            "new_employment_type": new_type if kind == "Make permanent" else None,
            "reason": reason.strip(),
            "state": WAITING,
        }
    )
    d.insert(ignore_permissions=True)
    _route(d, change_title(kind, e["employee_name"], new_end), add_days(_today(), 3))
    return changes_impl(employee)


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler: an HR Manager who neither prepared it nor is the person."""
    import frappe

    from eswasa_hr.alerts import close_for
    from eswasa_hr.lifecycle import _close

    doc = frappe.get_doc(DOCTYPE, name)
    if not set(frappe.get_roles()) & {"HR Manager", "System Manager"}:
        frappe.throw("Only an HR Manager can approve this.", frappe.PermissionError)
    if doc.owner == frappe.session.user:
        frappe.throw("You prepared this, so another HR Manager must approve it.", frappe.PermissionError)
    if frappe.db.get_value("Employee", doc.employee, "user_id") == frappe.session.user:
        frappe.throw("You can't approve a change to your own contract.", frappe.PermissionError)
    if doc.state != WAITING:
        frappe.throw("This was already decided.", frappe.ValidationError)
    key = (action or "").strip().lower()
    note = (comment or "").strip()
    emp = frappe.get_doc("Employee", doc.employee)
    if key == "approve":
        frappe.db.set_value("Employee", doc.employee, employee_update(doc.kind, doc.new_end_date, doc.new_employment_type), update_modified=True)
        doc.db_set({"state": DONE, "approved_by": frappe.session.user})
        what = f"renewed to {doc.new_end_date}" if doc.kind == "Renew" else f"made {doc.new_employment_type}"
        emp.add_comment("Comment", f"Contract {what} ({name}), approved by {frappe.session.user}. Reason: {doc.reason}")
        close_for(doc.employee, "R-H2")
        state = DONE
    elif key in ("reject", "return"):
        if not note:
            frappe.throw("Say why, so HR can correct it.", frappe.ValidationError)
        doc.db_set({"state": SENT_BACK})
        emp.add_comment("Comment", f"{DOCTYPE} {name} sent back by {frappe.session.user}: {note}")
        state = SENT_BACK
    else:
        frappe.throw("Approve or send back.", frappe.ValidationError)
    _close(DOCTYPE, name)
    return {"ok": True, "doctype": DOCTYPE, "name": name, "action": action, "workflow_action": None, "status": state, "message": f"{DOCTYPE}: {state}"}


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def defaults(employee: str) -> dict[str, Any]:
    return defaults_impl(employee)


@_whitelist
def prepare(employee: str, kind: str, reason: str, new_end: str | None = None, new_type: str | None = None, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return prepare_impl(employee, kind, new_end, new_type, reason)
