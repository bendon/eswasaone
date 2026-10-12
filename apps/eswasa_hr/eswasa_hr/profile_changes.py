"""
Profile change requests (plan 06, E5 My details): staff ask HR to correct their own record.

Only a short list of fields can be asked for: personal contact details (level 1 in ``sensitive.LEVELS``) and the
spelling of the name, which needs evidence. Job fields change through promotion and transfer, and pay and bank
fields only through an HR Manager, so they are refused here.

The request goes to every named HR Manager and HR User except the person (one ToDo each) and is decided in
Approvals (``eswasa_approval_handlers``) by someone other than the requester. Approval writes the field and
records an ``HR Access Log`` row ("Profile change {name}"), the same log protected views use.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any, Iterable

DOCTYPE = "Profile Change Request"
DECIDERS = ("HR Manager", "HR User", "System Manager")
PENDING, APPROVED, REJECTED = "Pending", "Approved", "Rejected"
# Field → label. Level 1 personal fields (sensitive.LEVELS[1]) and the name parts.
PERSONAL = {
    "current_address": "Current address",
    "permanent_address": "Permanent address",
    "personal_email": "Personal email",
    "cell_number": "Mobile",
    "person_to_be_contacted": "Emergency contact",
    "relation": "Emergency contact relationship",
    "emergency_phone_number": "Emergency phone",
    "marital_status": "Marital status",
}
NAME = {"first_name": "First name", "middle_name": "Middle name", "last_name": "Last name"}
ALLOWED = {**PERSONAL, **NAME}
# Changed by promotion, transfer, contract change or HR directly; never by request.
JOB = ("employee_name", "department", "designation", "grade", "branch", "reports_to", "employment_type", "status",
       "date_of_joining", "relieving_date", "contract_end_date", "company_email", "user_id", "leave_approver", "employee_number")


# ---------------------------------------------------------------- pure rules


def _pay_fields() -> set[str]:
    from eswasa_hr.sensitive import LEVELS, PAY

    return {f for f, _ in LEVELS[PAY]["fields"]}


def field_error(field: str | None) -> str | None:
    if field in ALLOWED:
        return None
    if field in _pay_fields():
        return "Pay and bank details are changed by an HR Manager through a separate process, not by request."
    if field in JOB:
        return "Job details change through a promotion, transfer or contract change, not a correction request."
    return "This detail can't be changed by request. Ask HR."


def request_errors(field: str | None, requested: str | None, reason: str | None, evidence: str | None, current: Any) -> list[str]:
    err = field_error(field)
    if err:
        return [err]
    errs = []
    new = (requested or "").strip()
    if not new:
        errs.append("Say what it should be.")
    elif new == str(current or "").strip():
        errs.append("That's what your record already says.")
    if not (reason or "").strip():
        errs.append("Say why it needs changing.")
    if field in NAME and not (evidence or "").strip():
        errs.append("A change to your name needs evidence, such as your ID or a marriage certificate.")
    return errs


def decider_error(user: str, roles: Iterable[str], requester: str | None, employee_user: str | None) -> str | None:
    if not set(roles or ()) & set(DECIDERS):
        return "Only HR can decide profile changes."
    if user in {requester, employee_user} - {None}:
        return "This is your own request, so someone else in HR must decide it."
    return None


def todo_title(employee_name: str, label: str) -> str:
    return f"Review profile change for {employee_name}: {label.lower()}"


def log_reason(name: str) -> str:
    return f"Profile change {name}"


def to_api(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r.get("name"),
        "employee": r.get("employee"),
        "employee_name": r.get("employee_name"),
        "field": r.get("field"),
        "field_label": ALLOWED.get(r.get("field") or "", r.get("field")),
        "current_value": r.get("current_value"),
        "requested_value": r.get("requested_value"),
        "reason": r.get("reason"),
        "has_evidence": bool(r.get("evidence")),
        "status": r.get("status") or PENDING,
        "decided_by": r.get("decided_by"),
        "note": r.get("note"),
        "requested_on": str(r.get("creation"))[:10] if r.get("creation") else None,
    }


# ---------------------------------------------------------------- Frappe glue


def _me() -> dict[str, Any]:
    import frappe

    e = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, ["name", "employee_name", "user_id"], as_dict=True)
    if not e:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    return dict(e)


def _rows(filters: dict[str, Any]) -> list[dict[str, Any]]:
    import frappe

    if not frappe.db.exists("DocType", DOCTYPE):
        return []
    return frappe.get_all(
        DOCTYPE,
        filters=filters,
        fields=["name", "employee", "employee_name", "field", "current_value", "requested_value", "reason", "evidence", "status", "decided_by", "note", "creation"],
        order_by="creation desc",
        limit=100,
    )


def mine_impl() -> list[dict[str, Any]]:
    return [to_api(r) for r in _rows({"employee": _me()["name"]})]


def submit_impl(field: str, requested_value: str, reason: str, evidence: str | None = None) -> dict[str, Any]:
    import frappe
    from frappe.utils import add_days, nowdate

    from eswasa_hr.documents import hr_people

    me = _me()
    if field_error(field):
        frappe.throw(field_error(field), frappe.ValidationError)
    current = frappe.db.get_value("Employee", me["name"], field)
    errs = request_errors(field, requested_value, reason, evidence, current)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    if frappe.db.exists(DOCTYPE, {"employee": me["name"], "field": field, "status": PENDING}):
        frappe.throw("You already asked to change this. Wait for HR to decide it.", frappe.ValidationError)
    values = {
        "doctype": DOCTYPE,
        "employee": me["name"],
        "employee_name": me["employee_name"],
        "field": field,
        "current_value": None if current in (None, "") else str(current),
        "requested_value": requested_value.strip(),
        "reason": reason.strip(),
        "evidence": (evidence or "").strip() or None,
        "status": PENDING,
    }
    doc = frappe.get_doc(values)
    doc.insert(ignore_permissions=True)
    title = todo_title(me["employee_name"], ALLOWED[field])
    for user in hr_people(exclude=frappe.session.user):
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
                "date": add_days(nowdate(), 3),  # provisional 3-day SLA (registry hr_profile_change_request)
            }
        ).insert(ignore_permissions=True)
    return to_api({**values, "name": doc.name})


def _apply(doc: Any) -> None:
    """Write the field and log it. Runs inside the Approvals handler with the decider's rights checked above."""
    import frappe
    from frappe.utils import now_datetime

    from eswasa_hr.sensitive import LEVELS, LOG, PERSONAL, _ip

    emp = frappe.get_doc("Employee", doc.employee)
    setattr(emp, doc.field, doc.requested_value)
    emp.flags.ignore_permissions = True
    emp.save()
    if frappe.db.exists("DocType", LOG):
        frappe.get_doc(
            {
                "doctype": LOG,
                "employee": doc.employee,
                "employee_name": emp.employee_name,
                "viewer": frappe.session.user,
                "level": LEVELS[PERSONAL]["label"],
                "fields": doc.field,
                "reason": log_reason(doc.name),
                "ip_address": _ip(),
                "viewed_on": now_datetime(),
            }
        ).insert(ignore_permissions=True)


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler: HR other than the person approves (field written, access logged) or rejects with a reason."""
    import frappe

    doc = frappe.get_doc(DOCTYPE, name)
    employee_user = frappe.db.get_value("Employee", doc.employee, "user_id")
    err = decider_error(frappe.session.user, frappe.get_roles(), doc.owner, employee_user)
    if err:
        frappe.throw(err, frappe.PermissionError)
    if (doc.status or PENDING) != PENDING:
        frappe.throw("This was already decided.", frappe.ValidationError)
    key = (action or "").strip().lower()
    note = (comment or "").strip()
    if key == "approve":
        _apply(doc)
        state = APPROVED
    elif key in ("reject", "return"):
        if not note:
            frappe.throw("Say why, so the person knows what to do next.", frappe.ValidationError)
        state = REJECTED
    else:
        frappe.throw("Approve or reject.", frappe.ValidationError)
    frappe.db.set_value(DOCTYPE, name, {"status": state, "decided_by": frappe.session.user, "note": note or None})
    for t in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": name, "status": "Open"}, fields=["name"], limit=0):
        frappe.db.set_value("ToDo", t["name"], "status", "Closed")
    return {"ok": True, "doctype": DOCTYPE, "name": name, "action": action, "workflow_action": None, "status": state, "message": f"Profile change: {state}"}


def has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    """Desk: HR and the person only."""
    import frappe

    user = user or frappe.session.user
    if set(frappe.get_roles(user)) & set(DECIDERS):
        return True
    employee = doc.get("employee") if isinstance(doc, dict) else getattr(doc, "employee", None)
    return bool(employee) and frappe.db.get_value("Employee", employee, "user_id") == user


def query(user: str | None = None, doctype: str | None = None) -> str:
    import frappe

    user = user or frappe.session.user
    if set(frappe.get_roles(user)) & set(DECIDERS):
        return ""
    return f"`tab{DOCTYPE}`.`employee` in (select `name` from `tabEmployee` where `user_id` = {frappe.db.escape(user)})"


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def mine() -> list[dict[str, Any]]:
    return mine_impl()


@_whitelist
def submit(field: str, requested_value: str = "", reason: str = "", evidence: str | None = None, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return submit_impl(field, requested_value, reason, evidence)
