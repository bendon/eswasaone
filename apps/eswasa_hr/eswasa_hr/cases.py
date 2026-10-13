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


def move_errors(kind: str, stage: str, target: str, note: str | None, outcome: str | None, appeal_owner: str | None, decided_by: str | None) -> list[str]:
    errs = []
    if target not in next_stages(kind, stage):
        return [f"A case at {stage} can't move to {target}."]
    if not (note or "").strip():
        errs.append("Add a note on what happened at this step.")
    if target in ("Outcome issued", "Resolved", "Invalid") and not (outcome or "").strip():
        errs.append("Record the outcome.")
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
    }


def open_impl(kind: str, employee: str, owner: str, description: str, next_step: str | None, next_step_due: str | None, subject: str | None = None, grievance_type: str | None = None) -> dict[str, Any]:
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


def act_impl(kind: str, name: str, to_stage: str, note: str, next_step: str | None, next_step_due: str | None, outcome: str | None, appeal_owner: str | None) -> dict[str, Any]:
    """H10a: move a case on one step (owner, appeal owner or HR Manager)."""
    import frappe

    doc = _load(kind, name)
    f = _require_read(doc)
    user = frappe.session.user
    if not (_is_manager() or user == f["owner"] or (f["stage"] == "Appeal" and user == f["appeal_owner"])):
        frappe.throw("Only the case owner or an HR Manager can move it on.", frappe.PermissionError)
    errs = move_errors(kind, f["stage"], to_stage, note, outcome, appeal_owner, f["decided_by"])
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
def open_case(kind: str, employee: str, owner: str, description: str, next_step: str | None = None, next_step_due: str | None = None, subject: str | None = None, grievance_type: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return open_impl(kind, employee, owner, description, next_step, next_step_due, subject, grievance_type)


@_whitelist
def act(kind: str, name: str, to_stage: str, note: str = "", next_step: str | None = None, next_step_due: str | None = None, outcome: str | None = None, appeal_owner: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return act_impl(kind, name, to_stage, note, next_step, next_step_due, outcome, appeal_owner)


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
