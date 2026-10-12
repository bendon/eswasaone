"""
Expense claims (reimbursement only) ↔ Approvals (brief §12.1, plan 05). Native HRMS ``Expense Claim``; not payroll,
and nothing here reads salary data.

- Submit: the caller's own Draft claim, routed to the ``expense_approver`` on their Employee record. Lines need a
  date that isn't in the future, an amount above 0 and, above ``HR Settings.custom_receipt_required_above``, a
  receipt (one of the uploaded attachments). An empty threshold means every line needs a receipt.
- Routing: a Draft claim gets exactly one ToDo for the named approver (never a role pool), titled with the claimant
  and the total. A claim whose approver is the applicant raises an HR Alert to the HR Managers instead.
- Deciding: Approvals calls :func:`decide` through ``eswasa_approval_handlers``. Approve sets ``approval_status``
  and submits (HRMS books the payable); reject needs a note. Payment is Finance's job (Payment Entry), not HR's.
- SLA (provisional, brief §12.1): 3 working days, then one alert to the named Accounts Managers, once.
- Reads: HR and Finance (Accounts Manager) see every claim; others their own and the ones routed to them.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable

from eswasa_hr.workdays import add_working_days

DOCTYPE = "Expense Claim"
# Brief §12.1 proposal (3 working days, then Finance). Provisional: confirm with ESWASA.
SLA_WORKING_DAYS = 3
RULE_APPROVER = "Expense approver"  # HR Alert rules
RULE_OVERDUE = "Expense overdue"
THRESHOLD_FIELD = "custom_receipt_required_above"
FINANCE_ROLE = "Accounts Manager"
_DECISIONS = {"approve": "Approved", "reject": "Rejected"}
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


# ---------------------------------------------------------------- pure rules


def _as_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def fmt(d: Any) -> str:
    x = _as_date(d)
    return f"{x.day} {_MONTHS[x.month - 1]} {x.year}"


def money(amount: Any, currency: str | None = None) -> str:
    return f"{currency or 'SZL'} {_num(amount):,.2f}"


def receipt_needed(amount: Any, threshold: Any) -> bool:
    """No threshold set means a receipt is always needed; otherwise only above it."""
    if threshold in (None, ""):
        return True
    return _num(amount) > _num(threshold)


def claim_errors(lines: list[dict[str, Any]] | None, has_receipts: Iterable[str], threshold: Any, today: date) -> str | None:
    """Why the claim can't be sent, or None. ``has_receipts`` holds the attachment names a line can point at."""
    if not lines:
        return "Add at least one expense."
    receipts = {r for r in has_receipts if r}
    for i, line in enumerate(lines, start=1):
        if not (line.get("expense_type") or "").strip():
            return f"Line {i}: choose an expense type."
        if _num(line.get("amount")) <= 0:
            return f"Line {i}: the amount must be more than 0."
        try:
            day = _as_date(line.get("expense_date"))
        except (TypeError, ValueError):
            return f"Line {i}: give the date of the expense."
        if day > today:
            return f"Line {i}: the expense date can't be in the future."
        if receipt_needed(line.get("amount"), threshold) and (line.get("receipt") or "") not in receipts:
            return f"Line {i}: attach the receipt for this expense."
    return None


def total(lines: Iterable[dict[str, Any]]) -> float:
    return round(sum(_num(line.get("amount")) for line in lines), 2)


def todo_title(employee_name: str | None, amount: Any, currency: str | None = None) -> str:
    """'Approve expense claim for Thandi Mamba, SZL 1,250.00' (the Approvals card reads this)."""
    return f"Approve expense claim for {employee_name or 'an employee'}, {money(amount, currency)}"


def is_open(approval_status: str | None, docstatus: int | None) -> bool:
    return (approval_status or "Draft") == "Draft" and int(docstatus or 0) == 0


def needs_todo(approval_status: str | None, docstatus: int | None, approver: str | None, applicant: str | None) -> bool:
    """A Draft, unsubmitted claim with an approver who isn't the applicant."""
    return is_open(approval_status, docstatus) and bool(approver) and approver != applicant


def approver_problem(approver: str | None, applicant: str | None) -> str | None:
    if not approver:
        return "none"
    if applicant and approver == applicant:
        return "self"
    return None


def approver_alert_title(employee_name: str | None, problem: str) -> str:
    who = employee_name or "an employee"
    if problem == "self":
        return f"Set a different expense approver for {who}: they would approve their own claim"
    return f"Set an expense approver for {who}: their expense claim has nobody to decide it"


def decision_status(action: str) -> str:
    key = (action or "").strip().lower()
    if key not in _DECISIONS:
        raise ValueError("An expense claim can only be approved or rejected.")
    return _DECISIONS[key]


def decider_error(user: str, approver: str | None, applicant: str | None, roles: list[str]) -> str | None:
    """The named expense approver decides; the HR Manager and Finance (escalation) can too. Never the applicant."""
    if applicant and user == applicant:
        return "You can't decide your own expense claim."
    if user == approver or {"HR Manager", FINANCE_ROLE, "System Manager"} & set(roles or ()):
        return None
    return "Only the employee's expense approver can decide this claim."


def overdue_title(employee_name: str | None, amount: Any, due: Any, currency: str | None = None) -> str:
    return f"Expense claim waiting past its due date: {employee_name or 'an employee'}, {money(amount, currency)}. The decision was due {fmt(due)}."


def status_label(approval_status: str | None, status: str | None, docstatus: int | None) -> str:
    """Where a claim is, in plain words."""
    if int(docstatus or 0) == 2:
        return "Cancelled"
    if (approval_status or "Draft") == "Rejected":
        return "Not approved"
    if (approval_status or "Draft") == "Draft":
        return "Waiting for approval"
    if status == "Paid":
        return "Paid"
    return "Approved, waiting for payment"


def claim_row(row: dict[str, Any], sla: Any = None, today: date | None = None) -> dict[str, Any]:
    """One row of the claim lists (no line or receipt detail)."""
    open_ = is_open(row.get("approval_status"), row.get("docstatus"))
    due = _as_date(sla) if sla and open_ else None
    return {
        "id": row.get("name"),
        "employee": row.get("employee"),
        "employee_name": row.get("employee_name"),
        "department": row.get("department"),
        "posting_date": str(row.get("posting_date") or "")[:10] or None,
        "total": _num(row.get("total_claimed_amount")),
        "sanctioned": _num(row.get("total_sanctioned_amount")) if row.get("total_sanctioned_amount") is not None else None,
        "currency": row.get("currency") or None,
        "approval_status": row.get("approval_status") or "Draft",
        "status": status_label(row.get("approval_status"), row.get("status"), row.get("docstatus")),
        "approver": row.get("expense_approver"),
        "sla_date": due.isoformat() if due else None,
        "overdue": bool(due and today and due < today),
    }


def line_row(line: dict[str, Any]) -> dict[str, Any]:
    return {
        "expense_type": line.get("expense_type"),
        "expense_date": str(line.get("expense_date") or "")[:10] or None,
        "description": line.get("description") or None,
        "amount": _num(line.get("amount")),
        "sanctioned": _num(line.get("sanctioned_amount")) if line.get("sanctioned_amount") is not None else None,
        "receipt": line.get("custom_receipt") or None,
    }


def can_see(user: str, roles: Iterable[str], employee: str | None, row: dict[str, Any]) -> bool:
    """HR and Finance see all; others their own claims and the ones they approve."""
    from eswasa_hr.scope import is_hr

    roles = list(roles or ())
    if is_hr(roles) or FINANCE_ROLE in roles:
        return True
    return bool(employee and row.get("employee") == employee) or (row.get("expense_approver") or None) == user


def attachment_error(attachments: list[dict[str, Any]] | None) -> str | None:
    for a in attachments or []:
        if not (a.get("file_name") or "").strip():
            return "Each attachment needs a file name."
        url = (a.get("url") or "").strip()
        if not url.startswith(("https://", "http://", "/files/", "/private/files/")):
            return "Upload each receipt first, then attach it."
    return None


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _applicant_user(doc: Any) -> str | None:
    import frappe

    employee = doc.get("employee") if isinstance(doc, dict) else getattr(doc, "employee", None)
    return frappe.db.get_value("Employee", employee, "user_id") if employee else None


def _holidays(employee: str | None) -> set[date]:
    from eswasa_hr.workdays import holidays

    return holidays(employee) if employee else set()


def _hr_managers(exclude: str | None = None) -> list[str]:
    from eswasa_hr.recruitment import _hr_manager_users

    return _hr_manager_users(exclude=exclude)


def _finance_users(exclude: Iterable[str] = ()) -> list[str]:
    """Named, enabled Accounts Managers (never a pool ToDo)."""
    import frappe

    users = {r.get("parent") for r in frappe.get_all("Has Role", filters={"role": FINANCE_ROLE, "parenttype": "User"}, fields=["parent"], limit=0)}
    users -= {"Administrator", *exclude}
    users.discard(None)
    return sorted({u["name"] for u in frappe.get_all("User", filters={"name": ["in", sorted(users)], "enabled": 1}, fields=["name"], limit=0)}) if users else []


def threshold() -> float | None:
    """HR Settings.custom_receipt_required_above; None (receipt always needed) when it's empty or not migrated."""
    import frappe

    try:
        value = frappe.db.get_single_value("HR Settings", THRESHOLD_FIELD)
    except Exception:  # noqa: BLE001  (custom field not migrated yet)
        return None
    return None if value in (None, "", 0, "0") else _num(value)


def sync_todo(doc: Any, method: str | None = None) -> None:
    """doc_events hook: one open ToDo for the named expense approver while the claim is Draft; closed after."""
    import frappe

    applicant = _applicant_user(doc)
    wanted = doc.expense_approver if needs_todo(doc.approval_status, doc.docstatus, doc.expense_approver, applicant) else None
    keep = False
    for row in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": doc.name, "status": "Open"}, fields=["name", "allocated_to"]):
        if wanted and row.get("allocated_to") == wanted and not keep:
            keep = True
            continue
        frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")
    if wanted and not keep:
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": wanted,
                "description": todo_title(doc.employee_name, doc.total_claimed_amount, getattr(doc, "currency", None)),
                "reference_type": DOCTYPE,
                "reference_name": doc.name,
                "status": "Open",
                "priority": "Medium",
                "assigned_by": applicant or frappe.session.user,
                "date": add_working_days(_today(), SLA_WORKING_DAYS, _holidays(doc.employee)).isoformat(),
            }
        ).insert(ignore_permissions=True)
    _approver_alert(doc, applicant)


def _close_alerts(rule: str, name: str) -> None:
    import frappe

    for a in frappe.get_all("HR Alert", filters={"rule": rule, "subject_doctype": DOCTYPE, "subject_name": name}, fields=["name"], limit=0):
        for t in frappe.get_all("ToDo", filters={"reference_type": "HR Alert", "reference_name": a["name"], "status": "Open"}, fields=["name"], limit=0):
            frappe.db.set_value("ToDo", t["name"], "status", "Closed")


def _approver_alert(doc: Any, applicant: str | None) -> None:
    """No usable approver: one HR Alert to the named HR Managers. Its ToDos close once the claim is settled."""
    import frappe

    from eswasa_hr.alerts import raise_alert

    if not frappe.db.exists("DocType", "HR Alert"):
        return
    open_ = is_open(doc.approval_status, doc.docstatus)
    problem = approver_problem(doc.expense_approver, applicant) if open_ else None
    if problem:
        raise_alert(f"expense-approver:{doc.name}", RULE_APPROVER, approver_alert_title(doc.employee_name, problem),
                    _hr_managers(exclude=applicant), _today().isoformat(), doc.employee, (DOCTYPE, doc.name))
        return
    if not open_:
        _close_alerts(RULE_APPROVER, doc.name)
        _close_alerts(RULE_OVERDUE, doc.name)


def escalate_overdue() -> int:
    """Daily (provisional): a Draft claim past its 3-working-day due date raises one alert to the named Accounts
    Managers, once per claim. The approver's ToDo stays; Finance can decide it in Approvals."""
    import frappe

    from eswasa_hr.alerts import raise_alert

    if not frappe.db.exists("DocType", "HR Alert"):
        return 0
    day = _today()
    due: dict[str, date] = {}
    for t in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "status": "Open", "date": ["<", day.isoformat()]}, fields=["reference_name", "date"], limit=0):
        d = _as_date(t["date"])
        due[t["reference_name"]] = min(d, due.get(t["reference_name"], d))
    n = 0
    for name in sorted(due):
        doc = frappe.db.get_value(DOCTYPE, name, ["name", "employee", "employee_name", "approval_status", "docstatus", "expense_approver", "total_claimed_amount"], as_dict=True)
        if not doc or not is_open(doc.get("approval_status"), doc.get("docstatus")):
            continue
        applicant = _applicant_user(doc)
        users = _finance_users(exclude=[u for u in (applicant, doc.get("expense_approver")) if u])
        n += raise_alert(f"expense-overdue:{name}", RULE_OVERDUE, overdue_title(doc.get("employee_name"), doc.get("total_claimed_amount"), due[name]),
                         users, day.isoformat(), doc.get("employee"), (DOCTYPE, name))
    return n


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler (hook ``eswasa_approval_handlers``): approve or reject, then submit. HR doesn't pay."""
    import frappe
    from frappe import _

    doc = frappe.get_doc(DOCTYPE, name)
    err = decider_error(frappe.session.user, doc.expense_approver, _applicant_user(doc), frappe.get_roles())
    if err:
        frappe.throw(_(err), frappe.PermissionError)
    if not is_open(doc.approval_status, doc.docstatus):
        frappe.throw(_("This claim was already decided ({0}).").format(doc.approval_status), frappe.ValidationError)
    try:
        status = decision_status(action)
    except ValueError as exc:
        frappe.throw(_(str(exc)), frappe.ValidationError)
    note = (comment or "").strip()
    if status == "Rejected" and not note:
        frappe.throw(_("Say why you're not approving it. The employee sees your note."), frappe.ValidationError)

    doc.approval_status = status
    if status == "Approved":
        for line in doc.get("expenses") or []:
            if not line.get("sanctioned_amount"):
                line.sanctioned_amount = line.get("amount")
    doc.submit()
    if note:
        doc.add_comment("Comment", note)
    sync_todo(doc)
    from eswasa_hr import notify

    notify.queue(f"expense-decided:{name}", [_applicant_user(doc)], "expense_decided",
                 {"decision": "approved" if status == "Approved" else "not approved", "total": money(doc.total_claimed_amount, getattr(doc, "currency", None))})
    return {
        "ok": True,
        "doctype": DOCTYPE,
        "name": name,
        "action": action,
        "workflow_action": None,
        "status": status,
        "message": _("Expense claim {0} for {1}").format(status.lower(), doc.employee_name),
    }


_LIST_FIELDS = ["name", "employee", "employee_name", "department", "posting_date", "total_claimed_amount", "total_sanctioned_amount",
                "approval_status", "status", "docstatus", "expense_approver"]


def _rows(filters: dict[str, Any], or_filters: list[list[Any]] | None = None) -> list[dict[str, Any]]:
    import frappe

    rows = frappe.get_all(DOCTYPE, filters=filters, or_filters=or_filters, fields=_LIST_FIELDS, order_by="posting_date desc", limit=500)
    names = [r["name"] for r in rows]
    sla: dict[str, Any] = {}
    if names:
        for t in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": ["in", names], "status": "Open"}, fields=["reference_name", "date"], limit=0):
            if t.get("date"):
                sla[t["reference_name"]] = t["date"]
    day = _today()
    return [claim_row(r, sla.get(r["name"]), day) for r in rows]


def _my_employee(user: str) -> str | None:
    import frappe

    return frappe.db.get_value("Employee", {"user_id": user}, "name")


def mine_impl() -> list[dict[str, Any]]:
    """The caller's own claims, newest first, with where each one is and who decides it."""
    import frappe

    employee = _my_employee(frappe.session.user)
    return _rows({"employee": employee}) if employee else []


def list_impl(status: str | None = None, employee: str | None = None, department: str | None = None) -> list[dict[str, Any]]:
    """HR and Finance see every claim; everyone else their own and the ones routed to them."""
    import frappe

    from eswasa_hr.scope import viewer_for

    v = viewer_for()
    filters: dict[str, Any] = {}
    if status:
        filters["approval_status"] = status
    if employee:
        filters["employee"] = employee
    if department:
        filters["department"] = department
    everyone = v.hr or FINANCE_ROLE in v.roles
    mine = v.employee or _my_employee(v.user)
    or_filters = None if everyone else [["employee", "=", mine or "__none__"], ["expense_approver", "=", v.user]]
    return _rows(filters, or_filters)


def detail_impl(name: str) -> dict[str, Any]:
    """Lines and attachments, scoped like the list."""
    import frappe

    from eswasa_hr.scope import viewer_for

    if not frappe.db.exists(DOCTYPE, name):
        frappe.throw(f"Expense claim {name} not found.", frappe.DoesNotExistError)
    doc = frappe.get_doc(DOCTYPE, name)
    v = viewer_for()
    if not can_see(v.user, v.roles, v.employee or _my_employee(v.user), {"employee": doc.employee, "expense_approver": doc.expense_approver}):
        frappe.throw("You can only see your own expense claims and the ones you approve.", frappe.PermissionError)
    sla = frappe.db.get_value("ToDo", {"reference_type": DOCTYPE, "reference_name": name, "status": "Open"}, "date")
    row = claim_row({k: doc.get(k) for k in _LIST_FIELDS}, sla, _today())
    files = frappe.get_all("File", filters={"attached_to_doctype": DOCTYPE, "attached_to_name": name}, fields=["name", "file_name", "file_url"], limit=0)
    return {
        **row,
        "description": doc.get("remark") or None,
        "lines": [line_row(dict(line) if isinstance(line, dict) else line.as_dict()) for line in doc.get("expenses") or []],
        "attachments": [{"id": f["name"], "file_name": f.get("file_name"), "url": f.get("file_url")} for f in files],
    }


def submit_impl(lines: list[dict[str, Any]], description: str | None = None, attachments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """A Draft claim for the caller's Employee, routed to their expense approver (sync_todo runs on insert)."""
    import frappe

    user = frappe.session.user
    employee = frappe.db.get_value("Employee", {"user_id": user}, ["name", "employee_name", "company", "expense_approver", "status"], as_dict=True)
    if not employee or employee.get("status") != "Active":
        frappe.throw("Your login isn't linked to an active employee record. Ask HR to link it.", frappe.ValidationError)
    if not employee.get("expense_approver"):
        frappe.throw("You don't have an expense approver yet. Ask HR to set one on your record.", frappe.ValidationError)
    attachments = attachments or []
    err = attachment_error(attachments) or claim_errors(lines, [a.get("file_name") for a in attachments], threshold(), _today())
    if err:
        frappe.throw(err, frappe.ValidationError)
    doc = frappe.get_doc(
        {
            "doctype": DOCTYPE,
            "employee": employee["name"],
            "company": employee.get("company"),
            "expense_approver": employee["expense_approver"],
            "approval_status": "Draft",
            "posting_date": _today().isoformat(),
            "remark": (description or "").strip() or None,
            "expenses": [
                {
                    "expense_type": line["expense_type"].strip(),
                    "expense_date": str(_as_date(line["expense_date"])),
                    "description": (line.get("description") or "").strip() or None,
                    "amount": _num(line["amount"]),
                    "custom_receipt": line.get("receipt") or None,
                }
                for line in lines
            ],
        }
    ).insert()
    for a in attachments:
        frappe.get_doc({"doctype": "File", "file_name": a["file_name"].strip(), "file_url": a["url"].strip(), "is_private": 1,
                        "attached_to_doctype": DOCTYPE, "attached_to_name": doc.name}).insert(ignore_permissions=True)
    return {"ok": True, "name": doc.name, "status": "Waiting for approval", "approver": employee["expense_approver"],
            "message": f"Expense claim sent to your approver ({money(total(lines))})"}


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


def _parse(value: Any) -> Any:
    if isinstance(value, str):
        import json

        return json.loads(value) if value.strip() else None
    return value


@_whitelist
def claims(status: str | None = None, employee: str | None = None, department: str | None = None) -> list[dict[str, Any]]:
    return list_impl(status, employee, department)


@_whitelist
def detail(name: str) -> dict[str, Any]:
    return detail_impl(name)


@_whitelist
def mine() -> list[dict[str, Any]]:
    return mine_impl()


@_whitelist
def submit(lines: Any = None, description: str | None = None, attachments: Any = None, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return submit_impl(_parse(lines) or [], description, _parse(attachments) or [])
