"""
Profile change requests (plan 06, E5 My details): staff ask HR to correct their own record.

Only a short list of fields can be asked for: personal contact details (level 1 in ``sensitive.LEVELS``) and the
spelling of the name, which needs evidence. Job fields change through promotion and transfer, and pay and bank
fields only through an HR Manager, so they are refused here.

HR additions plan 04: the medical aid fields and the dependants table (level 3, family and medical) can be asked
for too. ``kind`` is ``field`` (one field) or ``dependant_add`` / ``dependant_update`` / ``dependant_remove`` with a
``row``. Adding a dependant or changing medical aid needs evidence; beneficiary shares must stay empty or add up to
100 (a request may rebalance the others' shares in ``row.shares``). Level-3 requests go to, and are decided by,
HR Managers only (the level's roles), and HR Users can't read them in Desk.

The request goes to every named HR Manager and HR User except the person (one ToDo each) and is decided in
Approvals (``eswasa_approval_handlers``) by someone other than the requester. Approval writes the field and
records an ``HR Access Log`` row ("Profile change {name}"), the same log protected views use.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any, Iterable

from eswasa_hr import settings

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
# Plan 04: level 3 medical aid fields (sensitive.LEVELS[3]); a change needs the medical aid card.
MEDICAL = {
    "custom_medical_aid_scheme": "Medical aid scheme",
    "custom_medical_aid_number": "Medical aid number",
    "custom_medical_aid_plan": "Medical aid plan",
    "custom_medical_aid_main_member": "Medical aid main member",
}
CHECKS = ("custom_medical_aid_main_member",)  # requested as "Yes" / "No"
ALLOWED = {**PERSONAL, **NAME, **MEDICAL}
DEPENDANTS_FIELD = "custom_dependants"
FIELD, ADD, UPDATE, REMOVE = "field", "dependant_add", "dependant_update", "dependant_remove"
KINDS = (FIELD, ADD, UPDATE, REMOVE)
DEPENDANT_KEYS = ("full_name", "relationship", "date_of_birth", "id_number", "on_medical_aid", "beneficiary_share", "phone")
FAMILY_DECIDERS = ("HR Manager", "System Manager")  # sensitive.LEVELS[FAMILY]["roles"]; provisional (A5)
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


def shown_value(field: str | None, value: Any) -> str | None:
    if value in (None, ""):
        return None
    if field in CHECKS:
        return "Yes" if str(value).strip().lower() in ("1", "yes", "true") else "No"
    return str(value)


def request_errors(field: str | None, requested: str | None, reason: str | None, evidence: str | None, current: Any) -> list[str]:
    err = field_error(field)
    if err:
        return [err]
    errs = []
    new = (requested or "").strip()
    if not new:
        errs.append("Say what it should be.")
    elif field in CHECKS and new not in ("Yes", "No"):
        errs.append("Choose yes or no.")
    elif new == (shown_value(field, current) or "").strip():
        errs.append("That's what your record already says.")
    if not (reason or "").strip():
        errs.append("Say why it needs changing.")
    if field in NAME and not (evidence or "").strip():
        errs.append("A change to your name needs evidence, such as your ID or a marriage certificate.")
    if field in MEDICAL and not (evidence or "").strip():
        errs.append("A medical aid change needs evidence, such as your medical aid card.")
    return errs


def is_family(field: str | None, kind: str | None = FIELD) -> bool:
    return (kind or FIELD) != FIELD or field in MEDICAL or field == DEPENDANTS_FIELD


def kind_error(kind: str | None) -> str | None:
    return None if (kind or FIELD) in KINDS else "Choose what to change."


def clean_row(row: dict[str, Any] | None) -> dict[str, Any]:
    r = {k: (row or {}).get(k) for k in DEPENDANT_KEYS if (row or {}).get(k) not in (None, "")}
    if "full_name" in r:
        r["full_name"] = str(r["full_name"]).strip()
    if "on_medical_aid" in r:
        r["on_medical_aid"] = 1 if str(r["on_medical_aid"]).strip().lower() in ("1", "yes", "true") else 0
    return r


def apply_rows(rows: list[dict[str, Any]], kind: str, dependant: str | None, row: dict[str, Any] | None,
               shares: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """The dependants table after a request (pure). ``shares`` rebalances other rows: ``{row name: percent}``."""
    out = [dict(r) for r in rows]
    if kind == ADD:
        out.append(clean_row(row))
    elif kind == UPDATE:
        for r in out:
            if r.get("name") == dependant:
                r.update(clean_row({**r, **(row or {})}))
    elif kind == REMOVE:
        out = [r for r in out if r.get("name") != dependant]
    for r in out:
        if r.get("name") in (shares or {}):
            r["beneficiary_share"] = shares[r["name"]]
    return out


def dependant_request_errors(kind: str, rows: list[dict[str, Any]], dependant: str | None, row: dict[str, Any] | None,
                             reason: str | None, evidence: str | None, today: Any, shares: dict[str, Any] | None = None) -> list[str]:
    from eswasa_hr.sensitive import dependant_errors, shares_error

    errs: list[str] = []
    if kind in (UPDATE, REMOVE) and dependant not in {r.get("name") for r in rows}:
        return ["Choose one of your dependants."]
    if kind == ADD and not (evidence or "").strip():
        errs.append("Adding a dependant needs evidence, such as a birth or marriage certificate.")
    after = apply_rows(rows, kind, dependant, row, shares)
    if kind in (ADD, UPDATE):
        target = after[-1] if kind == ADD else next(r for r in after if r.get("name") == dependant)
        errs += dependant_errors(target, today)
    share = shares_error(after)
    if share and not errs:
        errs.append(share + " Change the other beneficiaries' shares in the same request.")
    if not (reason or "").strip():
        errs.append("Say why it needs changing.")
    return errs


def dependant_summary(kind: str, row: dict[str, Any] | None, rows: list[dict[str, Any]], dependant: str | None) -> str:
    current = next((r for r in rows if r.get("name") == dependant), {})
    who = ((row or {}).get("full_name") or current.get("full_name") or "a dependant").strip()
    rel = (row or {}).get("relationship") or current.get("relationship")
    tail = f" ({rel.lower()})" if rel else ""
    return {ADD: f"Add {who}{tail}", UPDATE: f"Change {who}{tail}", REMOVE: f"Remove {who}{tail}"}[kind]


def field_options() -> list[dict[str, Any]]:
    """What a person may ask to correct (E5 picker); a name or medical aid change needs evidence."""
    return [{"field": f, "label": label, "evidence_required": f in NAME or f in MEDICAL} for f, label in ALLOWED.items()]


def decider_error(user: str, roles: Iterable[str], requester: str | None, employee_user: str | None, family: bool = False) -> str | None:
    if not set(roles or ()) & set(DECIDERS):
        return "Only HR can decide profile changes."
    if family and not set(roles or ()) & set(FAMILY_DECIDERS):
        return "Only an HR Manager can decide family and medical changes."
    if user in {requester, employee_user} - {None}:
        return "This is your own request, so someone else in HR must decide it."
    return None


def todo_title(employee_name: str, label: str) -> str:
    # Level-3 values never go in the title: it shows in Approvals and notifications.
    return f"Review profile change for {employee_name}: {label.lower()}"


def log_reason(name: str) -> str:
    return f"Profile change {name}"


def to_api(r: dict[str, Any]) -> dict[str, Any]:
    kind = r.get("kind") or FIELD
    return {
        "id": r.get("name"),
        "employee": r.get("employee"),
        "employee_name": r.get("employee_name"),
        "kind": kind,
        "field": r.get("field"),
        "field_label": "Dependants" if kind != FIELD else ALLOWED.get(r.get("field") or "", r.get("field")),
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
        fields=["name", "employee", "employee_name", "kind", "field", "current_value", "requested_value", "reason", "evidence", "status", "decided_by", "note", "creation"],
        order_by="creation desc",
        limit=100,
    )


def mine_impl() -> list[dict[str, Any]]:
    return [to_api(r) for r in _rows({"employee": _me()["name"]})]


def _dependant_rows(employee: str) -> list[dict[str, Any]]:
    import frappe

    from eswasa_hr.sensitive import DEPENDANTS

    return frappe.get_all(DEPENDANTS, filters={"parent": employee, "parenttype": "Employee", "parentfield": DEPENDANTS_FIELD},
                          fields=["name", *DEPENDANT_KEYS], order_by="idx asc", limit=0)


def _route(doc_name: str, title: str, family: bool) -> None:
    """One ToDo per named decider: HR Managers for family and medical, else HR Managers and HR Users."""
    import frappe
    from frappe.utils import add_days, nowdate

    from eswasa_hr.documents import hr_people
    from eswasa_hr.recruitment import _hr_manager_users

    users = _hr_manager_users(exclude=frappe.session.user) if family else hr_people(exclude=frappe.session.user)
    for user in users:
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": user,
                "description": title,
                "reference_type": DOCTYPE,
                "reference_name": doc_name,
                "status": "Open",
                "priority": "Medium",
                "assigned_by": frappe.session.user,
                "date": add_days(nowdate(), settings.get("decision_sla_days")),  # provisional 3-day SLA (registry hr_profile_change_request)
            }
        ).insert(ignore_permissions=True)


def submit_impl(field: str, requested_value: str, reason: str, evidence: str | None = None, kind: str | None = None,
                row: dict[str, Any] | None = None, dependant: str | None = None, shares: dict[str, Any] | None = None) -> dict[str, Any]:
    import frappe
    from frappe.utils import nowdate

    me = _me()
    kind = (kind or FIELD).strip()
    if kind_error(kind):
        frappe.throw(kind_error(kind), frappe.ValidationError)
    if kind != FIELD:
        return _submit_dependant(me, kind, row, dependant, shares, reason, evidence, nowdate())
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
        "kind": FIELD,
        "field": field,
        "current_value": shown_value(field, current),
        "requested_value": requested_value.strip(),
        "reason": reason.strip(),
        "evidence": (evidence or "").strip() or None,
        "status": PENDING,
    }
    doc = frappe.get_doc(values)
    doc.insert(ignore_permissions=True)
    _route(doc.name, todo_title(me["employee_name"], ALLOWED[field]), is_family(field))
    return to_api({**values, "name": doc.name})


def _submit_dependant(me: dict[str, Any], kind: str, row: Any, dependant: str | None, shares: Any, reason: str | None,
                      evidence: str | None, today: Any) -> dict[str, Any]:
    import json

    import frappe

    row = json.loads(row) if isinstance(row, str) and row else (row or {})
    shares = json.loads(shares) if isinstance(shares, str) and shares else (shares or {})
    if frappe.db.exists(DOCTYPE, {"employee": me["name"], "field": DEPENDANTS_FIELD, "status": PENDING}):
        frappe.throw("You already asked to change your dependants. Wait for HR to decide it.", frappe.ValidationError)
    rows = _dependant_rows(me["name"])
    errs = dependant_request_errors(kind, rows, dependant, row, reason, evidence, today, shares)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    values = {
        "doctype": DOCTYPE,
        "employee": me["name"],
        "employee_name": me["employee_name"],
        "kind": kind,
        "field": DEPENDANTS_FIELD,
        "dependant": dependant if kind != ADD else None,
        "dependant_row": json.dumps({"row": clean_row(row), "shares": shares}, default=str),
        "current_value": None,
        "requested_value": dependant_summary(kind, row, rows, dependant),
        "reason": (reason or "").strip(),
        "evidence": (evidence or "").strip() or None,
        "status": PENDING,
    }
    doc = frappe.get_doc(values)
    doc.insert(ignore_permissions=True)
    _route(doc.name, todo_title(me["employee_name"], "dependants"), True)
    return to_api({**values, "name": doc.name})


def _apply(doc: Any) -> None:
    """Write the field and log it. Runs inside the Approvals handler with the decider's rights checked above."""
    import frappe
    from frappe.utils import now_datetime

    from eswasa_hr.sensitive import LEVELS, LOG, PERSONAL, _ip

    from eswasa_hr.sensitive import FAMILY

    kind = getattr(doc, "kind", None) or FIELD
    emp = frappe.get_doc("Employee", doc.employee)
    if kind != FIELD:
        _apply_dependant(doc, emp)
    else:
        value = doc.requested_value
        if doc.field in CHECKS:
            value = 1 if value == "Yes" else 0
        setattr(emp, doc.field, value)
    emp.flags.ignore_permissions = True
    emp.save()
    level = FAMILY if is_family(doc.field, kind) else PERSONAL
    if frappe.db.exists("DocType", LOG):
        frappe.get_doc(
            {
                "doctype": LOG,
                "employee": doc.employee,
                "employee_name": emp.employee_name,
                "viewer": frappe.session.user,
                "level": LEVELS[level]["label"],
                "fields": doc.field,
                "reason": log_reason(doc.name),
                "ip_address": _ip(),
                "viewed_on": now_datetime(),
            }
        ).insert(ignore_permissions=True)


def _apply_dependant(doc: Any, emp: Any) -> None:
    """Re-checked against today's table (it may have changed since the request), then written."""
    import json

    import frappe
    from frappe.utils import nowdate

    from eswasa_hr.sensitive import shares_error

    data = json.loads(doc.dependant_row or "{}")
    rows = _dependant_rows(doc.employee)
    if doc.kind in (UPDATE, REMOVE) and doc.dependant not in {r.get("name") for r in rows}:
        frappe.throw("That dependant is no longer on the record. Reject this request.", frappe.ValidationError)
    after = apply_rows(rows, doc.kind, doc.dependant, data.get("row"), data.get("shares"))
    err = shares_error(after)
    if err:
        frappe.throw(err + " Reject this request and ask the person to send the shares again.", frappe.ValidationError)
    emp.set(DEPENDANTS_FIELD, after)


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler: HR other than the person approves (field written, access logged) or rejects with a reason."""
    import frappe

    doc = frappe.get_doc(DOCTYPE, name)
    employee_user = frappe.db.get_value("Employee", doc.employee, "user_id")
    family = is_family(doc.field, getattr(doc, "kind", None))
    err = decider_error(frappe.session.user, frappe.get_roles(), doc.owner, employee_user, family)
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
    """Desk: HR and the person only; family and medical requests HR Managers and the person (plan 04)."""
    import frappe

    user = user or frappe.session.user
    roles = set(frappe.get_roles(user))
    get = doc.get if isinstance(doc, dict) else (lambda k: getattr(doc, k, None))
    if roles & set(FAMILY_DECIDERS) or (roles & set(DECIDERS) and not is_family(get("field"), get("kind"))):
        return True
    employee = get("employee")
    return bool(employee) and frappe.db.get_value("Employee", employee, "user_id") == user


def query(user: str | None = None, doctype: str | None = None) -> str:
    import frappe

    user = user or frappe.session.user
    roles = set(frappe.get_roles(user))
    if roles & set(FAMILY_DECIDERS):
        return ""
    own = f"`tab{DOCTYPE}`.`employee` in (select `name` from `tabEmployee` where `user_id` = {frappe.db.escape(user)})"
    if roles & set(DECIDERS):  # HR User: everything except family and medical
        medical = ", ".join(frappe.db.escape(f) for f in [*MEDICAL, DEPENDANTS_FIELD])
        return f"(`tab{DOCTYPE}`.`field` not in ({medical}) or {own})"
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
def fields() -> list[dict[str, Any]]:
    return field_options()


@_whitelist
def submit(field: str = "", requested_value: str = "", reason: str = "", evidence: str | None = None, confirm: Any = False,
           kind: str | None = None, row: Any = None, dependant: str | None = None, shares: Any = None) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return submit_impl(field, requested_value, reason, evidence, kind, row, dependant, shares)
