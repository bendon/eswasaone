"""
Leave Application ↔ Approvals (brief §5, §12.1; journey J3 in EswasaOne_HR_SCREENS_AND_JOURNEYS.md).

HRMS ships no Workflow on Leave Application, so the generic Approvals engine can't route or decide it:
- Routing: every Open request gets exactly one ToDo for the employee's own ``leave_approver``
  (never a role pool — brief §12.1), titled in plain words. It closes when the request is decided.
- Deciding: Approvals calls :func:`decide` through the ``eswasa_approval_handlers`` hook. It sets
  ``status`` and submits, so HRMS validations (balance, self-approval) still apply.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

DOCTYPE = "Leave Application"
# Brief §12.1 proposal (2 working days, then the HR Manager). Confirm with ESWASA.
SLA_WORKING_DAYS = 2
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


def add_working_days(start: date, days: int) -> date:
    """Skip Saturdays and Sundays. Public holidays are not counted here (TODO: Holiday List)."""
    d = start
    left = days
    while left > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            left -= 1
    return d


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


# ---------------------------------------------------------------- Frappe glue


def _applicant_user(doc: Any) -> str | None:
    import frappe

    if not getattr(doc, "employee", None):
        return None
    return frappe.db.get_value("Employee", doc.employee, "user_id")


def sync_todo(doc: Any, method: str | None = None) -> None:
    """doc_events hook: keep exactly one open ToDo, owned by the current leave approver."""
    import frappe
    from frappe.utils import getdate, nowdate

    applicant = _applicant_user(doc)
    open_rows = frappe.get_all(
        "ToDo",
        filters={"reference_type": DOCTYPE, "reference_name": doc.name, "status": "Open"},
        fields=["name", "allocated_to"],
    )
    wanted = doc.leave_approver if needs_todo(doc.status, doc.docstatus, doc.leave_approver, applicant) else None
    keep = False
    for row in open_rows:
        if wanted and row.get("allocated_to") == wanted and not keep:
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
                "date": add_working_days(getdate(nowdate()), SLA_WORKING_DAYS).isoformat(),
            }
        ).insert(ignore_permissions=True)


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
    return {
        "ok": True,
        "doctype": DOCTYPE,
        "name": name,
        "action": action,
        "workflow_action": None,
        "status": status,
        "message": _("Leave {0} for {1}").format(status.lower(), doc.employee_name),
    }
