"""
Bulk actions, decided in Approvals (additions plan 06; screen H18).

HR applies one change to a group from a single screen, like Sage's Multiple Transactions Manager:

- **Office closure leave**: one Approved, submitted Leave Application per person for the working days of the
  closure they aren't already on leave, so the ledger, balances and calendar stay right without special cases.
  Whether closure days come out of annual leave is ESWASA's policy (A7): nothing is pre-filled, HR picks the type.
- **Leave allocation**: one Leave Allocation per person (days typed by HR), or the person's grade leave policy
  assigned (``use_policy``). Entitlements per grade come from ESWASA's leave policy (H14); never typed here.

Flow: a dry-run preview (no writes) → saved as Draft with its rows → Waiting, as an "Approve bulk …" card to the
named HR Managers other than the preparer → approve sets Applying and enqueues ``apply_job`` on the ``long`` queue.
``apply_job`` re-checks every row, records Done / Skipped / Failed per person, and never repeats a row that already
has its ``ref`` (every created document also carries the bulk name), so a retry never duplicates.

Bulk reminders (no approval; low risk) go to everyone in the selection who owes something, at most once a day per
kind and person. Bulk termination is deliberately out of scope.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Iterable

ACTION = "HR Bulk Action"
ROW = "HR Bulk Action Row"
HR_ROLES = ("HR Manager", "HR User", "System Manager")
MANAGER_ROLES = ("HR Manager", "System Manager")

CLOSURE, ALLOCATION = "Office closure leave", "Leave allocation"
KINDS = (CLOSURE, ALLOCATION)
DRAFT, WAITING, APPLYING, APPLIED, PARTLY, NOT_APPROVED, SENT_BACK = (
    "Draft", "Waiting", "Applying", "Applied", "Partly applied", "Not approved", "Sent back")
DONE, SKIPPED, FAILED = "Done", "Skipped", "Failed"

REMIND_DOCUMENTS, REMIND_DECLARATION, REMIND_APPRAISAL, REMIND_ITEMS = (
    "Missing required documents", "Unsigned declaration", "Open appraisal step", "Unacknowledged items")
REMINDER_KINDS = (REMIND_DOCUMENTS, REMIND_DECLARATION, REMIND_APPRAISAL, REMIND_ITEMS)

PROVISIONAL_APPROVER = "Approver provisional: a named HR Manager other than the preparer."
CLOSURE_NOTE = "Awaiting ESWASA (A7): closure dates, and whether closure days come out of annual leave. Nothing is pre-filled."
ALLOCATION_NOTE = "Entitlements per grade come from ESWASA's leave policy (H14); they are never typed here."

ACTION_FIELDS = ["name", "kind", "parameters", "selection", "prepared_by", "status", "approved_by", "decided_on", "note", "summary",
                 "creation", "modified"]
PERSON_FIELDS = ["name", "employee_name", "status", "department", "employment_type", "date_of_joining", "grade", "company", "user_id"]
ROW_FIELDS = ["name", "idx", "employee", "employee_name", "planned", "days", "balance_after", "problem", "result", "ref", "error"]


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _num(v: Any) -> float | None:
    try:
        return None if v in (None, "") else float(v)
    except (TypeError, ValueError):
        return None


def _fmt(n: float) -> str:
    return str(int(n)) if float(n).is_integer() else f"{n:g}"


def _plural(n: float, word: str) -> str:
    return f"{_fmt(n)} {word}" + ("" if n == 1 else "s")


def truthy(v: Any) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def bulk_marker(name: str) -> str:
    """Every document a bulk action creates carries this in its description (re-run safety and the audit trail)."""
    return f"(bulk {name})"


def is_bulk(description: Any) -> bool:
    return "(bulk " in str(description or "")


def closure_description(name: str, start: Any, end: Any, reason: str | None = None) -> str:
    a, b = _d(start), _d(end)
    text = f"Office closure {a.isoformat()}–{b.isoformat()} {bulk_marker(name)}"
    return f"{text}. {reason.strip()}" if (reason or "").strip() else text


def allocation_description(name: str) -> str:
    return f"Yearly allocation {bulk_marker(name)}"


def approve_title(kind: str, n: int) -> str:
    """An approve card in Approvals (``inferFamily`` reads the leading verb)."""
    return f"Approve bulk {kind.lower()}: {_plural(n, 'person') if n == 1 else f'{n} people'}"


def selection_clean(selection: Any) -> dict[str, list[str]]:
    s = selection if isinstance(selection, dict) else {}

    def names(key: str) -> list[str]:
        out: list[str] = []
        for v in s.get(key) or []:
            v = str(v).strip()
            if v and v not in out:
                out.append(v)
        return out

    return {"departments": names("departments"), "employment_types": names("employment_types"), "employees": names("employees")}


def selection_text(selection: dict[str, list[str]]) -> str:
    s = selection_clean(selection)
    if s["employees"]:
        return _plural(len(s["employees"]), "picked person") if len(s["employees"]) == 1 else f"{len(s['employees'])} picked people"
    parts = [", ".join(s["departments"]) or "every department"]
    if s["employment_types"]:
        parts.append(", ".join(s["employment_types"]))
    return "Active staff in " + "; ".join(parts)


def parameter_errors(kind: str | None, p: dict[str, Any]) -> list[str]:
    if kind not in KINDS:
        return ["Choose office closure leave or leave allocation."]
    errs: list[str] = []
    try:
        a, b = _d(p.get("from_date")), _d(p.get("to_date"))
    except (TypeError, ValueError):
        a = b = None
    if kind == CLOSURE:
        if not str(p.get("leave_type") or "").strip():
            errs.append("Choose the leave type the closure days come out of.")
        if not a or not b:
            errs.append("Give the first and last day of the closure.")
        elif b < a:
            errs.append("The last day can't be before the first day.")
        elif (b - a).days > 31:
            errs.append("A closure can be at most a month; split a longer one.")
        return errs
    if not truthy(p.get("use_policy")) and not str(p.get("leave_type") or "").strip():
        errs.append("Choose the leave type to allocate.")
    if not a or not b:
        errs.append("Give the start and end of the allocation period.")
    elif b < a:
        errs.append("The period can't end before it starts.")
    if not truthy(p.get("use_policy")):
        n = _num(p.get("days"))
        if n is None or n <= 0:
            errs.append("Give the number of days, or use each person's leave policy.")
        elif n > 366:
            errs.append("That's more days than a year has.")
    return errs


def working_dates(start: Any, end: Any, holidays: Iterable[date] = ()) -> list[date]:
    """Monday–Friday dates in the range that aren't in the person's holiday list."""
    off = set(holidays)
    a, b = _d(start), _d(end)
    out, d = [], a
    while d <= b:
        if d.weekday() < 5 and d not in off:
            out.append(d)
        d += timedelta(days=1)
    return out


def _covered(d: date, ranges: Iterable[tuple[Any, Any]]) -> bool:
    return any(_d(f) <= d <= _d(t or f) for f, t in ranges)


def segments(dates: list[date], existing: Iterable[tuple[Any, Any]] = ()) -> list[tuple[date, date]]:
    """Runs of leave days to apply, split only where existing leave sits in between (weekends and holidays inside a
    run don't split it: HRMS doesn't count them as leave days)."""
    existing = list(existing)
    out: list[tuple[date, date]] = []
    for d in sorted(dates):
        if out and not any(_covered(x, existing) for x in _between(out[-1][1], d)):
            out[-1] = (out[-1][0], d)
        else:
            out.append((d, d))
    return out


def _between(a: date, b: date) -> list[date]:
    return [a + timedelta(days=i) for i in range(1, (b - a).days)]


def closure_row(person: dict[str, Any], start: Any, end: Any, holidays: Iterable[date], balance: float | None,
                existing: Iterable[tuple[Any, Any]], allow_negative: bool = False) -> dict[str, Any]:
    """One person's preview for an office closure: days off, balance after, and why they'd be skipped."""
    a, b = _d(start), _d(end)
    existing = list(existing)
    row = {"employee": person["name"], "employee_name": person.get("employee_name"), "days": 0.0, "balance_after": None,
           "problem": None, "planned": None, "segments": []}
    if (person.get("status") or "Active") != "Active":
        row["problem"] = "Not active."
        return row
    joined = _d(person.get("date_of_joining"))
    if joined and joined > b:
        row["problem"] = "Joins after the closure."
        return row
    working = working_dates(a, b, holidays)
    if joined:
        working = [d for d in working if d >= joined]
    if not working:
        row["problem"] = "No working days in the closure."
        return row
    left = [d for d in working if not _covered(d, existing)]
    already = len(working) - len(left)
    if not left:
        row["problem"] = "Already on leave for every closure day."
        return row
    days = float(len(left))
    row["days"] = days
    row["segments"] = [(f.isoformat(), t.isoformat()) for f, t in segments(left, existing)]
    skipped = f" ({_plural(already, 'day')} already on leave)" if already else ""
    if balance is not None:
        row["balance_after"] = balance - days
        row["planned"] = f"{_plural(days, 'day')} off, balance {_fmt(balance)} → {_fmt(balance - days)}{skipped}"
        if balance - days < 0 and not allow_negative:
            row["problem"] = f"Not enough balance ({_fmt(balance)} left)."
    else:
        row["planned"] = f"{_plural(days, 'day')} off{skipped}"
        if not allow_negative:
            row["problem"] = "No leave allocated of this type."
    return row


def closure_preview(people: list[dict[str, Any]], start: Any, end: Any, holidays: dict[str, Iterable[date]],
                    balances: dict[str, float | None], existing_leave: dict[str, list[tuple[Any, Any]]],
                    allow_negative: bool = False) -> list[dict[str, Any]]:
    return [closure_row(p, start, end, holidays.get(p["name"], ()), balances.get(p["name"]), existing_leave.get(p["name"], ()), allow_negative)
            for p in people]


def allocation_row(person: dict[str, Any], p: dict[str, Any], existing: bool, policy: str | None) -> dict[str, Any]:
    """One person's preview for a yearly allocation: what they'll get, or why they'd be skipped."""
    use_policy = truthy(p.get("use_policy"))
    row = {"employee": person["name"], "employee_name": person.get("employee_name"), "days": None, "balance_after": None,
           "problem": None, "planned": None, "policy": policy if use_policy else None}
    if (person.get("status") or "Active") != "Active":
        row["problem"] = "Not active."
    elif existing:
        row["problem"] = "Already has an allocation in this period."
    elif use_policy and not policy:
        row["problem"] = "No leave policy for their grade."
    if use_policy:
        row["planned"] = f"Assign leave policy {policy}" if policy else None
    else:
        row["days"] = float(_num(p.get("days")) or 0)
        row["planned"] = f"Allocate {_plural(row['days'], 'day')} of {p.get('leave_type')}"
    if row["planned"] and truthy(p.get("carry_forward")):
        row["planned"] += ", carrying forward last period's balance"
    return row


def allocation_preview(people: list[dict[str, Any]], p: dict[str, Any], existing: set[str], policies: dict[str, str | None]) -> list[dict[str, Any]]:
    return [allocation_row(x, p, x["name"] in existing, policies.get(x["name"])) for x in people]


def kept_rows(rows: list[dict[str, Any]], exclude: Iterable[str]) -> list[dict[str, Any]]:
    """The preview minus the people HR unticked."""
    out = set(exclude or [])
    return [r for r in rows if r["employee"] not in out]


def decider_error(user: str, roles: Iterable[str], preparer: str | None, status: str | None, subjects: Iterable[str] = ()) -> str | None:
    """Four-eyes: an HR Manager who didn't prepare the action and isn't one of the people it is about."""
    if not set(roles) & set(MANAGER_ROLES):
        return "Only an HR Manager can approve a bulk action."
    if preparer and user == preparer:
        return "You prepared this bulk action, so another HR Manager must approve it."
    if user in set(subjects):
        return "This bulk action includes you, so another HR Manager must approve it."
    if status != WAITING:
        return "This bulk action isn't waiting for a decision."
    return None


def can_edit(status: str | None) -> bool:
    return status in (None, DRAFT, SENT_BACK)


def to_apply(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Rows ``apply_job`` still has to do: never one that already has its document (re-run safety)."""
    return [r for r in rows if not r.get("ref") and r.get("result") != DONE]


def final_status(rows: Iterable[dict[str, Any]]) -> str:
    rows = list(rows)
    return APPLIED if rows and all(r.get("result") == DONE for r in rows) else PARTLY


def summary_text(rows: Iterable[dict[str, Any]]) -> str:
    rows = list(rows)
    n = {k: sum(1 for r in rows if r.get("result") == k) for k in (DONE, SKIPPED, FAILED)}
    return f"{n[DONE]} done, {n[SKIPPED]} skipped, {n[FAILED]} failed"


def reminder_key(kind: str, employee: str, day: date) -> str:
    return f"bulkremind:{kind}:{employee}:{day.isoformat()}"


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _roles() -> set[str]:
    import frappe

    return set(frappe.get_roles())


def _is_hr() -> bool:
    return bool(_roles() & set(HR_ROLES))


def _has(dt: str) -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", dt))


def _require_hr() -> None:
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can run bulk actions.", frappe.PermissionError)


def _str(v: Any) -> Any:
    return str(v) if isinstance(v, date) else v


def _loads(v: Any) -> Any:
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v) if v else {}
    except (TypeError, ValueError):
        return {}


def _people(selection: dict[str, list[str]]) -> list[dict[str, Any]]:
    """Picked people as they are (an inactive one is flagged), else the Active staff in the departments and types."""
    import frappe

    fields = PERSON_FIELDS
    s = selection_clean(selection)
    if s["employees"]:
        rows = frappe.get_all("Employee", filters={"name": ["in", s["employees"]]}, fields=fields, limit=0)
        found = {r["name"] for r in rows}
        missing = [e for e in s["employees"] if e not in found]
        if missing:
            frappe.throw(f"Employee not found: {', '.join(missing)}.", frappe.ValidationError)
        return sorted((dict(r) for r in rows), key=lambda r: s["employees"].index(r["name"]))
    filters: dict[str, Any] = {"status": "Active"}
    if s["departments"]:
        filters["department"] = ["in", s["departments"]]
    if s["employment_types"]:
        filters["employment_type"] = ["in", s["employment_types"]]
    return sorted((dict(r) for r in frappe.get_all("Employee", filters=filters, fields=fields, limit=0)), key=lambda r: r.get("employee_name") or "")


def _leave_type(name: str | None) -> dict[str, Any]:
    import frappe

    lt = frappe.db.get_value("Leave Type", (name or "").strip(), ["name", "allow_negative"], as_dict=True) if name else None
    if not lt:
        frappe.throw("Leave type not found.", frappe.ValidationError)
    return dict(lt)


def _balance(employee: str, leave_type: str, day: date) -> float | None:
    """The Leave Ledger balance on the closure's first day; None when nothing of this type is allocated."""
    import frappe

    if not frappe.db.exists("Leave Allocation", {"employee": employee, "leave_type": leave_type, "docstatus": 1,
                                                 "from_date": ["<=", day.isoformat()], "to_date": [">=", day.isoformat()]}):
        return None
    try:
        from hrms.hr.doctype.leave_application.leave_application import get_leave_balance_on
    except ImportError:
        return None
    return float(get_leave_balance_on(employee, leave_type, day.isoformat()) or 0)


def _existing_leave(employee: str, start: date, end: date) -> list[tuple[Any, Any]]:
    """Open or approved leave that overlaps the closure (any type)."""
    import frappe

    rows = frappe.get_all("Leave Application", filters={"employee": employee, "docstatus": ["<", 2], "status": ["in", ["Open", "Approved"]],
                                                       "from_date": ["<=", end.isoformat()], "to_date": [">=", start.isoformat()]},
                          fields=["from_date", "to_date"], limit=0)
    return [(r["from_date"], r["to_date"]) for r in rows]


def _closure_rows(people: list[dict[str, Any]], p: dict[str, Any]) -> list[dict[str, Any]]:
    from eswasa_hr.workdays import holidays

    lt = _leave_type(p.get("leave_type"))
    a, b = _d(p["from_date"]), _d(p["to_date"])
    hol, bal, ex = {}, {}, {}
    for x in people:
        if (x.get("status") or "Active") != "Active":
            continue
        hol[x["name"]] = holidays(employee=x["name"])
        bal[x["name"]] = _balance(x["name"], lt["name"], a)
        ex[x["name"]] = _existing_leave(x["name"], a, b)
    return closure_preview(people, a, b, hol, bal, ex, bool(lt.get("allow_negative")))


def _policy_of(person: dict[str, Any]) -> str | None:
    import frappe

    if not person.get("grade") or not _has("Employee Grade"):
        return None
    return frappe.db.get_value("Employee Grade", person["grade"], "default_leave_policy") or None


def _has_allocation(employee: str, p: dict[str, Any]) -> bool:
    import frappe

    overlap = {"from_date": ["<=", str(p["to_date"])[:10]], "to_date": [">=", str(p["from_date"])[:10]], "docstatus": 1}
    if truthy(p.get("use_policy")):
        return bool(frappe.db.exists("Leave Policy Assignment", {"employee": employee, "docstatus": 1,
                                                                 "effective_from": ["<=", str(p["to_date"])[:10]],
                                                                 "effective_to": [">=", str(p["from_date"])[:10]]}))
    return bool(frappe.db.exists("Leave Allocation", {"employee": employee, "leave_type": p["leave_type"], **overlap}))


def _allocation_rows(people: list[dict[str, Any]], p: dict[str, Any]) -> list[dict[str, Any]]:
    if not truthy(p.get("use_policy")):
        _leave_type(p.get("leave_type"))
    active = [x for x in people if (x.get("status") or "Active") == "Active"]
    existing = {x["name"] for x in active if _has_allocation(x["name"], p)}
    policies = {x["name"]: _policy_of(x) for x in active} if truthy(p.get("use_policy")) else {}
    return allocation_preview(people, p, existing, policies)


def _clean_parameters(kind: str, parameters: Any) -> dict[str, Any]:
    p = _loads(parameters) if not isinstance(parameters, dict) else dict(parameters)
    keep = ("leave_type", "from_date", "to_date", "reason") if kind == CLOSURE else ("leave_type", "from_date", "to_date", "days", "use_policy", "carry_forward")
    out = {k: p.get(k) for k in keep if p.get(k) not in (None, "")}
    for k in ("from_date", "to_date"):
        if out.get(k):
            out[k] = str(out[k])[:10]
    if kind == ALLOCATION:
        out["use_policy"] = truthy(p.get("use_policy"))
        out["carry_forward"] = truthy(p.get("carry_forward"))
        if out["use_policy"]:
            out.pop("days", None)
        elif out.get("days") is not None:
            out["days"] = _num(out["days"])
    return out


def _rows_for(kind: str, p: dict[str, Any], selection: dict[str, list[str]]) -> list[dict[str, Any]]:
    import frappe

    errs = parameter_errors(kind, p)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    people = _people(selection)
    if not people:
        frappe.throw("Nobody matches this selection.", frappe.ValidationError)
    return _closure_rows(people, p) if kind == CLOSURE else _allocation_rows(people, p)


def _out_row(r: dict[str, Any]) -> dict[str, Any]:
    return {k: _str(r.get(k)) for k in ("employee", "employee_name", "planned", "days", "balance_after", "problem")}


def preview_impl(kind: str, parameters: Any, selection: Any) -> dict[str, Any]:
    """Dry run: the rows the action would apply, with problems flagged. Writes nothing."""
    _require_hr()
    sel = selection_clean(_loads(selection))
    p = _clean_parameters(kind, parameters)
    rows = _rows_for(kind, p, sel)
    return {
        "kind": kind,
        "parameters": p,
        "selection": sel,
        "selection_text": selection_text(sel),
        "rows": [_out_row(r) for r in rows],
        "count": len(rows),
        "problems": sum(1 for r in rows if r.get("problem")),
        "note": CLOSURE_NOTE if kind == CLOSURE else ALLOCATION_NOTE,
    }


def _deciders(preparer: str | None, subjects: Iterable[str] = ()) -> list[str]:
    from eswasa_hr.recruitment import _hr_manager_users

    out = set(subjects)
    return [u for u in _hr_manager_users(exclude=preparer) if u not in out]


def _rows(name: str) -> list[dict[str, Any]]:
    import frappe

    return [dict(r) for r in frappe.get_all(ROW, filters={"parent": name, "parenttype": ACTION}, fields=ROW_FIELDS, order_by="idx asc", limit=0)]


def _subject_users(rows: Iterable[dict[str, Any]]) -> list[str]:
    import frappe

    names = [r["employee"] for r in rows if r.get("employee")]
    if not names:
        return []
    return [u["user_id"] for u in frappe.get_all("Employee", filters={"name": ["in", names]}, fields=["user_id"], limit=0) if u.get("user_id")]


def _action(name: str) -> dict[str, Any]:
    import frappe

    a = frappe.db.get_value(ACTION, name, ACTION_FIELDS, as_dict=True)
    if not a:
        frappe.throw("Bulk action not found.", frappe.DoesNotExistError)
    return dict(a)


def _counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {"people": len(rows), "problems": sum(1 for r in rows if r.get("problem")),
            "done": sum(1 for r in rows if r.get("result") == DONE), "skipped": sum(1 for r in rows if r.get("result") == SKIPPED),
            "failed": sum(1 for r in rows if r.get("result") == FAILED)}


def _summary_row(a: dict[str, Any]) -> dict[str, Any]:
    rows = _rows(a["name"])
    sel = selection_clean(_loads(a.get("selection")))
    return {**{k: _str(a.get(k)) for k in ACTION_FIELDS if k not in ("parameters", "selection")},
            "parameters": _loads(a.get("parameters")), "selection_text": selection_text(sel), **_counts(rows),
            "deciders": _deciders(a.get("prepared_by"), _subject_users(rows)) if a.get("status") == WAITING else []}


def list_impl(status: str | None = None) -> dict[str, Any]:
    import frappe

    _require_hr()
    filters = {"status": status} if status else {}
    rows = [dict(r) for r in frappe.get_all(ACTION, filters=filters, fields=ACTION_FIELDS, order_by="creation desc", limit=0)] if _has(ACTION) else []
    return {"actions": [_summary_row(r) for r in rows], "kinds": list(KINDS), "reminder_kinds": list(REMINDER_KINDS),
            "waiting": sum(1 for r in rows if r.get("status") == WAITING), "approver_note": PROVISIONAL_APPROVER}


def detail_impl(name: str) -> dict[str, Any]:
    import frappe

    _require_hr()
    a = _action(name)
    rows = _rows(name)
    subjects = _subject_users(rows)
    return {
        **_summary_row(a),
        "selection": selection_clean(_loads(a.get("selection"))),
        "rows": [{k: _str(r.get(k)) for k in ROW_FIELDS if k not in ("idx",)} for r in rows],
        "can_edit": can_edit(a.get("status")),
        "can_decide": decider_error(frappe.session.user, _roles(), a.get("prepared_by"), a.get("status"), subjects) is None,
        "note_text": CLOSURE_NOTE if a.get("kind") == CLOSURE else ALLOCATION_NOTE,
        "approver_note": PROVISIONAL_APPROVER,
    }


class _Ref:
    def __init__(self, doctype: str, name: str) -> None:
        self.doctype, self.name = doctype, name


def _route(name: str, title: str, deciders: list[str]) -> None:
    """One "Approve bulk …" ToDo per named decider (not ``lifecycle._route``: the people it is about are left out too)."""
    import frappe
    from frappe.utils import add_days

    from eswasa_hr import settings

    due = add_days(_today(), settings.get("decision_sla_days"))
    for user in deciders:
        if frappe.db.exists("ToDo", {"reference_type": ACTION, "reference_name": name, "allocated_to": user, "status": "Open"}):
            continue
        frappe.get_doc({"doctype": "ToDo", "allocated_to": user, "description": title, "reference_type": ACTION, "reference_name": name,
                        "status": "Open", "priority": "Medium", "assigned_by": frappe.session.user, "date": due}).insert(ignore_permissions=True)


def create_impl(kind: str, parameters: Any, selection: Any, exclude: Any = None, note: str | None = None, submit: Any = False,
                name: str | None = None) -> dict[str, Any]:
    """Save the action as Draft with its rows (the preview re-run here, minus the people HR unticked); optionally submit."""
    import frappe

    _require_hr()
    sel = selection_clean(_loads(selection))
    p = _clean_parameters(kind, parameters)
    rows = kept_rows(_rows_for(kind, p, sel), _loads(exclude) or [])
    if not rows:
        frappe.throw("Everyone is unticked; keep at least one person.", frappe.ValidationError)
    values = {"kind": kind, "parameters": json.dumps(p, sort_keys=True), "selection": json.dumps(sel, sort_keys=True),
              "prepared_by": frappe.session.user, "note": (note or "").strip() or None, "summary": None}
    if name:
        cur = _action(name)
        if not can_edit(cur.get("status")):
            frappe.throw("Only a draft or sent-back bulk action can change.", frappe.ValidationError)
        frappe.db.set_value(ACTION, name, values)
        frappe.db.delete(ROW, {"parent": name, "parenttype": ACTION})
    else:
        d = frappe.get_doc({"doctype": ACTION, "status": DRAFT, **values})
        d.insert(ignore_permissions=True)
        name = d.name
    for i, r in enumerate(rows, start=1):
        frappe.get_doc({"doctype": ROW, "parent": name, "parenttype": ACTION, "parentfield": "rows", "idx": i,
                        **{k: r.get(k) for k in ("employee", "employee_name", "planned", "days", "balance_after", "problem")}}).insert(ignore_permissions=True)
    if truthy(submit):
        return submit_impl(name)
    return detail_impl(name)


def submit_impl(name: str) -> dict[str, Any]:
    import frappe

    _require_hr()
    a = _action(name)
    if not can_edit(a.get("status")):
        frappe.throw("This bulk action has already been sent.", frappe.ValidationError)
    rows = _rows(name)
    deciders = _deciders(frappe.session.user, _subject_users(rows))
    if not deciders:
        frappe.throw("There's no other HR Manager to approve this. Ask an HR Manager who isn't included to send it.", frappe.ValidationError)
    frappe.db.set_value(ACTION, name, {"status": WAITING, "prepared_by": frappe.session.user})
    _route(name, approve_title(a["kind"], len(rows)), deciders)
    return detail_impl(name)


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler: approve (apply in the background), send back, or not approved (both with a note)."""
    import frappe

    from eswasa_hr.lifecycle import _close

    a = _action(name)
    err = decider_error(frappe.session.user, _roles(), a.get("prepared_by"), a.get("status"), _subject_users(_rows(name)))
    if err:
        frappe.throw(err, frappe.ValidationError if "isn't waiting" in err else frappe.PermissionError)
    key = (action or "").strip().lower()
    note = (comment or "").strip()
    values: dict[str, Any] = {"decided_on": _today().isoformat()}
    if key == "approve":
        values.update(status=APPLYING, approved_by=frappe.session.user)
    elif key in ("return", "send back", "sent back"):
        if not note:
            frappe.throw("Say what to change, so the preparer can correct it.", frappe.ValidationError)
        values.update(status=SENT_BACK, summary=f"Sent back: {note}")
    elif key in ("reject", "not approved"):
        if not note:
            frappe.throw("Say why it isn't approved.", frappe.ValidationError)
        values.update(status=NOT_APPROVED, summary=f"Not approved: {note}")
    else:
        frappe.throw("Approve, send back or don't approve.", frappe.ValidationError)
    frappe.db.set_value(ACTION, name, values)
    _close(ACTION, name)
    if values["status"] == APPLYING:
        _enqueue(name)
    else:
        _tell_preparer(a, values["status"], note)
    return {"ok": True, "doctype": ACTION, "name": name, "action": action, "workflow_action": None, "status": values["status"],
            "message": f"{ACTION}: {values['status']}"}


def _enqueue(name: str) -> None:
    import frappe

    frappe.enqueue("eswasa_hr.bulk_actions.apply_job", queue="long", timeout=3600, enqueue_after_commit=True, name=name)


def _tell_preparer(a: dict[str, Any], status: str, note: str | None = None) -> int:
    from eswasa_hr import notify

    if not a.get("prepared_by"):
        return 0
    return notify.queue(f"bulk:{a['name']}:{status}", [a["prepared_by"]], "bulk_action_done",
                        {"kind": a["kind"], "status": status, "summary": note or a.get("summary") or ""})


def _apply_closure(name: str, a: dict[str, Any], p: dict[str, Any], person: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """(ref, problem, error) for one person; re-checked now, since balances and leave may have changed."""
    import frappe

    r = _closure_rows([person], p)[0]
    if r.get("problem"):
        return None, r["problem"], None
    refs = []
    for f, t in r["segments"]:
        doc = frappe.get_doc({"doctype": "Leave Application", "employee": person["name"], "leave_type": p["leave_type"], "from_date": f,
                              "to_date": t, "status": "Approved", "leave_approver": a.get("approved_by"), "company": person.get("company"),
                              "description": closure_description(name, p["from_date"], p["to_date"], p.get("reason"))})
        doc.insert(ignore_permissions=True)
        doc.submit()
        refs.append(doc.name)
    return ", ".join(refs), None, None


def _multi_assign():
    """HRMS's bulk policy assignment, when the installed version has it (checked at run time; see log A6)."""
    try:
        from hrms.hr.doctype.leave_policy_assignment import leave_policy_assignment as lpa
    except ImportError:
        return None
    return getattr(lpa, "create_assignment_for_multiple_employees", None)


def _apply_allocation(name: str, a: dict[str, Any], p: dict[str, Any], person: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    import frappe

    r = _allocation_rows([person], p)[0]
    if r.get("problem"):
        return None, r["problem"], None
    if truthy(p.get("use_policy")):
        data = {"leave_policy": r["policy"], "assignment_based_on": None, "effective_from": p["from_date"], "effective_to": p["to_date"],
                "carry_forward": 1 if truthy(p.get("carry_forward")) else 0}
        bulk = _multi_assign()
        if bulk:
            bulk([person["name"]], data)
        else:
            doc = frappe.get_doc({"doctype": "Leave Policy Assignment", "employee": person["name"], **data})
            doc.insert(ignore_permissions=True)
            doc.submit()
        ref = frappe.db.get_value("Leave Policy Assignment", {"employee": person["name"], "leave_policy": r["policy"],
                                                              "effective_from": p["from_date"], "docstatus": 1}, "name")
        if not ref:
            return None, None, "HRMS didn't assign the policy."
        return ref, None, None
    doc = frappe.get_doc({"doctype": "Leave Allocation", "employee": person["name"], "leave_type": p["leave_type"], "from_date": p["from_date"],
                          "to_date": p["to_date"], "new_leaves_allocated": p["days"], "carry_forward": 1 if truthy(p.get("carry_forward")) else 0,
                          "description": allocation_description(name)})
    doc.insert(ignore_permissions=True)
    doc.submit()
    return doc.name, None, None


def _savepoint(name: str) -> None:
    import frappe

    sp = getattr(frappe.db, "savepoint", None)
    if sp:
        sp(name)


def _rollback(name: str) -> None:
    import frappe

    rb = getattr(frappe.db, "rollback", None)
    if rb:
        rb(save_point=name)


def apply_job(name: str) -> dict[str, Any]:
    """Background (``long`` queue): apply each row still to do, record its result, then the action's final status."""
    import frappe

    a = _action(name)
    if a.get("status") not in (APPLYING, PARTLY):
        return {"name": name, "status": a.get("status"), "skipped": True}
    p = _loads(a.get("parameters"))
    rows = _rows(name)
    todo = to_apply(rows)
    people = {x["name"]: dict(x) for x in frappe.get_all("Employee", filters={"name": ["in", [r["employee"] for r in todo]]}, fields=PERSON_FIELDS,
                                                         limit=0)} if todo else {}
    apply = _apply_closure if a["kind"] == CLOSURE else _apply_allocation
    for r in todo:
        result: dict[str, Any] = {"error": None}
        if r.get("employee") not in people:
            result.update(result=SKIPPED, problem="Employee not found.")
        else:
            sp = f"bulk_{r['name']}".replace("-", "_")
            _savepoint(sp)
            try:
                ref, problem, error = apply(name, a, p, people[r["employee"]])
            except Exception as e:  # one person's failure never stops the rest
                _rollback(sp)
                ref, problem, error = None, None, str(e) or e.__class__.__name__
            if ref:
                result.update(result=DONE, ref=ref, problem=None)
            elif problem:
                result.update(result=SKIPPED, problem=problem)
            else:
                result.update(result=FAILED, error=error)
        frappe.db.set_value(ROW, r["name"], result)
        r.update(result)
    status = final_status(rows)
    summary = summary_text(rows)
    frappe.db.set_value(ACTION, name, {"status": status, "summary": summary})
    _tell_preparer({**a, "summary": summary}, status)
    return {"name": name, "status": status, "summary": summary}


def retry_impl(name: str) -> dict[str, Any]:
    """HR re-runs the rows that failed (or a run that never finished); rows already done are never repeated."""
    import frappe

    _require_hr()
    a = _action(name)
    if a.get("status") not in (APPLYING, PARTLY):
        frappe.throw("Only an approved action that didn't fully apply can be retried.", frappe.ValidationError)
    for r in _rows(name):
        if r.get("result") == FAILED:
            frappe.db.set_value(ROW, r["name"], {"result": None, "error": None})
    frappe.db.set_value(ACTION, name, {"status": APPLYING})
    _enqueue(name)
    return detail_impl(name)


# ---- reminders


def _user(employee: dict[str, Any]) -> str | None:
    return employee.get("user_id") or None


def _owes_documents(person: dict[str, Any], day: date) -> list[str]:
    from eswasa_hr import documents

    return documents.missing(documents.required_for(person.get("employment_type")), documents._rows(person["name"]), day)


def _unacknowledged(person: dict[str, Any]) -> list[dict[str, Any]]:
    import frappe

    if not _has("HR Issued Item"):
        return []
    return frappe.get_all("HR Issued Item", filters={"employee": person["name"], "status": "Issued"}, fields=["name", "item_type", "tag"], limit=0)


def _remind_one(kind: str, person: dict[str, Any], day: date) -> str:
    """'sent', 'skipped' (no login or already reminded today) or 'none' (owes nothing)."""
    from eswasa_hr import notify

    if kind == REMIND_DOCUMENTS:
        owed = _owes_documents(person, day)
        context = {"what": "required documents", "detail": ", ".join(owed), "where": "My documents"}
    else:
        owed = _unacknowledged(person)
        context = {"what": "items to acknowledge", "detail": ", ".join(f"{i['item_type']} {i.get('tag') or ''}".strip() for i in owed), "where": "My items"}
    if not owed:
        return "none"
    user = _user(person)
    if not user:
        return "skipped"
    added = notify.queue(reminder_key(kind, person["name"], day), [user], "bulk_reminder", context)
    return "sent" if added else "skipped"


def remind_impl(kind: str, selection: Any = None, dry_run: bool = False) -> dict[str, Any]:
    """Bulk reminders, at most once a day per kind and person. Declarations and appraisals reuse their own reminders."""
    import frappe

    _require_hr()
    if kind not in REMINDER_KINDS:
        frappe.throw("Choose what to remind people about.", frappe.ValidationError)
    sel = selection_clean(_loads(selection))
    if kind == REMIND_DECLARATION:
        if dry_run:
            from eswasa_hr import declarations

            n = len(declarations.register_impl()["outstanding"])
            return {"kind": kind, "count": n, "sent": 0, "skipped": 0, "note": "Goes to everyone with an unsigned declaration."}
        from eswasa_hr import declarations

        out = declarations.remind_impl()
        return {"kind": kind, "count": out["outstanding"], "sent": out["created"], "skipped": out["outstanding"] - out["created"],
                "note": "Goes to everyone with an unsigned declaration."}
    if kind == REMIND_APPRAISAL:
        from eswasa_hr import performance

        cycles = [c["name"] for c in frappe.get_all("Appraisal Cycle", filters={"status": "In Progress"}, fields=["name"], limit=0)] if _has("Appraisal Cycle") else []
        depts = sel["departments"] or [None]
        if dry_run:
            return {"kind": kind, "count": len(cycles), "sent": 0, "skipped": 0, "note": f"Goes to everyone with an open step in {_plural(len(cycles), 'cycle')} in progress."}
        sent = sum(performance.remind_impl(c, d)["sent"] for c in cycles for d in depts)
        return {"kind": kind, "count": sent, "sent": sent, "skipped": 0, "note": "Open self-assessments and manager reviews."}
    day = _today()
    people = _people(sel)
    if dry_run:
        n = sum(1 for x in people if (_owes_documents(x, day) if kind == REMIND_DOCUMENTS else _unacknowledged(x)))
        return {"kind": kind, "count": n, "sent": 0, "skipped": 0, "note": None}
    tally = {"sent": 0, "skipped": 0, "none": 0}
    for x in people:
        tally[_remind_one(kind, x, day)] += 1
    return {"kind": kind, "count": tally["sent"] + tally["skipped"], "sent": tally["sent"], "skipped": tally["skipped"], "note": None}


def waiting_count() -> int:
    import frappe

    return frappe.db.count(ACTION, {"status": WAITING}) if _has(ACTION) else 0


def options_impl() -> dict[str, Any]:
    """What the New bulk action stepper needs: leave types, departments, employment types."""
    import frappe

    _require_hr()
    return {
        "kinds": list(KINDS),
        "reminder_kinds": list(REMINDER_KINDS),
        "leave_types": [r["name"] for r in frappe.get_all("Leave Type", fields=["name"], order_by="name asc", limit=0)],
        "departments": [r["name"] for r in frappe.get_all("Department", filters={"is_group": 0, "disabled": 0}, fields=["name"], order_by="name asc", limit=0)],
        "employment_types": [r["name"] for r in frappe.get_all("Employment Type", fields=["name"], order_by="name asc", limit=0)],
        "closure_note": CLOSURE_NOTE,
        "allocation_note": ALLOCATION_NOTE,
    }


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
def preview(kind: str = "", parameters: Any = None, selection: Any = None) -> dict[str, Any]:
    return preview_impl(kind, parameters, selection)


@_whitelist
def actions(status: str | None = None) -> dict[str, Any]:
    return list_impl(status)


@_whitelist
def options() -> dict[str, Any]:
    return options_impl()


@_whitelist
def detail(name: str) -> dict[str, Any]:
    return detail_impl(name)


@_whitelist
def create(kind: str = "", parameters: Any = None, selection: Any = None, exclude: Any = None, note: str | None = None, submit: Any = False,
           name: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return create_impl(kind, parameters, selection, exclude, note, submit, name)


@_whitelist
def submit(name: str, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return submit_impl(name)


@_whitelist
def retry(name: str, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return retry_impl(name)


@_whitelist
def remind(kind: str = "", selection: Any = None, dry_run: Any = False, confirm: Any = False) -> dict[str, Any]:
    if not truthy(dry_run):
        _confirm(confirm)
    return remind_impl(kind, selection, truthy(dry_run))
