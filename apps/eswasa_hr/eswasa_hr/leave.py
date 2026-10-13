"""
Leave Application ↔ Approvals (brief §5, §12.1; journey J3 in EswasaOne_HR_SCREENS_AND_JOURNEYS.md).

HRMS ships no Workflow on Leave Application, so the generic Approvals engine can't route or decide it:
- Routing: every Open request gets exactly one ToDo for the employee's own ``leave_approver``
  (never a role pool — brief §12.1), titled in plain words. It closes when the request is decided.
- Deciding: Approvals calls :func:`decide` through the ``eswasa_approval_handlers`` hook. It sets
  ``status`` and submits, so HRMS validations (balance, self-approval) still apply.
- SLA (R-L1, provisional): the ToDo is due 2 working days out, skipping the employee's public holidays. Once
  it's overdue, the daily job gives each named HR Manager one ``[escalated]`` ToDo on the same request; those
  stay open until the request is decided or cancelled. A request whose approver is the applicant raises an
  HR Alert to the HR Managers instead.
- The applicant can cancel an Open request, or Approved leave that hasn't started (the ledger is reversed).
- Reads for H4 (requests, calendar, balances from the Leave Ledger, policy) are scoped with ``scope.py``.
- :func:`on_leave` lists approved leave in a date range, for the assignment guards (wired in plan 07).

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable

from eswasa_hr import settings

from eswasa_hr.workdays import add_working_days  # noqa: F401  (re-exported: slice 1 callers use leave.add_working_days)

DOCTYPE = "Leave Application"
# Decision SLA (working days, then the named HR Managers): HR Settings ``leave_sla_days``.
ESCALATED = "[escalated]"  # description prefix of the HR Manager's escalation ToDo
RULE_APPROVER = "Leave approver"  # HR Alert rules
RULE_CANCELLED = "Leave cancelled"
RULE_COVER = "Leave cover"
_DECISIONS = {"approve": "Approved", "reject": "Rejected"}
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


# ---------------------------------------------------------------- pure rules


def _as_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def todo_title(employee_name: str, from_date: Any, to_date: Any) -> str:
    """'Approve leave for Thandi Mamba, 2 to 6 Nov' (brief §12.1 todo_title)."""
    a, b = _as_date(from_date), _as_date(to_date or from_date)
    who = employee_name or "an employee"
    if a == b:
        when = f"on {a.day} {_MONTHS[a.month - 1]}"
    elif (a.year, a.month) == (b.year, b.month):
        when = f"{a.day} to {b.day} {_MONTHS[b.month - 1]}"
    else:
        when = f"{a.day} {_MONTHS[a.month - 1]} to {b.day} {_MONTHS[b.month - 1]}"
    return f"Approve leave for {who}, {when}"


def needs_todo(status: str | None, docstatus: int | None, approver: str | None, applicant: str | None) -> bool:
    """An Open, unsubmitted request with an approver who isn't the applicant."""
    return (
        (status or "Open") == "Open"
        and int(docstatus or 0) == 0
        and bool(approver)
        and approver != applicant
    )


def decision_status(action: str) -> str:
    key = (action or "").strip().lower()
    if key not in _DECISIONS:
        raise ValueError("Leave can only be approved or rejected.")
    return _DECISIONS[key]


def decider_error(user: str, approver: str | None, applicant: str | None, roles: list[str]) -> str | None:
    """Who may decide: the named leave approver, or the HR Manager (escalation). Never the applicant."""
    if applicant and user == applicant:
        return "You can't decide your own leave request."
    if user == approver or "HR Manager" in roles or "System Manager" in roles:
        return None
    return "Only the employee's leave approver or the HR Manager can decide this request."


def fmt(d: Any) -> str:
    x = _as_date(d)
    return f"{x.day} {_MONTHS[x.month - 1]} {x.year}"


def is_open(status: str | None, docstatus: int | None) -> bool:
    return (status or "Open") == "Open" and int(docstatus or 0) == 0


def is_escalated(description: str | None) -> bool:
    return (description or "").startswith(ESCALATED)


def escalation_title(employee_name: str, from_date: Any, to_date: Any, due: Any) -> str:
    return f"{ESCALATED} {todo_title(employee_name, from_date, to_date)}. The decision was due {fmt(due)}."


def escalation_targets(hr_managers: Iterable[str], approver: str | None, already: Iterable[str]) -> list[str]:
    """Named HR Managers who haven't had this request escalated to them yet (never the approver again)."""
    done = set(already)
    return [u for u in hr_managers if u and u != approver and u not in done]


def approver_problem(approver: str | None, applicant: str | None) -> str | None:
    """Why an Open request can't route: no approver, or the applicant would approve their own leave."""
    if not approver:
        return "none"
    if applicant and approver == applicant:
        return "self"
    return None


def approver_alert_title(employee_name: str, problem: str) -> str:
    who = employee_name or "an employee"
    if problem == "self":
        return f"Set a different leave approver for {who}: they would approve their own leave"
    return f"Set a leave approver for {who}: their leave request has nobody to decide it"


def canceller_error(user: str, applicant: str | None) -> str | None:
    if not applicant or user != applicant:
        return "Only the person who asked for the leave can cancel it."
    return None


def cancel_error(status: str | None, docstatus: int | None, from_date: Any, today: date, reason: str | None) -> str | None:
    """Open requests, and Approved leave that hasn't started, can be cancelled with a reason."""
    if not (reason or "").strip():
        return "Say why you're cancelling. Your approver sees it."
    if is_open(status, docstatus):
        return None
    if status == "Approved" and int(docstatus or 0) == 1:
        return None if _as_date(from_date) > today else "This leave has started, so it can't be cancelled here. Ask HR to adjust it."
    return f"Only open or approved leave can be cancelled (this one is {status or 'closed'})."


def overlaps(from_date: Any, to_date: Any, start: Any, end: Any) -> bool:
    a, b = _as_date(from_date), _as_date(to_date or from_date)
    return a <= _as_date(end) and b >= _as_date(start)


def on_leave_message(employee_name: str, from_date: Any, to_date: Any) -> str:
    return f"{employee_name or 'This person'} is on approved leave {fmt(from_date)}–{fmt(to_date or from_date)}"


def range_error(start: Any, end: Any) -> str | None:
    try:
        a, b = _as_date(start), _as_date(end)
    except (TypeError, ValueError):
        return f"Choose a range of up to {settings.get('calendar_max_days')} days."
    if b < a or (b - a).days > settings.get("calendar_max_days"):
        return f"Choose a range of up to {settings.get('calendar_max_days')} days."
    return None


def apply_error(leave_type: str | None, from_date: Any, to_date: Any) -> str | None:
    """POST /hr/leave: what's wrong with a new request before HRMS checks balance, overlaps and holidays."""
    if not (leave_type or "").strip():
        return "Choose a leave type."
    try:
        a, b = _as_date(from_date), _as_date(to_date)
    except (TypeError, ValueError):
        return "Choose the first and last day of your leave."
    if b < a:
        return "The last day can't be before the first day."
    return None


def request_status(status: str | None, docstatus: int | None) -> str:
    return "Cancelled" if int(docstatus or 0) == 2 else (status or "Open")


def request_row(row: dict[str, Any], sla: Any, escalated: bool, today: date) -> dict[str, Any]:
    """One row of GET /hr/leave/requests. No reason text: it can carry health details."""
    st = request_status(row.get("status"), row.get("docstatus"))
    due = _as_date(sla) if sla else None
    return {
        "id": row.get("name"),
        "employee": row.get("employee"),
        "employee_name": row.get("employee_name"),
        "department": row.get("department"),
        "leave_type": row.get("leave_type"),
        "from_date": str(row.get("from_date") or "")[:10] or None,
        "to_date": str(row.get("to_date") or "")[:10] or None,
        "days": float(row["total_leave_days"]) if row.get("total_leave_days") is not None else None,
        "status": st,
        "approver": row.get("leave_approver"),
        "approver_name": row.get("leave_approver_name"),
        "sla_date": due.isoformat() if due and st == "Open" else None,
        "overdue": bool(due and st == "Open" and due < today),
        "escalated": bool(escalated and st == "Open"),
    }


def calendar_entry(row: dict[str, Any]) -> dict[str, Any]:
    """Approved leave is a solid cell, an Open request a dashed one."""
    approved = row.get("status") == "Approved"
    return {
        "employee": row.get("employee"),
        "kind": "leave",
        "label": row.get("leave_type") or "Leave",
        "from_date": str(row.get("from_date"))[:10],
        "to_date": str(row.get("to_date") or row.get("from_date"))[:10],
        "approved": approved,
        "style": "solid" if approved else "dashed",
    }


def field_entry(employee: str, row: dict[str, Any]) -> dict[str, Any]:
    day = str(row.get("planned_date"))[:10]
    return {"employee": employee, "kind": "field", "label": row.get("title") or "Field visit", "from_date": day, "to_date": day, "approved": True, "style": "F"}


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def balance_rows(allocation: dict[str, Any], types: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Rows from HRMS get_leave_details' ``leave_allocation`` (Leave Ledger based), with owed / above carry-over."""
    out = []
    for leave_type, v in sorted((allocation or {}).items()):
        if not isinstance(v, dict):
            continue
        meta = types.get(leave_type) or {}
        balance = _num(v.get("remaining_leaves"))
        cap = _num(meta.get("maximum_carry_forwarded_leaves"))
        row = {
            "leave_type": leave_type,
            "allocated": _num(v.get("total_leaves")),
            "used": _num(v.get("leaves_taken")),
            "balance": balance,
            "pending": _num(v.get("leaves_pending_approval")),
            "owed": balance if meta.get("allow_encashment") else None,
            "above_carry_over": max(0.0, balance - cap) if meta.get("is_carry_forward") and cap > 0 else None,
        }
        out.append(row)
    return out


def balance_totals(rows: list[dict[str, Any]]) -> dict[str, float | None]:
    """Sums over the rows that apply; None (not 0) when no leave type is encashable / capped."""
    def total(key: str) -> float | None:
        vals = [r[key] for r in rows if r.get(key) is not None]
        return float(sum(vals)) if vals else None

    return {"owed": total("owed"), "above_carry_over": total("above_carry_over")}


POLICY_FIELDS = (
    "max_leaves_allowed",
    "applicable_after",
    "max_continuous_days_allowed",
    "is_carry_forward",
    "maximum_carry_forwarded_leaves",
    "expire_carry_forwarded_leaves_after_days",
    "allow_encashment",
    "is_earned_leave",
    "earned_leave_frequency",
    "is_lwp",
    "is_optional_leave",
    "allow_negative",
    "include_holiday",
    "is_compensatory",
)


def policy_view(types: list[dict[str, Any]], details: list[dict[str, Any]], periods: list[dict[str, Any]]) -> dict[str, Any]:
    """Brief §5.2, read-only. Nothing configured means empty lists, never defaults."""
    per_type: dict[str, list[dict[str, Any]]] = {}
    for d in details:
        per_type.setdefault(d.get("leave_type"), []).append({"policy": d.get("parent"), "annual_allocation": _num(d.get("annual_allocation"))})
    leave_types = [{"name": t.get("name"), **{k: t.get(k) for k in POLICY_FIELDS if k in t}, "allocations": per_type.get(t.get("name"), [])} for t in types]
    period = periods[0] if periods else None
    configured = bool(leave_types and details)
    return {
        "configured": configured,
        "awaiting": None,
        "leave_period": {"name": period.get("name"), "from_date": str(period.get("from_date"))[:10], "to_date": str(period.get("to_date"))[:10]} if period else None,
        "leave_types": leave_types,
    }


def needs_cover(open_approvals: int, heads_department: bool, delegated: bool) -> bool:
    """Approved leave for someone others wait on (open approval ToDos, or a department head) with no cover set."""
    return (open_approvals > 0 or heads_department) and not delegated


def cover_title(employee_name: str, from_date: Any, to_date: Any) -> str:
    return f"Approved, no cover set: {employee_name or 'this person'} is away {fmt(from_date)}–{fmt(to_date or from_date)}. Agree who picks up their approvals."


# ---------------------------------------------------------------- Frappe glue


def _applicant_user(doc: Any) -> str | None:
    import frappe

    if not getattr(doc, "employee", None):
        return None
    return frappe.db.get_value("Employee", doc.employee, "user_id")


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _holidays(employee: str | None) -> set[date]:
    from eswasa_hr.workdays import holidays

    return holidays(employee) if employee else set()


def _hr_managers(exclude: str | None = None) -> list[str]:
    from eswasa_hr.recruitment import _hr_manager_users

    return _hr_manager_users(exclude=exclude)


def sync_todo(doc: Any, method: str | None = None) -> None:
    """doc_events hook: one open ToDo for the current leave approver while Open. ``[escalated]`` ToDos stay
    open while the request is Open; everything closes once it's decided or cancelled."""
    import frappe

    applicant = _applicant_user(doc)
    open_rows = frappe.get_all(
        "ToDo",
        filters={"reference_type": DOCTYPE, "reference_name": doc.name, "status": "Open"},
        fields=["name", "allocated_to", "description"],
    )
    still_open = is_open(doc.status, doc.docstatus)
    wanted = doc.leave_approver if needs_todo(doc.status, doc.docstatus, doc.leave_approver, applicant) else None
    keep = False
    for row in open_rows:
        if is_escalated(row.get("description")):
            if still_open:
                continue
        elif wanted and row.get("allocated_to") == wanted and not keep:
            keep = True
            continue
        frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")
    if wanted and not keep:
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": wanted,
                "description": todo_title(doc.employee_name, doc.from_date, doc.to_date),
                "reference_type": DOCTYPE,
                "reference_name": doc.name,
                "status": "Open",
                "priority": "Medium",
                "assigned_by": applicant or frappe.session.user,
                "date": add_working_days(_today(), settings.get("leave_sla_days"), _holidays(doc.employee)).isoformat(),
            }
        ).insert(ignore_permissions=True)
    _approver_alert(doc, applicant, still_open)


def _approver_alert(doc: Any, applicant: str | None, still_open: bool) -> None:
    """No usable approver: one HR Alert to the named HR Managers. Closed again once the request is settled."""
    import frappe

    from eswasa_hr.alerts import raise_alert

    if not frappe.db.exists("DocType", "HR Alert"):
        return
    problem = approver_problem(doc.leave_approver, applicant) if still_open else None
    if problem:
        raise_alert(f"leave-approver:{doc.name}", RULE_APPROVER, approver_alert_title(doc.employee_name, problem),
                    _hr_managers(exclude=applicant), _today().isoformat(), doc.employee, (DOCTYPE, doc.name))
        return
    for a in frappe.get_all("HR Alert", filters={"rule": RULE_APPROVER, "subject_doctype": DOCTYPE, "subject_name": doc.name}, fields=["name"], limit=0):
        for t in frappe.get_all("ToDo", filters={"reference_type": "HR Alert", "reference_name": a["name"], "status": "Open"}, fields=["name"], limit=0):
            frappe.db.set_value("ToDo", t["name"], "status", "Closed")


def escalate_overdue() -> int:
    """R-L1 (daily, provisional): an Open request past its SLA date gets one ``[escalated]`` ToDo per named HR
    Manager, once. The approver's ToDo stays; either of them can decide in Approvals."""
    import frappe

    day = _today()
    overdue = [
        t for t in frappe.get_all(
            "ToDo",
            filters={"reference_type": DOCTYPE, "status": "Open", "date": ["<", day.isoformat()]},
            fields=["reference_name", "allocated_to", "description", "date"],
            limit=0,
        )
        if not is_escalated(t.get("description"))
    ]
    n = 0
    for name in sorted({t["reference_name"] for t in overdue}):
        doc = frappe.db.get_value(DOCTYPE, name, ["name", "employee", "employee_name", "from_date", "to_date", "status", "docstatus", "leave_approver"], as_dict=True)
        if not doc or not is_open(doc.get("status"), doc.get("docstatus")):
            continue
        applicant = frappe.db.get_value("Employee", doc["employee"], "user_id") if doc.get("employee") else None
        already = [
            r["allocated_to"]
            for r in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": name, "description": ["like", f"{ESCALATED}%"]}, fields=["allocated_to"], limit=0)
        ]
        due = min(_as_date(t["date"]) for t in overdue if t["reference_name"] == name)
        for user in escalation_targets(_hr_managers(exclude=applicant), doc.get("leave_approver"), already):
            frappe.get_doc(
                {
                    "doctype": "ToDo",
                    "allocated_to": user,
                    "description": escalation_title(doc.get("employee_name"), doc.get("from_date"), doc.get("to_date"), due),
                    "reference_type": DOCTYPE,
                    "reference_name": name,
                    "status": "Open",
                    "priority": "High",
                    "assigned_by": "Administrator",
                    "date": day.isoformat(),
                }
            ).insert(ignore_permissions=True)
            n += 1
    return n


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler (hook ``eswasa_approval_handlers``): approve or reject, then submit."""
    import frappe
    from frappe import _

    doc = frappe.get_doc(DOCTYPE, name)
    err = decider_error(frappe.session.user, doc.leave_approver, _applicant_user(doc), frappe.get_roles())
    if err:
        frappe.throw(_(err), frappe.PermissionError)
    if int(doc.docstatus or 0) != 0 or (doc.status or "Open") != "Open":
        frappe.throw(_("This request was already decided ({0}).").format(doc.status), frappe.ValidationError)
    try:
        status = decision_status(action)
    except ValueError as exc:
        frappe.throw(_(str(exc)), frappe.ValidationError)
    note = (comment or "").strip()
    if status == "Rejected" and not note:
        frappe.throw(_("Say why you're not approving it. The employee sees your note."), frappe.ValidationError)

    doc.status = status
    doc.submit()
    if note:
        doc.add_comment("Comment", note)
    sync_todo(doc)
    from eswasa_hr import notify

    notify.queue(f"leave-decided:{name}", [_applicant_user(doc)], "leave_decided",
                 {"decision": "approved" if status == "Approved" else "not approved", "from_date": fmt(doc.from_date), "to_date": fmt(doc.to_date)})
    return {
        "ok": True,
        "doctype": DOCTYPE,
        "name": name,
        "action": action,
        "workflow_action": None,
        "status": status,
        "message": _("Leave {0} for {1}").format(status.lower(), doc.employee_name),
    }


def cancel_impl(name: str, reason: str) -> dict[str, Any]:
    """The applicant cancels an Open request, or Approved leave that hasn't started (HRMS reverses the ledger)."""
    import frappe
    from frappe import _

    from eswasa_hr.alerts import raise_alert

    doc = frappe.get_doc(DOCTYPE, name)
    applicant = _applicant_user(doc)
    err = canceller_error(frappe.session.user, applicant)
    if err:
        frappe.throw(_(err), frappe.PermissionError)
    err = cancel_error(doc.status, doc.docstatus, doc.from_date, _today(), reason)
    if err:
        frappe.throw(_(err), frappe.ValidationError)
    note = reason.strip()
    was_approved = int(doc.docstatus or 0) == 1
    if was_approved:
        doc.flags.ignore_permissions = True
        doc.cancel()
        if doc.status != "Cancelled":
            doc.db_set("status", "Cancelled")
    else:
        doc.db_set("status", "Cancelled")
        sync_todo(doc)
    doc.add_comment("Comment", f"Cancelled by the employee: {note}")
    if was_approved and doc.leave_approver and doc.leave_approver != applicant and frappe.db.exists("DocType", "HR Alert"):
        title = f"{doc.employee_name} cancelled approved leave, {fmt(doc.from_date)}–{fmt(doc.to_date)}: {note}"
        raise_alert(f"leave-cancelled:{name}", RULE_CANCELLED, title, [doc.leave_approver], _today().isoformat(), doc.employee, (DOCTYPE, name))
    if was_approved and doc.leave_approver and doc.leave_approver != applicant:
        from eswasa_hr import notify

        notify.queue(f"leave-cancelled:{name}", [doc.leave_approver], "leave_cancelled",
                     {"employee_name": doc.employee_name, "from_date": fmt(doc.from_date), "to_date": fmt(doc.to_date)})
    return {"ok": True, "name": name, "status": "Cancelled", "message": _("Leave cancelled")}


def apply_impl(leave_type: str, from_date: str, to_date: str, reason: str | None = None) -> dict[str, Any]:
    """The caller's own leave request (plan 01: no raw insert from Core). Always for the caller's Employee;
    the leave approver comes from that record, HRMS validates balance, overlaps and holidays, and
    ``sync_todo`` (doc_events) routes it to the named approver."""
    import frappe

    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"},
                              ["name", "employee_name", "leave_approver", "company"], as_dict=True)
    if not emp:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    err = apply_error(leave_type, from_date, to_date)
    if err:
        frappe.throw(err, frappe.ValidationError)
    values = {"doctype": DOCTYPE, "employee": emp["name"], "leave_type": leave_type.strip(), "from_date": str(from_date)[:10],
              "to_date": str(to_date)[:10], "status": "Open", "company": emp.get("company")}
    if emp.get("leave_approver"):
        values["leave_approver"] = emp["leave_approver"]
    if (reason or "").strip():
        values["description"] = reason.strip()
    doc = frappe.get_doc(values)
    doc.insert()
    return {"name": doc.name, "employee": emp["name"], "employee_name": emp.get("employee_name"), "leave_type": doc.leave_type,
            "from_date": str(doc.from_date), "to_date": str(doc.to_date), "status": doc.status}


def _employee_ref(user_or_employee: str) -> str | None:
    import frappe

    if frappe.db.exists("Employee", user_or_employee):
        return user_or_employee
    return frappe.db.get_value("Employee", {"user_id": user_or_employee}, "name")


def on_leave(user_or_employee: str | None, start: Any, end: Any = None) -> list[dict[str, Any]]:
    """Approved (submitted) leave overlapping start..end for a User or an Employee. Empty when there is none."""
    import frappe

    employee = _employee_ref(user_or_employee) if user_or_employee else None
    if not employee or not start:
        return []
    a, b = _as_date(start), _as_date(end or start)
    rows = frappe.get_all(
        DOCTYPE,
        filters={"employee": employee, "status": "Approved", "docstatus": 1, "from_date": ["<=", b.isoformat()], "to_date": [">=", a.isoformat()]},
        fields=["name", "employee", "employee_name", "leave_type", "from_date", "to_date"],
        order_by="from_date asc",
        limit=0,
    )
    return [
        {**r, "from_date": str(r["from_date"])[:10], "to_date": str(r["to_date"])[:10], "message": on_leave_message(r.get("employee_name"), r["from_date"], r["to_date"])}
        for r in rows
        if overlaps(r["from_date"], r["to_date"], a, b)
    ]


def on_leave_error(user_or_employee: str | None, start: Any, end: Any = None) -> str | None:
    """The refusal text for an assignment guard, or None."""
    hits = on_leave(user_or_employee, start, end)
    return hits[0]["message"] if hits else None


def cover_prompt(doc: Any, method: str | None = None) -> None:
    """on_submit: Approved leave for someone with open approvals, or a department head, raises "Approved, no
    cover set" to them and their line manager. EswasaOne has no delegation model yet, so cover is never set."""
    import frappe

    from eswasa_hr.alerts import raise_alert, recipients

    if doc.status != "Approved" or not frappe.db.exists("DocType", "HR Alert"):
        return
    applicant = _applicant_user(doc)
    if not applicant:
        return
    approvals = frappe.get_all(
        "ToDo",
        filters={"allocated_to": applicant, "status": "Open", "reference_type": ["not in", ["", "HR Alert"]]},
        fields=["name"],
        limit=1,
    )
    heads = bool(frappe.get_meta("Department").has_field("custom_head") and frappe.db.exists("Department", {"custom_head": doc.employee}))
    if not needs_cover(len(approvals), heads, delegated=False):
        return
    manager = frappe.db.get_value("Employee", doc.employee, "reports_to")
    manager_user = frappe.db.get_value("Employee", manager, "user_id") if manager else None
    raise_alert(f"leave-cover:{doc.name}", RULE_COVER, cover_title(doc.employee_name, doc.from_date, doc.to_date),
                recipients(applicant, manager_user), str(doc.from_date)[:10], doc.employee, (DOCTYPE, doc.name))


def _scope_filters(v: Any) -> list[list[Any]] | None:
    """or_filters for a non-HR viewer: their own and their reports' requests, plus the ones they approve."""
    if v.hr:
        return None
    return [["employee", "in", v.people or ["__none__"]], ["leave_approver", "=", v.user]]


def requests_impl(status: str | None = None, department: str | None = None, from_date: str | None = None, to_date: str | None = None) -> list[dict[str, Any]]:
    """H4 request list, read-only: HR sees all, a manager their reports, everyone their own."""
    import frappe

    from eswasa_hr.scope import viewer_for

    v = viewer_for()
    filters: dict[str, Any] = {}
    if status:
        filters["status"] = status
    if department:
        filters["department"] = department
    if from_date:
        filters["to_date"] = [">=", str(_as_date(from_date))]
    if to_date:
        filters["from_date"] = ["<=", str(_as_date(to_date))]
    rows = frappe.get_all(
        DOCTYPE,
        filters=filters,
        or_filters=_scope_filters(v),
        fields=["name", "employee", "employee_name", "department", "leave_type", "from_date", "to_date", "total_leave_days", "status", "docstatus", "leave_approver", "leave_approver_name"],
        order_by="from_date desc",
        limit=500,
    )
    names = [r["name"] for r in rows]
    sla: dict[str, Any] = {}
    escalated: set[str] = set()
    if names:
        for t in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": ["in", names], "status": "Open"}, fields=["reference_name", "date", "description"], limit=0):
            if is_escalated(t.get("description")):
                escalated.add(t["reference_name"])
            elif t.get("date"):
                sla[t["reference_name"]] = t["date"]
    day = _today()
    return [request_row(r, sla.get(r["name"]), r["name"] in escalated, day) for r in rows]


def calendar_impl(start: str, end: str, department: str | None = None) -> dict[str, Any]:
    """H4 calendar: Approved leave solid, Open requests dashed, Field Visits as "F", up to 62 days."""
    import frappe

    from eswasa_hr.scope import viewer_for

    err = range_error(start, end)
    if err:
        frappe.throw(err, frappe.ValidationError)
    a, b = _as_date(start), _as_date(end)
    v = viewer_for()
    filters: dict[str, Any] = {"status": ["in", ["Open", "Approved"]], "docstatus": ["<", 2], "from_date": ["<=", b.isoformat()], "to_date": [">=", a.isoformat()]}
    if department:
        filters["department"] = department
    rows = frappe.get_all(DOCTYPE, filters=filters, or_filters=_scope_filters(v), fields=["employee", "employee_name", "leave_type", "from_date", "to_date", "status"], limit=0)
    entries = [calendar_entry(r) for r in rows]

    emp_filters: dict[str, Any] = {"status": "Active"}
    if department:
        emp_filters["department"] = department
    if not v.hr:
        emp_filters["name"] = ["in", sorted(set(v.people) | {r["employee"] for r in rows}) or ["__none__"]]
    people = frappe.get_all("Employee", filters=emp_filters, fields=["name", "employee_name", "department", "user_id"], order_by="employee_name asc", limit=0)
    by_user = {p["user_id"]: p["name"] for p in people if p.get("user_id")}
    if by_user and frappe.db.exists("DocType", "Field Visit"):
        for fv in frappe.get_all(
            "Field Visit",
            filters={"lead_auditor": ["in", sorted(by_user)], "planned_date": ["between", [a.isoformat(), b.isoformat()]], "workflow_state": ["not in", ["Cancelled", "Rejected"]]},
            fields=["lead_auditor", "planned_date", "title"],
            limit=0,
        ):
            entries.append(field_entry(by_user[fv["lead_auditor"]], fv))
    return {
        "start": a.isoformat(),
        "end": b.isoformat(),
        "people": [{"employee": p["name"], "employee_name": p.get("employee_name"), "department": p.get("department")} for p in people],
        "entries": entries,
    }


def balances_impl(employee: str | None = None) -> dict[str, Any]:
    """Balances from the Leave Ledger (HRMS get_leave_details), for yourself or someone you can see.
    No Leave Period or allocation: empty items and None totals, so the screen says nothing is allocated yet."""
    import frappe

    from eswasa_hr.scope import viewer_for

    v = viewer_for()
    employee = employee or v.employee or (frappe.db.get_value("Employee", {"user_id": v.user}, "name") if v.hr else None)
    empty = {"employee": employee, "items": [], "owed": None, "above_carry_over": None, "awaiting": None}
    if not employee:
        return empty
    if not v.hr and employee not in v.people:
        frappe.throw("You can only see your own and your team's leave balances.", frappe.PermissionError)
    try:
        from hrms.hr.doctype.leave_application.leave_application import get_leave_details
    except ImportError:
        return empty
    details = get_leave_details(employee, _today().isoformat()) or {}
    allocation = details.get("leave_allocation") or {}
    if not allocation:
        return empty
    types = {
        t["name"]: t
        for t in frappe.get_all("Leave Type", filters={"name": ["in", list(allocation)]}, fields=["name", "allow_encashment", "is_carry_forward", "maximum_carry_forwarded_leaves"], limit=0)
    }
    rows = balance_rows(allocation, types)
    return {"employee": employee, "items": rows, **balance_totals(rows), "awaiting": None}


def policy_impl() -> dict[str, Any]:
    """Configured Leave Types with their policy fields (brief §5.2), read-only. Nothing is invented (H14)."""
    import frappe

    meta = frappe.get_meta("Leave Type")
    fields = ["name"] + [f for f in POLICY_FIELDS if meta.has_field(f)]
    types = frappe.get_all("Leave Type", fields=fields, order_by="name asc", limit=0)
    policies = [p["name"] for p in frappe.get_all("Leave Policy", filters={"docstatus": 1}, fields=["name"], limit=0)]
    details = frappe.get_all("Leave Policy Detail", filters={"parent": ["in", policies]}, fields=["parent", "leave_type", "annual_allocation"], limit=0) if policies else []
    day = _today().isoformat()
    periods = frappe.get_all("Leave Period", filters={"is_active": 1, "from_date": ["<=", day], "to_date": [">=", day]}, fields=["name", "from_date", "to_date"], limit=1)
    return policy_view(types, details, periods)


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def apply(leave_type: str = "", from_date: str = "", to_date: str = "", reason: str | None = None, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return apply_impl(leave_type, from_date, to_date, reason)


@_whitelist
def cancel(name: str, reason: str = "", confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return cancel_impl(name, reason)


@_whitelist
def requests(status: str | None = None, department: str | None = None, from_date: str | None = None, to_date: str | None = None) -> list[dict[str, Any]]:
    return requests_impl(status, department, from_date, to_date)


@_whitelist
def calendar(start: str, end: str, department: str | None = None) -> dict[str, Any]:
    return calendar_impl(start, end, department)


@_whitelist
def balances(employee: str | None = None) -> dict[str, Any]:
    return balances_impl(employee)


@_whitelist
def policy() -> dict[str, Any]:
    return policy_impl()
