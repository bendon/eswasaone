"""
Employee lifecycle (brief §4; journeys J8 and J9; screens H2a, H7b).

Promotion and transfer: HR prepares an HRMS Employee Promotion / Employee Transfer as a draft with only the
fields that change. Every HR Manager except the preparer gets an approval ToDo (``eswasa_approval_handlers``).
Approving records ``custom_approved_by`` and submits it when the effective date has come (HRMS refuses earlier
submission); otherwise the daily job submits it on the date. HRMS then updates the Employee and its history.

Leaving: HR records the reason and last day and prepares an Employee Separation with an offboarding checklist
(named owners, as for onboarding). Another HR Manager approves; submitting creates the tasks. On the last day
the daily job sets the employee to Left, disables their login and moves their open ToDos to the line manager
with the reason logged (brief §4).

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from eswasa_hr import settings

PROMOTION = "Employee Promotion"
TRANSFER = "Employee Transfer"
SEPARATION = "Employee Separation"
CHANGE_DOCTYPES = (PROMOTION, TRANSFER, SEPARATION)
HR_ROLES = ("HR Manager", "HR User", "System Manager")
REASONS = ("Resignation", "End of fixed-term contract", "Retirement", "Dismissal", "Death in service", "Other")
# Fields a promotion or transfer may change, with the label HRMS shows in the history.
CHANGEABLE = {
    "designation": "Designation",
    "grade": "Grade",
    "department": "Department",
    "branch": "Branch",
    "reports_to": "Reports To",
}
SEPARATION_TEMPLATE = "Employee Separation Template"  # HR's offboarding checklist (custom_owner, custom_team)


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def property_rows(current: dict[str, Any], wanted: dict[str, Any]) -> list[dict[str, Any]]:
    """Employee Property History rows for fields that actually change."""
    rows = []
    for field, label in CHANGEABLE.items():
        new = wanted.get(field)
        if new in (None, ""):
            continue
        old = current.get(field)
        if str(new) != str(old or ""):
            rows.append({"property": label, "fieldname": field, "current": old or "", "new": new})
    return rows


def change_title(kind: str, employee_name: str, rows: list[dict[str, Any]]) -> str:
    what = {PROMOTION: "promotion", TRANSFER: "transfer", SEPARATION: "separation"}[kind]
    detail = "; ".join(f"{r['property']} {r['current'] or '—'} → {r['new']}" for r in rows[:2])
    return f"Approve {what}: {employee_name}" + (f" ({detail})" if detail else "")


def separation_errors(reason: str, last_day: Any, notice_date: Any) -> list[str]:
    errs = []
    if reason not in REASONS:
        errs.append("Choose why the person is leaving.")
    end, notice = _d(last_day), _d(notice_date)
    if not end:
        errs.append("Choose the last working day.")
    elif notice and end < notice:
        errs.append("The last day can't be before the notice was given.")
    return errs


def default_offboarding(hr_user: str | None, manager_user: str | None, template: list[tuple[str, str, str]]) -> list[dict[str, Any]]:
    owners = {"hr": hr_user, "manager": manager_user, "pick": None}
    return [{"activity_name": n, "group": g, "user": owners.get(k)} for k, n, g in template]


def interview_date(last_day: Any, today: date) -> date:
    """The working day before the last day, but never in the past."""
    end = _d(last_day) or today
    return max(today, date.fromordinal(end.toordinal() - 1))


def exit_title(employee_name: str) -> str:
    return f"Hold exit interview with {employee_name}"


def reassigned_description(original: str, leaver: str, last_day: date) -> str:
    return f"{original} [Moved from {leaver}, who left on {last_day.day} {last_day.strftime('%b %Y')}]"


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _is_hr() -> bool:
    import frappe

    return bool(set(frappe.get_roles()) & set(HR_ROLES))


def _require_hr() -> None:
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can do this.", frappe.PermissionError)


def _route(doc: Any, title: str, due: Any) -> None:
    import frappe

    from eswasa_hr.recruitment import _hr_manager_users

    for user in _hr_manager_users(exclude=frappe.session.user):
        if frappe.db.exists("ToDo", {"reference_type": doc.doctype, "reference_name": doc.name, "allocated_to": user, "status": "Open"}):
            continue
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": user,
                "description": title,
                "reference_type": doc.doctype,
                "reference_name": doc.name,
                "status": "Open",
                "priority": "Medium",
                "assigned_by": frappe.session.user,
                "date": due,
            }
        ).insert(ignore_permissions=True)


def _close(doctype: str, name: str) -> None:
    import frappe

    for row in frappe.get_all("ToDo", filters={"reference_type": doctype, "reference_name": name, "status": "Open"}, fields=["name"]):
        frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")


def _employee(employee: str) -> dict[str, Any]:
    import frappe

    e = frappe.db.get_value(
        "Employee",
        employee,
        ["name", "employee_name", "company", "department", "designation", "grade", "branch", "reports_to", "status", "user_id", "relieving_date"],
        as_dict=True,
    )
    if not e:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    return dict(e)


def _pending(employee: str, doctype: str) -> bool:
    import frappe

    return bool(frappe.db.exists(doctype, {"employee": employee, "docstatus": 0}))


def prepare_change_impl(kind: str, employee: str, effective: str, wanted: dict[str, Any], note: str | None, revised_ctc: float | None = None) -> dict[str, Any]:
    import frappe
    from frappe.utils import add_days

    _require_hr()
    if kind not in (PROMOTION, TRANSFER):
        frappe.throw("Unknown change.", frappe.ValidationError)
    e = _employee(employee)
    if e["status"] != "Active":
        frappe.throw("Only an active employee can be promoted or transferred.", frappe.ValidationError)
    if _pending(employee, kind):
        frappe.throw("A change like this is already waiting for approval for this person.", frappe.ValidationError)
    rows = property_rows(e, wanted)
    if not rows:
        frappe.throw("Nothing changes. Choose at least one new value.", frappe.ValidationError)
    if not _d(effective):
        frappe.throw("Choose the date it takes effect.", frappe.ValidationError)
    doc: dict[str, Any] = {"doctype": kind, "employee": employee, "employee_name": e["employee_name"], "company": e["company"], "department": e["department"]}
    if kind == PROMOTION:
        doc.update({"promotion_date": effective, "promotion_details": rows})
        if revised_ctc:
            doc["revised_ctc"] = float(revised_ctc)
    else:
        doc.update({"transfer_date": effective, "transfer_details": rows})
    d = frappe.get_doc(doc)
    d.insert()
    if (note or "").strip():
        d.add_comment("Comment", note.strip())
    _route(d, change_title(kind, e["employee_name"], rows), add_days(_today(), settings.get("decision_sla_days")))
    return changes_impl(employee)


def prepare_separation_impl(employee: str, reason: str, notice_date: str | None, last_day: str, activities: list[dict[str, Any]], note: str | None) -> dict[str, Any]:
    import frappe
    from frappe.utils import add_days

    from eswasa_hr.onboarding import checklist_errors

    _require_hr()
    e = _employee(employee)
    if e["status"] != "Active":
        frappe.throw("This person isn't active.", frappe.ValidationError)
    if _pending(employee, SEPARATION) or frappe.db.exists(SEPARATION, {"employee": employee, "docstatus": 1}):
        frappe.throw("A separation already exists for this person.", frappe.ValidationError)
    errs = separation_errors(reason, last_day, notice_date)
    rows = [{"activity_name": str(a.get("activity_name") or "").strip(), "user": a.get("user")} for a in activities or []]
    errs += checklist_errors(rows)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    d = frappe.get_doc(
        {
            "doctype": SEPARATION,
            "employee": employee,
            "employee_name": e["employee_name"],
            "company": e["company"],
            "department": e["department"],
            "designation": e["designation"],
            "resignation_letter_date": notice_date or None,
            "boarding_begins_on": _today().isoformat(),
            "boarding_status": "Pending",
            "custom_reason": reason,
            "exit_interview": (note or "").strip() or None,
            "activities": [{**r, "duration": 5, "begin_on": 0} for r in rows],
        }
    )
    d.insert()
    _route(d, f"Approve separation: {e['employee_name']}, {reason.lower()}, last day {last_day}", add_days(_today(), settings.get("decision_sla_days")))
    frappe.db.set_value("Employee", employee, {"relieving_date": last_day, "reason_for_leaving": reason}, update_modified=True)
    return changes_impl(employee)


def decide_change(name: str, action: str, comment: str | None = None, doctype: str | None = None) -> dict[str, Any]:
    """Approvals handler for Employee Promotion / Transfer / Separation: an HR Manager who didn't prepare it."""
    import frappe

    dt = doctype or next((d for d in CHANGE_DOCTYPES if frappe.db.exists(d, name)), None)
    if not dt:
        frappe.throw("Not found.", frappe.DoesNotExistError)
    doc = frappe.get_doc(dt, name)
    if not set(frappe.get_roles()) & {"HR Manager", "System Manager"}:
        frappe.throw("Only an HR Manager can approve this.", frappe.PermissionError)
    if doc.owner == frappe.session.user:
        frappe.throw("You prepared this, so another HR Manager must approve it.", frappe.PermissionError)
    if int(doc.docstatus or 0) != 0 or doc.get("custom_approved_by"):
        frappe.throw("This was already decided.", frappe.ValidationError)
    key = (action or "").strip().lower()
    note = (comment or "").strip()
    if key == "approve":
        doc.custom_approved_by = frappe.session.user
        doc.save()
        effective = _d(doc.get("promotion_date") or doc.get("transfer_date")) if dt != SEPARATION else _today()
        submitted = effective is not None and effective <= _today()
        if submitted:
            doc.submit()
            if dt == SEPARATION:
                start_exit_interview(doc)
        state = "Approved" + ("" if submitted else f", takes effect {effective.isoformat()}")
    elif key in ("reject", "return"):
        if not note:
            frappe.throw("Say why, so HR can correct it.", frappe.ValidationError)
        # The draft is discarded so HR can prepare a corrected one; the reason stays on the employee's record.
        frappe.get_doc("Employee", doc.employee).add_comment(
            "Comment", f"{dt} {name} sent back by {frappe.session.user}: {note}"
        )
        if dt == SEPARATION:
            frappe.db.set_value("Employee", doc.employee, {"relieving_date": None, "reason_for_leaving": None}, update_modified=True)
        _close(dt, name)
        frappe.delete_doc(dt, name, ignore_permissions=True)
        state = "Sent back"
    else:
        frappe.throw("Approve or send back.", frappe.ValidationError)
    _close(dt, name)
    return {"ok": True, "doctype": dt, "name": name, "action": action, "workflow_action": None, "status": state, "message": f"{dt}: {state}"}


def _handler(dt: str):
    def h(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
        return decide_change(name, action, comment, dt)

    return h


decide_promotion = _handler(PROMOTION)
decide_transfer = _handler(TRANSFER)
decide_separation = _handler(SEPARATION)


EXIT = "Exit Interview"  # HRMS DocType
EXIT_ROLES = ("HR Manager", "System Manager")


def start_exit_interview(sep: Any) -> str | None:
    """On an approved separation: an HRMS Exit Interview with the HR person who prepared the separation as the
    interviewer (its owner), dated the day before the last day. The questionnaire is ESWASA's to supply; until
    then the interviewer writes a free-text summary when closing the Approvals card. Fields are set only where
    the installed HRMS has them."""
    import frappe

    if not frappe.db.exists("DocType", EXIT):
        return None
    existing = frappe.db.get_value(EXIT, {"employee": sep.employee, "docstatus": ["<", 2]}, "name")
    if existing:
        return existing
    e = _employee(sep.employee)
    on = interview_date(e.get("relieving_date"), _today())
    interviewer = sep.owner
    meta = frappe.get_meta(EXIT)
    values = {"doctype": EXIT, "employee": sep.employee, "date": on.isoformat(), "owner": interviewer}
    for field, value in (("employee_name", e["employee_name"]), ("company", e.get("company")), ("department", e.get("department")),
                         ("designation", e.get("designation")), ("reports_to", e.get("reports_to")), ("relieving_date", e.get("relieving_date")),
                         ("ref_doctype", SEPARATION), ("reference_document_name", sep.name)):
        if value not in (None, "") and meta.has_field(field):
            values[field] = value
    d = frappe.get_doc(values)
    d.insert(ignore_permissions=True)
    frappe.get_doc(
        {
            "doctype": "ToDo",
            "allocated_to": interviewer,
            "description": exit_title(e["employee_name"]),
            "reference_type": EXIT,
            "reference_name": d.name,
            "status": "Open",
            "priority": "Medium",
            "assigned_by": frappe.session.user,
            "date": on.isoformat(),
        }
    ).insert(ignore_permissions=True)
    _link_exit_task(sep, d.name)
    return d.name


def _link_exit_task(sep: Any, interview: str) -> None:
    """Point the offboarding "Exit interview" task at the interview record (best effort: tasks come from HRMS)."""
    import frappe

    project = sep.get("project") if hasattr(sep, "get") else getattr(sep, "project", None)
    if not project:
        return
    for t in frappe.get_all("Task", filters={"project": project, "subject": ["like", "Exit interview%"]}, fields=["name", "description"], limit=0):
        note = f"Exit Interview {interview}"
        if note not in (t.get("description") or ""):
            frappe.db.set_value("Task", t["name"], "description", ((t.get("description") or "") + f"\n{note}").strip())


def decide_exit_interview(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler: the interviewer (or an HR Manager) records that the interview was held, with a summary."""
    import frappe

    doc = frappe.get_doc(EXIT, name)
    roles = set(frappe.get_roles())
    if doc.owner != frappe.session.user and not roles & set(EXIT_ROLES):
        frappe.throw("Only the interviewer or an HR Manager can close this.", frappe.PermissionError)
    note = (comment or "").strip()
    if (action or "").strip().lower() not in ("approve", "done", "acknowledge"):
        frappe.throw("Mark the interview as held.", frappe.ValidationError)
    if not note:
        frappe.throw("Write a short summary of the interview.", frappe.ValidationError)
    meta = frappe.get_meta(EXIT)
    changes: dict[str, Any] = {}
    if meta.has_field("interview_summary"):
        changes["interview_summary"] = note
    if meta.has_field("status"):
        changes["status"] = "Completed"
    if changes:
        frappe.db.set_value(EXIT, name, changes)
    if not meta.has_field("interview_summary"):
        doc.add_comment("Comment", note)
    _close(EXIT, name)
    return {"ok": True, "doctype": EXIT, "name": name, "action": action, "workflow_action": None, "status": "Held", "message": "Exit interview: held"}


def exit_interview_query(user: str | None = None, doctype: str | None = None) -> str:
    """Like cases: HR Managers and the interviewer only; no line-manager or HR User read."""
    import frappe

    user = user or frappe.session.user
    if set(frappe.get_roles(user)) & set(EXIT_ROLES):
        return ""
    return f"`tab{EXIT}`.`owner` = {frappe.db.escape(user)}"


def exit_interview_has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    import frappe

    user = user or frappe.session.user
    if set(frappe.get_roles(user)) & set(EXIT_ROLES):
        return True
    owner = doc.get("owner") if isinstance(doc, dict) else getattr(doc, "owner", None)
    return not owner or owner == user


def changes_impl(employee: str) -> dict[str, Any]:
    """Pending and past changes for one person (record History tab). HR only."""
    _require_hr()
    return history(employee)


def history(employee: str) -> dict[str, Any]:
    """The History rows without the HR check; callers check scope (eswasa_hr.record)."""
    import frappe

    items = []
    for dt, date_field, rows_field in ((PROMOTION, "promotion_date", "promotion_details"), (TRANSFER, "transfer_date", "transfer_details")):
        for r in frappe.get_all(dt, filters={"employee": employee, "docstatus": ["<", 2]}, fields=["name", date_field, "docstatus", "custom_approved_by", "owner"], order_by=f"{date_field} desc", limit=20):
            detail = frappe.get_all("Employee Property History", filters={"parent": r["name"]}, fields=["property", "current", "new"], limit=0)
            items.append(
                {
                    "id": r["name"],
                    "kind": "promotion" if dt == PROMOTION else "transfer",
                    "date": str(r[date_field]) if r.get(date_field) else None,
                    "state": "Done" if r["docstatus"] == 1 else ("Approved, waiting for the date" if r.get("custom_approved_by") else "Waiting for approval"),
                    "changes": [{"property": x["property"], "current": x["current"], "new": x["new"]} for x in detail],
                }
            )
    sep = frappe.get_all(SEPARATION, filters={"employee": employee, "docstatus": ["<", 2]}, fields=["name", "docstatus", "custom_reason", "custom_approved_by", "boarding_status"], limit=1)
    e = _employee(employee)
    if sep:
        s = sep[0]
        items.append(
            {
                "id": s["name"],
                "kind": "separation",
                "date": str(e["relieving_date"]) if e.get("relieving_date") else None,
                "state": ("Offboarding " + (s.get("boarding_status") or "Pending").lower()) if s["docstatus"] == 1 else "Waiting for approval",
                "changes": [{"property": "Reason", "current": "", "new": s.get("custom_reason") or ""}],
            }
        )
    from eswasa_hr.contracts import items_for

    items += items_for(employee)
    items.sort(key=lambda x: x["date"] or "", reverse=True)
    return {"employee": employee, "employee_name": e["employee_name"], "status": e["status"], "items": items}


def _separation_template(e: dict[str, Any]) -> list[tuple[str, str, str]]:
    from eswasa_hr.seed_records import template_rows

    return template_rows(SEPARATION_TEMPLATE, e)


def separation_defaults_impl(employee: str) -> dict[str, Any]:
    import frappe

    _require_hr()
    e = _employee(employee)
    manager_user = frappe.db.get_value("Employee", e["reports_to"], "user_id") if e.get("reports_to") else None
    return {
        "employee": employee,
        "employee_name": e["employee_name"],
        "reasons": list(REASONS),
        "activities": [{**r, "user_name": (frappe.db.get_value("User", r["user"], "full_name") or r["user"]) if r["user"] else None} for r in default_offboarding(frappe.session.user, manager_user, _separation_template(e))],
    }


def submit_due_changes() -> int:
    """Daily: submit approved promotions and transfers whose date has come."""
    import frappe

    day = _today()
    n = 0
    for dt, field in ((PROMOTION, "promotion_date"), (TRANSFER, "transfer_date")):
        for r in frappe.get_all(dt, filters={"docstatus": 0, "custom_approved_by": ["is", "set"], field: ["<=", day]}, fields=["name"], limit=0):
            frappe.get_doc(dt, r["name"]).submit()
            n += 1
    return n


def process_last_days() -> int:
    """Daily (brief §4): on the last day, Left + login disabled + open ToDos moved to the line manager."""
    import frappe

    day = _today()
    n = 0
    for e in frappe.get_all(
        "Employee",
        filters={"status": "Active", "relieving_date": ["<=", day]},
        fields=["name", "employee_name", "user_id", "reports_to", "relieving_date"],
        limit=0,
    ):
        if not frappe.db.exists(SEPARATION, {"employee": e["name"], "docstatus": 1}):
            continue  # not approved: nothing happens on the date
        manager_user = frappe.db.get_value("Employee", e["reports_to"], "user_id") if e.get("reports_to") else None
        last = _d(e["relieving_date"])
        if e.get("user_id"):
            for t in frappe.get_all("ToDo", filters={"allocated_to": e["user_id"], "status": "Open"}, fields=["name", "description"], limit=0):
                if manager_user:
                    frappe.db.set_value("ToDo", t["name"], {"allocated_to": manager_user, "description": reassigned_description(t.get("description") or "", e["employee_name"], last)})
                else:
                    frappe.db.set_value("ToDo", t["name"], "status", "Cancelled")
            frappe.db.set_value("User", e["user_id"], "enabled", 0)
        frappe.db.set_value("Employee", e["name"], "status", "Left")
        frappe.get_doc("Employee", e["name"]).add_comment(
            "Comment", f"Left on {last.isoformat()}. Login disabled; open tasks moved to {manager_user or 'nobody (no line manager), so cancelled'}."
        )
        n += 1
    return n


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
def promote(employee: str, effective: str, designation: str | None = None, grade: str | None = None, reports_to: str | None = None, revised_ctc: Any = None, note: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return prepare_change_impl(PROMOTION, employee, effective, {"designation": designation, "grade": grade, "reports_to": reports_to}, note, float(revised_ctc) if revised_ctc else None)


@_whitelist
def transfer(employee: str, effective: str, department: str | None = None, designation: str | None = None, branch: str | None = None, reports_to: str | None = None, note: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return prepare_change_impl(TRANSFER, employee, effective, {"department": department, "designation": designation, "branch": branch, "reports_to": reports_to}, note)


@_whitelist
def separate(employee: str, reason: str, last_day: str, notice_date: str | None = None, activities: Any = None, note: str | None = None, confirm: Any = False) -> dict[str, Any]:
    import frappe

    _confirm(confirm)
    rows = frappe.parse_json(activities) if isinstance(activities, str) else (activities or [])
    return prepare_separation_impl(employee, reason, notice_date, last_day, rows, note)


@_whitelist
def changes(employee: str) -> dict[str, Any]:
    return changes_impl(employee)


@_whitelist
def separation_defaults(employee: str) -> dict[str, Any]:
    return separation_defaults_impl(employee)


@_whitelist
def offboarding(name: str) -> dict[str, Any]:
    from eswasa_hr.onboarding import detail_impl

    return detail_impl(name, SEPARATION)
