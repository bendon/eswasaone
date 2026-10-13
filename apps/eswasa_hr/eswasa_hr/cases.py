"""
Cases (brief §10; journey J10; screens H10, H10a, E9).

Two kinds, one register:
- **Grievance:** native HRMS ``Employee Grievance`` (Open → Investigated → Resolved, or Invalid). Raised by the
  employee in confidence from My HR, or opened by an HR Manager.
- **Disciplinary:** ``Disciplinary Case`` (Opened → Investigation → Hearing scheduled → Outcome issued → Appeal →
  Closed). Opened by an HR Manager only.

Access: only HR Managers and the named case owner (and, during an appeal, the appeal owner) can read a case.
HR User is not enough. The register never names the people involved; the case itself does. Permission hooks keep
Desk in line; neither DocType is in global search; Ask/Esi has no tool that reads them. The Board sees counts only.

Routing: each step is one ToDo for the named owner, never a pool, and its title carries no names. An appeal goes to
someone other than whoever issued the outcome.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable

from eswasa_hr import settings

GRIEVANCE = "Employee Grievance"
DISCIPLINARY = "Disciplinary Case"
KIND_DOCTYPE = {"grievance": GRIEVANCE, "disciplinary": DISCIPLINARY}
STAGES = {
    "grievance": ["Open", "Investigated", "Resolved"],
    "disciplinary": ["Opened", "Investigation", "Hearing scheduled", "Outcome issued", "Appeal", "Closed"],
}
CLOSED = {"grievance": {"Resolved", "Invalid", "Cancelled"}, "disciplinary": {"Closed"}}
MANAGER_ROLES = {"HR Manager", "System Manager"}
HR_ROLES = {"HR Manager", "HR User", "System Manager"}
# Plan 01: ESWASA's disciplinary code (A1). The catalogue ships empty; the lists below are the mechanism.
OFFENCE = "Disciplinary Offence"
LEVELS = ["Minor", "Serious", "Gross"]
SANCTIONS = ["No action", "Verbal warning", "Written warning", "Final written warning", "Suspension", "Dismissal"]
ACTIVE, EXPIRED, WITHDRAWN = "Active", "Expired", "Withdrawn"
UPHELD, OVERTURNED = "Upheld", "Overturned"
APPEAL_RESULTS = [UPHELD, OVERTURNED]
# How long each warning stays on file: HR Settings, empty until ESWASA answers (provisional, A1).
WARNING_MONTHS = {
    "Verbal warning": "custom_verbal_warning_months",
    "Written warning": "custom_written_warning_months",
    "Final written warning": "custom_final_warning_months",
}
WARNING_RULE = "Warning expired"


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def next_stages(kind: str, stage: str) -> list[str]:
    """Where a case can go from here: one step forward, plus the side exits."""
    if stage in CLOSED[kind]:
        return []
    order = STAGES[kind]
    out = [order[order.index(stage) + 1]] if stage in order and order.index(stage) + 1 < len(order) else []
    if kind == "grievance":
        out.append("Invalid")
    if kind == "disciplinary" and stage == "Outcome issued":
        out.append("Closed")  # no appeal
    return out


def move_errors(kind: str, stage: str, target: str, note: str | None, outcome: str | None, appeal_owner: str | None, decided_by: str | None,
                offence: str | None = None, sanction: str | None = None, has_code: bool = False, appeal_result: str | None = None) -> list[str]:
    errs = []
    if target not in next_stages(kind, stage):
        return [f"A case at {stage} can't move to {target}."]
    if not (note or "").strip():
        errs.append("Add a note on what happened at this step.")
    if kind == "disciplinary" and target == "Outcome issued":
        errs += outcome_errors(kind, offence, sanction, outcome, has_code)
    elif target in ("Outcome issued", "Resolved", "Invalid") and not (outcome or "").strip():
        errs.append("Record the outcome.")
    if kind == "disciplinary" and stage == "Appeal" and target == "Closed" and appeal_result not in APPEAL_RESULTS:
        errs.append("Say whether the appeal upheld or overturned the outcome.")
    if target == "Appeal":
        if not appeal_owner:
            errs.append("Choose who hears the appeal.")
        elif appeal_owner == decided_by:
            errs.append("The appeal can't go to whoever issued the outcome.")
    return errs


def owner_error(owner: str | None, involved_users: Iterable[str | None]) -> str | None:
    if not owner:
        return "Choose the case owner."
    if owner in {u for u in involved_users if u}:
        return "The owner can't be one of the people involved."
    return None


def step_title(case_id: str, step: str | None, due: Any) -> str:
    """ToDo title: never names anyone involved."""
    d = _d(due)
    when = f" by {d.day} {d.strftime('%b %Y')}" if d else ""
    return f"Case {case_id}: {step or 'next step'}{when}"


def board_counts(rows: Iterable[dict[str, Any]], day: date) -> list[dict[str, Any]]:
    """Board view (brief §10): per kind, open, closed this year, and average days to close. No names."""
    out = {k: {"kind": k, "open": 0, "closed_this_year": 0, "avg_days_to_close": None, "_days": []} for k in STAGES}
    for r in rows:
        c = out[r["kind"]]
        closed = _d(r.get("closed_on"))
        if not closed:
            c["open"] += 1
            continue
        if closed.year == day.year:
            c["closed_this_year"] += 1
        opened = _d(r.get("opened_on"))
        if opened:
            c["_days"].append((closed - opened).days)
    for c in out.values():
        days = c.pop("_days")
        c["avg_days_to_close"] = round(sum(days) / len(days), 1) if days else None
    return list(out.values())


def outcome_errors(kind: str, offence: str | None, sanction: str | None, outcome: str | None, has_code: bool = False) -> list[str]:
    """A disciplinary outcome names the offence (once ESWASA's code has offences), the sanction and what was decided.
    "No action" still needs the outcome text."""
    if kind != "disciplinary":
        return []
    errs = []
    if has_code and not offence:
        errs.append("Choose the offence from the disciplinary code.")
    if sanction not in SANCTIONS:
        errs.append("Choose the sanction.")
    if not (outcome or "").strip():
        errs.append("Record the outcome.")
    return errs


def is_warning(sanction: str | None) -> bool:
    return sanction in WARNING_MONTHS


def outcome_comment(sanction: str | None, expires: Any) -> str:
    if not is_warning(sanction):
        return f"Sanction: {sanction}."
    d = _d(expires)
    return f"Sanction: {sanction}, active until {d.isoformat()}." if d else f"Sanction: {sanction}. Expiry not set: awaiting ESWASA (A1)."


def _add_months(d: date, months: int) -> date:
    from calendar import monthrange

    y, m = divmod(d.month - 1 + months, 12)
    y, m = d.year + y, m + 1
    return date(y, m, min(d.day, monthrange(y, m)[1]))


def warning_expiry(sanction: str | None, issued_on: Any, months_by_sanction: dict[str, Any]) -> date | None:
    """When a warning stops counting. None when it isn't a warning, or HR Settings has no validity for it yet (A1)."""
    issued = _d(issued_on)
    if not issued or not is_warning(sanction):
        return None
    try:
        months = int(months_by_sanction.get(sanction) or 0)
    except (TypeError, ValueError):
        months = 0
    return _add_months(issued, months) if months > 0 else None


def active_warnings(rows: Iterable[dict[str, Any]], today: date) -> list[dict[str, Any]]:
    """Warnings that still count: status Active and no expiry yet, or an expiry on or after today."""
    out = []
    for r in rows:
        exp = _d(r.get("warning_expires_on"))
        if r.get("warning_status") == ACTIVE and is_warning(r.get("sanction")) and (exp is None or exp >= today):
            out.append(r)
    return out


def lapsed_warnings(rows: Iterable[dict[str, Any]], today: date) -> list[dict[str, Any]]:
    """Active warnings whose expiry has passed: the daily job marks them Expired."""
    return [r for r in rows if r.get("warning_status") == ACTIVE and _d(r.get("warning_expires_on")) and _d(r.get("warning_expires_on")) < today]


def appeal_warning_status(status: str | None, result: str | None) -> str | None:
    """An overturned outcome withdraws its warning; an upheld one leaves it as it was."""
    return WITHDRAWN if status and result == OVERTURNED else status


def offence_errors(code: str | None, title: str | None, level: str | None, suggested_sanction: str | None, taken: Iterable[str] = ()) -> list[str]:
    errs = []
    if not (code or "").strip():
        errs.append("Give the offence a code.")
    elif code.strip() in set(taken):
        errs.append(f"Code {code.strip()} is already in the disciplinary code.")
    if not (title or "").strip():
        errs.append("Name the offence.")
    if level not in LEVELS:
        errs.append("Choose the level: " + ", ".join(LEVELS) + ".")
    if suggested_sanction and suggested_sanction not in SANCTIONS:
        errs.append("Choose a sanction from the list.")
    return errs


def code_state(active_offences: int, months: dict[str, Any]) -> tuple[bool, str]:
    """HR setup "Disciplinary code": done once there's an active offence and every warning has a validity."""
    unset = [s for s in WARNING_MONTHS if not months.get(s)]
    done = bool(active_offences) and not unset
    parts = [f"{active_offences} active offences" if active_offences else "No offences yet"]
    parts.append("warning validity set." if not unset else "validity not set for " + ", ".join(s.lower() for s in unset) + ".")
    return done, "; ".join(parts) if done else "; ".join(parts) + " Awaiting ESWASA (A1)."


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _is_manager(user: str | None = None) -> bool:
    import frappe

    return bool(set(frappe.get_roles(user) if user else frappe.get_roles()) & MANAGER_ROLES)


def _user_of(employee: str | None) -> str | None:
    import frappe

    return frappe.db.get_value("Employee", employee, "user_id") if employee else None


def _name_of(user: str | None) -> str | None:
    import frappe

    return (frappe.db.get_value("User", user, "full_name") or user) if user else None


def _kind_of(doctype: str) -> str:
    return "grievance" if doctype == GRIEVANCE else "disciplinary"


def _load(kind: str, name: str) -> Any:
    import frappe

    if kind not in KIND_DOCTYPE:
        frappe.throw("Unknown kind of case.", frappe.ValidationError)
    if not frappe.db.exists(KIND_DOCTYPE[kind], name):
        frappe.throw("Case not found.", frappe.DoesNotExistError)
    return frappe.get_doc(KIND_DOCTYPE[kind], name)


def _fields(doc: Any) -> dict[str, Any]:
    """The same view of either DocType."""
    if doc.doctype == GRIEVANCE:
        return {
            "kind": "grievance",
            "stage": doc.status or "Open",
            "employee": doc.raised_by,
            "owner": doc.get("custom_case_owner"),
            "opened_on": doc.get("date"),
            "next_step": doc.get("custom_next_step"),
            "next_step_due": doc.get("custom_next_step_due"),
            "description": doc.description,
            "outcome": doc.get("resolution_detail"),
            "decided_by": doc.get("resolved_by"),
            "appeal_owner": None,
            "closed_on": doc.get("resolution_date"),
            "offence": None,
            "sanction": None,
            "outcome_on": None,
            "warning_expires_on": None,
            "warning_status": None,
            "appeal_result": None,
            "warning_letter": None,
        }
    return {
        "kind": "disciplinary",
        "stage": doc.get("stage") or "Opened",
        "employee": doc.employee,
        "owner": doc.owner_user,
        "opened_on": doc.opened_on,
        "next_step": doc.get("next_step"),
        "next_step_due": doc.get("next_step_due"),
        "description": doc.allegation,
        "outcome": doc.get("outcome"),
        "decided_by": doc.get("decided_by"),
        "appeal_owner": doc.get("appeal_owner"),
        "closed_on": doc.get("closed_on"),
        "offence": doc.get("offence"),
        "sanction": doc.get("sanction"),
        "outcome_on": doc.get("outcome_on"),
        "warning_expires_on": doc.get("warning_expires_on"),
        "warning_status": doc.get("warning_status"),
        "appeal_result": doc.get("appeal_result"),
        "warning_letter": doc.get("warning_letter"),  # HR additions plan 03
    }


def _can_read(f: dict[str, Any], user: str) -> bool:
    if _is_manager():
        return True
    return user in {f["owner"], f["appeal_owner"] if f["stage"] == "Appeal" else None}


def _require_read(doc: Any) -> dict[str, Any]:
    import frappe

    f = _fields(doc)
    if not _can_read(f, frappe.session.user):
        frappe.throw("Only the HR Manager and the case owner can see this case.", frappe.PermissionError)
    return f


def _route(doc: Any, user: str | None, step: str | None, due: Any) -> None:
    """Close the case's open ToDos and give the next step to one named person."""
    import frappe

    for t in frappe.get_all("ToDo", filters={"reference_type": doc.doctype, "reference_name": doc.name, "status": "Open"}, fields=["name"], limit=0):
        frappe.db.set_value("ToDo", t["name"], "status", "Closed")
    if not user:
        return
    frappe.get_doc(
        {
            "doctype": "ToDo",
            "allocated_to": user,
            "description": step_title(doc.name, step, due),
            "reference_type": doc.doctype,
            "reference_name": doc.name,
            "status": "Open",
            "priority": "High",
            "date": due or None,
        }
    ).insert(ignore_permissions=True)


def owners_impl() -> list[dict[str, Any]]:
    """HR Managers who can own a case (named users)."""
    from eswasa_hr.recruitment import _hr_manager_users

    return [{"user": u, "name": _name_of(u)} for u in _hr_manager_users()]


def list_impl() -> dict[str, Any]:
    """H10 register: the cases you may read, without the names of anyone involved."""
    import frappe

    user = frappe.session.user
    day = _today()
    items = []
    for dt in (GRIEVANCE, DISCIPLINARY):
        if not frappe.db.exists("DocType", dt):
            continue
        for r in frappe.get_all(dt, filters={"docstatus": ["<", 2]}, fields=["name"], order_by="creation desc", limit=500):
            f = _fields(frappe.get_doc(dt, r["name"]))
            if not _can_read(f, user):
                continue
            due = _d(f["next_step_due"])
            closed = f["stage"] in CLOSED[f["kind"]]
            items.append(
                {
                    "id": r["name"],
                    "kind": f["kind"],
                    "opened_on": str(f["opened_on"]) if f["opened_on"] else None,
                    "stage": f["stage"],
                    "owner_name": _name_of(f["owner"]),
                    "next_step": None if closed else f["next_step"],
                    "next_step_due": None if closed or not due else due.isoformat(),
                    "overdue": bool(due and not closed and due < day),
                    "closed": closed,
                }
            )
    items.sort(key=lambda x: (x["closed"], x["opened_on"] or ""), reverse=False)
    return {"items": items, "can_open": _is_manager(), "owners": owners_impl() if _is_manager() else []}


def detail_impl(kind: str, name: str) -> dict[str, Any]:
    """H10a: one case with its people, stage, notes, next step and appeal routing."""
    import frappe

    doc = _load(kind, name)
    f = _require_read(doc)
    people = [{"employee": f["employee"], "employee_name": frappe.db.get_value("Employee", f["employee"], "employee_name"), "role": "Raised it" if kind == "grievance" else "Subject of the case"}]
    notes = [
        {"text": c["content"], "by": _name_of(c["owner"]), "on": str(c["creation"])[:10]}
        for c in frappe.get_all("Comment", filters={"reference_doctype": doc.doctype, "reference_name": name, "comment_type": "Comment"}, fields=["content", "owner", "creation"], order_by="creation desc", limit=100)
    ]
    user = frappe.session.user
    acting = user in {f["owner"], f["appeal_owner"] if f["stage"] == "Appeal" else None} or _is_manager()
    return {
        "id": name,
        "kind": kind,
        "stage": f["stage"],
        "stages": STAGES[kind],
        "next": next_stages(kind, f["stage"]) if acting else [],
        "opened_on": str(f["opened_on"]) if f["opened_on"] else None,
        "owner": f["owner"],
        "owner_name": _name_of(f["owner"]),
        "people": people,
        "description": f["description"],
        "next_step": f["next_step"],
        "next_step_due": str(f["next_step_due"]) if f["next_step_due"] else None,
        "outcome": f["outcome"],
        "decided_by": f["decided_by"],
        "decided_by_name": _name_of(f["decided_by"]),
        "appeal_owner_name": _name_of(f["appeal_owner"]),
        "talk_first": bool(doc.get("custom_talk_first")) if kind == "grievance" else False,
        "notes": notes,
        "owners": owners_impl() if _is_manager() else [],
        **(_disciplinary_view(f) if kind == "disciplinary" else {}),
    }


def _disciplinary_view(f: dict[str, Any]) -> dict[str, Any]:
    """Plan 01: offence, sanction and warning on the case, plus what the outcome form offers."""
    import frappe

    title = frappe.db.get_value(OFFENCE, f["offence"], "title") if f["offence"] and _has(OFFENCE) else None
    return {
        "offence": f["offence"],
        "offence_title": title,
        "sanction": f["sanction"],
        "outcome_on": str(f["outcome_on"]) if f["outcome_on"] else None,
        "warning_expires_on": str(f["warning_expires_on"]) if f["warning_expires_on"] else None,
        "warning_status": f["warning_status"],
        "appeal_result": f["appeal_result"],
        "warning_letter": f.get("warning_letter"),
        "sanctions": list(SANCTIONS),
        "appeal_results": list(APPEAL_RESULTS),
        "offences": _offences(active_only=True),
        "warning_months": warning_months(),
    }


def _has(doctype: str) -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", doctype))


def warning_months() -> dict[str, int | None]:
    """HR Settings validity per warning sanction; None while unset (provisional, A1)."""
    from eswasa_hr.settings import _raw

    out: dict[str, int | None] = {}
    for sanction, field in WARNING_MONTHS.items():
        try:
            out[sanction] = int(_raw(field) or 0) or None
        except (TypeError, ValueError):
            out[sanction] = None
    return out


def _offence_row(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": r["name"],
        "title": r.get("title"),
        "category": r.get("category"),
        "level": r.get("level"),
        "suggested_sanction": r.get("suggested_sanction") or None,
        "description": r.get("description"),
        "active": bool(r.get("active")),
    }


def _offences(active_only: bool = False) -> list[dict[str, Any]]:
    import frappe

    if not _has(OFFENCE):
        return []
    filters = {"active": 1} if active_only else {}
    rows = frappe.get_all(OFFENCE, filters=filters, fields=["name", "title", "category", "level", "suggested_sanction", "description", "active"], order_by="name asc", limit=0)
    return [_offence_row(r) for r in rows]


def open_impl(kind: str, employee: str, owner: str, description: str, next_step: str | None, next_step_due: str | None, subject: str | None = None, grievance_type: str | None = None,
              offence: str | None = None) -> dict[str, Any]:
    """H10 Open a case (HR Manager)."""
    import frappe

    if not _is_manager():
        frappe.throw("Only an HR Manager can open a case.", frappe.PermissionError)
    if kind not in KIND_DOCTYPE:
        frappe.throw("Choose grievance or disciplinary.", frappe.ValidationError)
    e = frappe.db.get_value("Employee", employee, ["name", "company", "user_id"], as_dict=True)
    if not e:
        frappe.throw("Choose the person involved.", frappe.ValidationError)
    errs = [x for x in [owner_error(owner, [e.get("user_id")])] if x]
    if not (description or "").strip():
        errs.append("Say what happened.")
    if kind == "disciplinary" and offence and not frappe.db.get_value(OFFENCE, {"name": offence, "active": 1}, "name"):
        errs.append("Choose an active offence from the disciplinary code.")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    day = _today().isoformat()
    if kind == "grievance":
        doc = frappe.get_doc(_grievance(employee, e["company"], subject or "Grievance", description, grievance_type, owner, next_step, next_step_due, False))
    else:
        doc = frappe.get_doc(
            {
                "doctype": DISCIPLINARY,
                "employee": employee,
                "kind": "Disciplinary",
                "opened_on": day,
                "owner_user": owner,
                "stage": "Opened",
                "allegation": description.strip(),
                "offence": offence or None,
                "next_step": (next_step or "").strip() or None,
                "next_step_due": next_step_due or None,
            }
        )
    doc.insert(ignore_permissions=True)
    _route(doc, owner, next_step or "first step", next_step_due)
    return detail_impl(kind, doc.name)


def _grievance(employee: str, company: str, subject: str, description: str, grievance_type: str | None, owner: str | None, next_step: str | None, due: str | None, talk_first: bool) -> dict[str, Any]:
    import frappe

    gtype = grievance_type or frappe.db.get_value("Grievance Type", {}, "name")
    if not gtype:
        frappe.throw("No grievance categories are set up yet. HR adds them in HR setup.", frappe.ValidationError)
    return {
        "doctype": GRIEVANCE,
        "subject": subject.strip()[:140],
        "raised_by": employee,
        "date": _today().isoformat(),
        "status": "Open",
        "grievance_type": gtype,
        # Against the organisation by default; the case owner records who is involved in the notes.
        "grievance_against_party": "Company",
        "grievance_against": company,
        "description": description.strip(),
        "custom_case_owner": owner,
        "custom_next_step": (next_step or "").strip() or None,
        "custom_next_step_due": due or None,
        "custom_talk_first": 1 if talk_first else 0,
    }


def raise_impl(grievance_type: str | None, description: str, not_handled_by: list[str], talk_first: bool) -> dict[str, Any]:
    """E9: an employee raises a concern in confidence. It goes to one HR Manager they didn't exclude."""
    import frappe
    from frappe.utils import add_days

    from eswasa_hr.recruitment import _hr_manager_users
    from eswasa_hr.team import _me

    me = _me()
    if not me:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    if not (description or "").strip():
        frappe.throw("Say what happened: facts, dates, anyone who saw it.", frappe.ValidationError)
    candidates = [u for u in _hr_manager_users(exclude=frappe.session.user) if u not in set(not_handled_by or [])]
    if not candidates:
        frappe.throw("There's no HR Manager left to handle it. Take out one of the people you excluded, or speak to the Executive Director.", frappe.ValidationError)
    owner = candidates[0]
    company = frappe.db.get_value("Employee", me, "company")
    due = add_days(_today(), settings.get("head_sla_days"))
    doc = frappe.get_doc(_grievance(me, company, f"Concern raised in confidence ({grievance_type or 'general'})", description, grievance_type, owner, "Meet the employee" if talk_first else "Acknowledge and plan the next step", due, talk_first))
    doc.insert(ignore_permissions=True)
    if not_handled_by:
        doc.add_comment("Comment", "The employee asked that these people don't handle it: " + ", ".join(_name_of(u) or u for u in not_handled_by))
    _route(doc, owner, doc.custom_next_step, due)
    return {"id": doc.name, "raised_on": doc.date, "status": "Open", "handled_by": _name_of(owner)}


def mine_impl() -> dict[str, Any]:
    """E9 / My HR: the concerns I raised, with their status only, and the categories to choose from."""
    import frappe

    from eswasa_hr.recruitment import _hr_manager_users
    from eswasa_hr.team import _me

    me = _me()
    items = []
    if me:
        for g in frappe.get_all(GRIEVANCE, filters={"raised_by": me, "docstatus": ["<", 2]}, fields=["name", "date", "status"], order_by="creation desc", limit=20):
            items.append({"id": g["name"], "raised_on": str(g["date"]) if g.get("date") else None, "status": g["status"]})
    return {
        "items": items,
        "categories": [t["name"] for t in frappe.get_all("Grievance Type", fields=["name"], order_by="name asc", limit=0)],
        "handlers": [{"user": u, "name": _name_of(u)} for u in _hr_manager_users(exclude=frappe.session.user)],
    }


def act_impl(kind: str, name: str, to_stage: str, note: str, next_step: str | None, next_step_due: str | None, outcome: str | None, appeal_owner: str | None,
             offence: str | None = None, sanction: str | None = None, appeal_result: str | None = None) -> dict[str, Any]:
    """H10a: move a case on one step (owner, appeal owner or HR Manager)."""
    import frappe

    doc = _load(kind, name)
    f = _require_read(doc)
    user = frappe.session.user
    if not (_is_manager() or user == f["owner"] or (f["stage"] == "Appeal" and user == f["appeal_owner"])):
        frappe.throw("Only the case owner or an HR Manager can move it on.", frappe.PermissionError)
    offence = offence or f["offence"]
    active_code = bool(kind == "disciplinary" and _offences(active_only=True))
    errs = move_errors(kind, f["stage"], to_stage, note, outcome, appeal_owner, f["decided_by"], offence, sanction, active_code, appeal_result)
    if kind == "disciplinary" and to_stage == "Outcome issued" and offence and not frappe.db.get_value(OFFENCE, {"name": offence, "active": 1}, "name"):
        errs.append("Choose an active offence from the disciplinary code.")
    if appeal_owner and appeal_owner == _user_of(f["employee"]):
        errs.append("The appeal can't go to the person the case is about.")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    day = _today().isoformat()
    closing = to_stage in CLOSED[kind]
    if kind == "grievance":
        doc.status = to_stage
        if closing:
            doc.resolved_by = user
            doc.resolution_date = day
            doc.resolution_detail = outcome.strip()
        doc.custom_next_step = None if closing else ((next_step or "").strip() or None)
        doc.custom_next_step_due = None if closing else (next_step_due or None)
    else:
        doc.stage = to_stage
        if to_stage == "Outcome issued":
            doc.outcome = outcome.strip()
            doc.decided_by = user
            doc.offence = offence or None
            doc.sanction = sanction
            doc.outcome_on = day
            expires = warning_expiry(sanction, day, warning_months())
            doc.warning_expires_on = expires.isoformat() if expires else None
            doc.warning_status = ACTIVE if is_warning(sanction) else None
        if f["stage"] == "Appeal" and to_stage == "Closed":
            doc.appeal_result = appeal_result
            doc.warning_status = appeal_warning_status(f["warning_status"], appeal_result)
        if to_stage == "Appeal":
            doc.appeal_owner = appeal_owner
        if closing:
            doc.closed_on = day
        doc.next_step = None if closing else ((next_step or "").strip() or None)
        doc.next_step_due = None if closing else (next_step_due or None)
    doc.flags.ignore_permissions = True
    doc.save()
    if kind == "grievance" and closing and int(doc.docstatus or 0) == 0:
        doc.submit()
    doc.add_comment("Comment", f"{to_stage}: {note.strip()}")
    if kind == "disciplinary" and to_stage == "Outcome issued":
        doc.add_comment("Comment", outcome_comment(sanction, doc.get("warning_expires_on")))
    if kind == "disciplinary" and f["stage"] == "Appeal" and to_stage == "Closed":
        doc.add_comment("Comment", f"Appeal {appeal_result.lower()}." + (" The warning is withdrawn." if doc.get("warning_status") == WITHDRAWN and f["warning_status"] != WITHDRAWN else ""))
    who = None if closing else appeal_owner if to_stage == "Appeal" else f["owner"]
    _route(doc, who, None if closing else (next_step or to_stage), None if closing else next_step_due)
    return detail_impl(kind, name)


def note_impl(kind: str, name: str, text: str) -> dict[str, Any]:
    import frappe

    doc = _load(kind, name)
    _require_read(doc)
    if not (text or "").strip():
        frappe.throw("Write the note.", frappe.ValidationError)
    doc.add_comment("Comment", text.strip())
    return detail_impl(kind, name)


def reassign_impl(kind: str, name: str, owner: str, note: str) -> dict[str, Any]:
    """HR Manager hands the case to another owner (never someone involved)."""
    import frappe

    if not _is_manager():
        frappe.throw("Only an HR Manager can change the owner.", frappe.PermissionError)
    doc = _load(kind, name)
    f = _fields(doc)
    errs = [x for x in [owner_error(owner, [_user_of(f["employee"])])] if x]
    if not (note or "").strip():
        errs.append("Say why.")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    if kind == "grievance":
        doc.custom_case_owner = owner
    else:
        doc.owner_user = owner
    doc.flags.ignore_permissions = True
    doc.save()
    doc.add_comment("Comment", f"Owner changed to {_name_of(owner)}: {note.strip()}")
    if f["stage"] not in CLOSED[kind]:
        _route(doc, owner, f["next_step"], f["next_step_due"])
    return detail_impl(kind, name)


def warnings_impl(employee: str) -> dict[str, Any]:
    """H1b Warnings: the person's warnings. HR Manager sees all; a case owner only those on cases they may read.
    Everyone else is refused. Never carries the allegation."""
    import frappe

    if not employee or not frappe.db.exists("Employee", employee):
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    manager = _is_manager()
    user = frappe.session.user
    rows = frappe.get_all(DISCIPLINARY, filters={"employee": employee, "warning_status": ["is", "set"], "docstatus": ["<", 2]}, fields=["name"], order_by="creation desc", limit=0) if _has(DISCIPLINARY) else []
    mine = [f for f in (_fields(frappe.get_doc(DISCIPLINARY, r["name"])) | {"id": r["name"]} for r in rows) if manager or _can_read(f, user)]
    if not manager and not mine:
        frappe.throw("Only the HR Manager and the case owner can see warnings.", frappe.PermissionError)
    titles = {o["code"]: o["title"] for o in _offences()}
    items = [
        {
            "case": f["id"],
            "sanction": f["sanction"],
            "offence": f["offence"],
            "offence_title": titles.get(f["offence"]) if f["offence"] else None,
            "issued_on": str(f["outcome_on"]) if f["outcome_on"] else None,
            "expires_on": str(f["warning_expires_on"]) if f["warning_expires_on"] else None,
            "status": f["warning_status"],
        }
        for f in mine
    ]
    active = active_warnings(mine, _today())
    dated = sorted(str(a["warning_expires_on"]) for a in active if a["warning_expires_on"])
    # "Active until" only when every active warning has a date; one without an expiry keeps the flag open-ended.
    return {"employee": employee, "items": items, "active": len(active), "active_until": dated[-1] if dated and len(dated) == len(active) else None}


def offences_impl() -> dict[str, Any]:
    """H10b: the disciplinary code (HR roles read; HR Manager edits)."""
    import frappe

    if not set(frappe.get_roles()) & HR_ROLES:
        frappe.throw("Only HR can see the disciplinary code.", frappe.PermissionError)
    return {"items": _offences(), "can_edit": _is_manager(), "levels": list(LEVELS), "sanctions": list(SANCTIONS), "warning_months": warning_months()}


def _require_code_editor() -> None:
    import frappe

    if not _is_manager():
        frappe.throw("Only an HR Manager can change the disciplinary code.", frappe.PermissionError)
    if not _has(OFFENCE):
        frappe.throw("The disciplinary code isn't installed on this site yet (bench migrate).", frappe.ValidationError)


def create_offence_impl(code: str, title: str, level: str, category: str | None = None, suggested_sanction: str | None = None, description: str | None = None) -> dict[str, Any]:
    import frappe

    _require_code_editor()
    taken = [r["name"] for r in frappe.get_all(OFFENCE, fields=["name"], limit=0)]
    errs = offence_errors(code, title, level, suggested_sanction, taken)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    frappe.get_doc(
        {
            "doctype": OFFENCE,
            "name": code.strip(),  # autoname field:code; set so the row is addressable straight away
            "code": code.strip(),
            "title": title.strip(),
            "category": (category or "").strip() or None,
            "level": level,
            "suggested_sanction": suggested_sanction or None,
            "description": (description or "").strip() or None,
            "active": 1,
        }
    ).insert(ignore_permissions=True)
    return offences_impl()


def update_offence_impl(code: str, changes: dict[str, Any]) -> dict[str, Any]:
    """Edit or deactivate an offence. The code stays (cases link to it); an offence is never deleted."""
    import frappe

    _require_code_editor()
    if not frappe.db.exists(OFFENCE, code):
        frappe.throw("Offence not found.", frappe.DoesNotExistError)
    cur = frappe.db.get_value(OFFENCE, code, ["title", "level", "suggested_sanction"], as_dict=True)
    allowed = {k: v for k, v in (changes or {}).items() if k in ("title", "category", "level", "suggested_sanction", "description", "active") and v is not None}
    merged = {**cur, **allowed}
    errs = offence_errors(code, merged.get("title"), merged.get("level"), merged.get("suggested_sanction"))
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    if "active" in allowed:
        allowed["active"] = 1 if allowed["active"] in (True, 1, "1") else 0
    for k in ("title", "category", "description"):
        if k in allowed:
            allowed[k] = (str(allowed[k]).strip() or None) if k != "title" else str(allowed[k]).strip()
    if allowed:
        frappe.db.set_value(OFFENCE, code, allowed)
    return offences_impl()


def expire_warnings() -> int:
    """Daily (plan 01): lapsed warnings become Expired; the case owner alone is told, once per case."""
    import frappe

    from eswasa_hr.alerts import raise_alert

    if not _has(DISCIPLINARY):
        return 0
    day = _today()
    rows = frappe.get_all(DISCIPLINARY, filters={"warning_status": ACTIVE, "warning_expires_on": ["<", day.isoformat()]},
                          fields=["name", "owner_user", "sanction", "warning_status", "warning_expires_on"], limit=0)
    n = 0
    for r in lapsed_warnings(rows, day):
        frappe.db.set_value(DISCIPLINARY, r["name"], "warning_status", EXPIRED)
        exp = _d(r["warning_expires_on"])
        # No employee on the alert: HR Alerts are wider-read than cases; the case id is enough for the owner.
        raise_alert(f"warning:{r['name']}:expired", WARNING_RULE, f"Case {r['name']}: warning expired on {exp.day} {exp.strftime('%b %Y')}",
                    [u for u in [r.get("owner_user")] if u], day.isoformat(), None, (DISCIPLINARY, r["name"]))
        n += 1
    return n


def code_step() -> dict[str, Any]:
    """HR setup step "Disciplinary code" (overview.setup_status_impl)."""
    import frappe

    from eswasa_hr.overview import AWAITING, DONE, step

    active = frappe.db.count(OFFENCE, {"active": 1}) if _has(OFFENCE) else 0
    done, detail = code_state(active, warning_months())
    return step("disciplinary_code", "Disciplinary code", DONE if done else AWAITING, detail, "/hr/cases/code", awaiting=None if done else "A1")


def board_impl() -> dict[str, Any]:
    """Counts only, for the Board HR pack."""
    import frappe

    rows = []
    for dt in (GRIEVANCE, DISCIPLINARY):
        if not frappe.db.exists("DocType", dt):
            continue
        for r in frappe.get_all(dt, filters={"docstatus": ["<", 2]}, fields=["name"], limit=0):
            f = _fields(frappe.get_doc(dt, r["name"]))
            rows.append({"kind": f["kind"], "opened_on": f["opened_on"], "closed_on": f["closed_on"] if f["stage"] in CLOSED[f["kind"]] else None})
    return {"kinds": board_counts(rows, _today())}


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals "Mark done" on a case ToDo: cases move on only from the case page."""
    import frappe

    frappe.throw("Open the case in EswasaOne (HR & People → Cases) to record the next step.", frappe.ValidationError)
    return {}  # pragma: no cover


# ---------------------------------------------------------------- Desk access (permission hooks narrow only)


def _escape(v: str) -> str:
    import frappe

    return frappe.db.escape(v)


def grievance_query(user: str | None = None, doctype: str | None = None) -> str:
    import frappe

    user = user or frappe.session.user
    if _is_manager(user):
        return ""
    return f"`tabEmployee Grievance`.`custom_case_owner` = {_escape(user)}"


def disciplinary_query(user: str | None = None, doctype: str | None = None) -> str:
    import frappe

    user = user or frappe.session.user
    if _is_manager(user):
        return ""
    u = _escape(user)
    return f"(`tabDisciplinary Case`.`owner_user` = {u} or (`tabDisciplinary Case`.`stage` = 'Appeal' and `tabDisciplinary Case`.`appeal_owner` = {u}))"


def has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    import frappe

    user = user or frappe.session.user
    if _is_manager(user):
        return True
    f = _fields(doc)
    return user in {f["owner"], f["appeal_owner"] if f["stage"] == "Appeal" else None}


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


def _confirm(confirm: Any) -> None:
    from eswasa_hr.lifecycle import _confirm as c

    c(confirm)


def _json(v: Any) -> Any:
    import frappe

    return frappe.parse_json(v) if isinstance(v, str) else v


@_whitelist
def register() -> dict[str, Any]:
    return list_impl()


@_whitelist
def detail(kind: str, name: str) -> dict[str, Any]:
    return detail_impl(kind, name)


@_whitelist
def open_case(kind: str, employee: str, owner: str, description: str, next_step: str | None = None, next_step_due: str | None = None, subject: str | None = None, grievance_type: str | None = None,
              offence: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return open_impl(kind, employee, owner, description, next_step, next_step_due, subject, grievance_type, offence)


@_whitelist
def act(kind: str, name: str, to_stage: str, note: str = "", next_step: str | None = None, next_step_due: str | None = None, outcome: str | None = None, appeal_owner: str | None = None,
        offence: str | None = None, sanction: str | None = None, appeal_result: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return act_impl(kind, name, to_stage, note, next_step, next_step_due, outcome, appeal_owner, offence, sanction, appeal_result)


@_whitelist
def add_note(kind: str, name: str, text: str = "", confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return note_impl(kind, name, text)


@_whitelist
def reassign(kind: str, name: str, owner: str, note: str = "", confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return reassign_impl(kind, name, owner, note)


@_whitelist
def raise_concern(description: str = "", grievance_type: str | None = None, not_handled_by: Any = None, talk_first: Any = False, confirm: Any = False) -> dict[str, Any]:
    from frappe.utils import cint

    _confirm(confirm)
    return raise_impl(grievance_type, description, _json(not_handled_by) or [], bool(cint(talk_first)))


@_whitelist
def my_concerns() -> dict[str, Any]:
    return mine_impl()


@_whitelist
def board() -> dict[str, Any]:
    from eswasa_hr.lifecycle import _require_hr

    _require_hr()
    return board_impl()


@_whitelist
def offences() -> dict[str, Any]:
    return offences_impl()


@_whitelist
def create_offence(code: str = "", title: str = "", level: str = "", category: str | None = None, suggested_sanction: str | None = None, description: str | None = None,
                   confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return create_offence_impl(code, title, level, category, suggested_sanction, description)


@_whitelist
def update_offence(code: str, changes: Any = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return update_offence_impl(code, _json(changes) or {})


@_whitelist
def warnings(employee: str) -> dict[str, Any]:
    return warnings_impl(employee)
