"""
Training plan, needs, nominations, attendance and cost (additions plan 05; screens H17, T8, E13).

Needs come from the manager review (T5 ``training_needs``), from expiring authorisations (the daily step after
R-H3, once per authorisation), and from HR or a line manager directly. Each department prepares one yearly
``Training Plan``: HR or the head of department. It goes to the named HR Managers other than the preparer as an
"Approve training plan …" card (PROVISIONAL, A6: who approves a department plan is ESWASA's to confirm).

An approved line is scheduled as an HRMS ``Training Event`` (custom fields ``custom_plan_line``, ``custom_skill``,
``custom_direct_cost``, ``custom_indirect_cost``); its needs move to Planned. Line managers nominate their
reports, HR anyone. HR records attendance (needs of people present become Met) and the actual cost. HR then
records a Training Result in Desk; ``training.hrms_items`` already offers it as authorisation evidence.

Cost is recorded only: direct and indirect (A6). The training budget is Finance's; nothing posts to accounts.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable

NEED = "Training Need"
PLAN = "Training Plan"
LINE = "Training Plan Line"
EVENT = "Training Event"
EVENT_ROW = "Training Event Employee"
HR_ROLES = ("HR Manager", "HR User", "System Manager")
MANAGER_ROLES = ("HR Manager", "System Manager")

DRAFT, WAITING, APPROVED, SENT_BACK = "Draft", "Waiting", "Approved", "Sent back"
OPEN, PLANNED, MET, DROPPED = "Open", "Planned", "Met", "Dropped"
SOURCES = ("Appraisal", "Authorisation expiry", "Manager", "Self")
REASONS = ("Need", "Compliance", "Accreditation", "Development")
QUARTERS = ("Q1", "Q2", "Q3", "Q4")
PRIORITIES = ("Low", "Medium", "High")
# HRMS Training Event "type" options; the first is HRMS's own default.
EVENT_TYPES = ("Seminar", "Theory", "Workshop", "Conference", "Exam", "Internet", "Self-Study")
ALERT_RULE = "Training plan"
PROVISIONAL_APPROVER = "Approver provisional (ESWASA A6): a named HR Manager other than the preparer."

NEED_FIELDS = ["name", "employee", "employee_name", "department", "topic", "skill", "source", "source_name", "raised_by", "priority",
               "status", "plan", "plan_line", "event", "note", "creation"]
PLAN_FIELDS = ["name", "department", "year", "status", "prepared_by", "approved_by", "decided_on", "note", "decision_note", "modified"]
LINE_FIELDS = ["name", "idx", "topic", "skill", "reason", "quarter", "people", "provider", "needs", "estimated_direct", "estimated_indirect", "event"]
EVENT_FIELDS = ["name", "event_name", "event_status", "start_time", "end_time", "location", "trainer_name", "docstatus",
                "custom_plan_line", "custom_skill", "custom_direct_cost", "custom_indirect_cost"]


# ---------------------------------------------------------------- pure rules


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return -1.0  # not a number: reported as an error by the callers that check costs


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def split_names(raw: Any) -> list[str]:
    """``needs`` on a line: one Training Need per line (commas tolerated), blanks and repeats dropped."""
    if isinstance(raw, (list, tuple)):
        parts = [str(x) for x in raw]
    else:
        parts = str(raw or "").replace(",", "\n").splitlines()
    out: list[str] = []
    for p in parts:
        p = p.strip()
        if p and p not in out:
            out.append(p)
    return out


def plan_errors(lines: list[dict[str, Any]]) -> list[str]:
    """Every line has a topic and a quarter; people and costs are not negative."""
    if not lines:
        return ["Add at least one line to the plan."]
    errs: list[str] = []
    for i, ln in enumerate(lines, start=1):
        if not str(ln.get("topic") or "").strip():
            errs.append(f"Line {i}: say what the training is.")
        if ln.get("quarter") not in QUARTERS:
            errs.append(f"Line {i}: choose the quarter.")
        if ln.get("reason") and ln.get("reason") not in REASONS:
            errs.append(f"Line {i}: choose need, compliance, accreditation or development.")
        if _num(ln.get("people")) < 0:
            errs.append(f"Line {i}: the number of people can't be negative.")
        if _num(ln.get("estimated_direct")) < 0 or _num(ln.get("estimated_indirect")) < 0:
            errs.append(f"Line {i}: costs can't be negative.")
    return errs


def plan_totals(lines: Iterable[dict[str, Any]], events: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    """Estimated cost from the lines; actual cost from the scheduled events (``events`` by name)."""
    events = events or {}
    lines = list(lines)
    direct = sum(max(_num(ln.get("estimated_direct")), 0) for ln in lines)
    indirect = sum(max(_num(ln.get("estimated_indirect")), 0) for ln in lines)
    scheduled = [events[ln["event"]] for ln in lines if ln.get("event") and ln["event"] in events]
    a_direct = sum(max(_num(e.get("custom_direct_cost")), 0) for e in scheduled)
    a_indirect = sum(max(_num(e.get("custom_indirect_cost")), 0) for e in scheduled)
    return {
        "lines": len(lines),
        "people": int(sum(max(_num(ln.get("people")), 0) for ln in lines)),
        "scheduled": sum(1 for ln in lines if ln.get("event")),
        "estimated_direct": direct,
        "estimated_indirect": indirect,
        "estimated": direct + indirect,
        "actual_direct": a_direct,
        "actual_indirect": a_indirect,
        "actual": a_direct + a_indirect,
    }


def decider_error(user: str, roles: Iterable[str], preparer: str | None, status: str | None) -> str | None:
    """Four-eyes: an HR Manager who didn't prepare the plan, while it is waiting."""
    if not set(roles) & set(MANAGER_ROLES):
        return "Only an HR Manager can approve a training plan."
    if preparer and user == preparer:
        return "You prepared this plan, so another HR Manager must approve it."
    if status != WAITING:
        return "This plan isn't waiting for a decision."
    return None


def can_edit(status: str | None) -> bool:
    return status in (None, DRAFT, SENT_BACK)


def schedule_error(plan_status: str | None, line_event: str | None) -> str | None:
    if plan_status != APPROVED:
        return "Only a line of an approved plan can be scheduled."
    if line_event:
        return "This line is already scheduled."
    return None


def need_errors(topic: Any, source: str | None, priority: str | None = None) -> list[str]:
    errs = []
    if not str(topic or "").strip():
        errs.append("Say what training is needed.")
    if source not in SOURCES:
        errs.append("Unknown source for the need.")
    if priority and priority not in PRIORITIES:
        errs.append("Choose low, medium or high priority.")
    return errs


def need_key(authorisation: str) -> str:
    """Needs from expiring authorisations are raised once per authorisation."""
    return f"need:auth:{authorisation}"


def nominate_errors(employees: list[str], allowed: list[str] | None) -> list[str]:
    """``allowed`` None means anyone (HR); otherwise only the people listed (a line manager's reports)."""
    if not employees:
        return ["Choose who to nominate."]
    if allowed is None:
        return []
    outside = [e for e in employees if e not in allowed]
    return [f"You can only nominate people in your team ({', '.join(outside)} isn't)."] if outside else []


def cost_errors(direct: Any, indirect: Any) -> list[str]:
    return ["Costs can't be negative."] if _num(direct) < 0 or _num(indirect) < 0 else []


def present_of(rows: Iterable[dict[str, Any]]) -> set[str]:
    return {str(r.get("employee")) for r in rows if r.get("present") in (True, 1, "1", "true", "Present")}


def needs_met(needs: Iterable[dict[str, Any]], present: set[str]) -> list[str]:
    """Open or Planned needs of people marked present become Met."""
    return [n["name"] for n in needs if n.get("employee") in present and n.get("status") in (OPEN, PLANNED)]


def plan_title(department: str, year: str) -> str:
    return f"Approve training plan {department} {year}"


def setup_state(departments: list[str], approved: list[str]) -> str:
    if not departments:
        return "todo"
    have = set(approved) & set(departments)
    return "done" if len(have) == len(departments) else "partial" if have else "todo"


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _roles() -> set[str]:
    import frappe

    return set(frappe.get_roles())


def _is_hr() -> bool:
    return bool(_roles() & set(HR_ROLES))


def _viewer():
    from eswasa_hr.scope import viewer_for

    return viewer_for()


def _has(dt: str) -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", dt))


def _require_hr() -> None:
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can do this.", frappe.PermissionError)


def _str(v: Any) -> Any:
    return str(v) if isinstance(v, date) else v


def _row(r: dict[str, Any], fields: list[str]) -> dict[str, Any]:
    return {k: _str(r.get(k)) for k in fields}


def _needs(filters: dict[str, Any]) -> list[dict[str, Any]]:
    import frappe

    if not _has(NEED):
        return []
    return [_row(r, NEED_FIELDS) for r in frappe.get_all(NEED, filters=filters, fields=NEED_FIELDS, order_by="creation desc", limit=0)]


def _lines(plan: str) -> list[dict[str, Any]]:
    import frappe

    rows = frappe.get_all(LINE, filters={"parent": plan, "parenttype": PLAN}, fields=LINE_FIELDS, order_by="idx asc", limit=0)
    return [dict(r) for r in rows]


def _event_fields() -> list[str]:
    import frappe

    meta = frappe.get_meta(EVENT)
    return [f for f in EVENT_FIELDS if not f.startswith("custom_") or meta.has_field(f)]


def _events(names: Iterable[str]) -> dict[str, dict[str, Any]]:
    import frappe

    names = [n for n in names if n]
    if not names or not _has(EVENT):
        return {}
    return {e["name"]: dict(e) for e in frappe.get_all(EVENT, filters={"name": ["in", names]}, fields=_event_fields(), limit=0)}


def _employee(employee: str) -> dict[str, Any]:
    import frappe

    e = frappe.db.get_value("Employee", employee, ["name", "employee_name", "status", "department", "user_id", "reports_to"], as_dict=True)
    if not e:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    return dict(e)


def _can_see_employee(employee: str) -> bool:
    if _is_hr():
        return True
    return employee in _viewer().people


def _can_prepare(department: str) -> bool:
    return _is_hr() or department in _viewer().headed


def _require_prepare(department: str) -> None:
    import frappe

    if not _can_prepare(department):
        frappe.throw("Only HR or the head of the department can prepare its training plan.", frappe.PermissionError)


def _require_see_plan(department: str) -> None:
    import frappe

    if not _can_prepare(department):
        frappe.throw("You can't see this department's training plan.", frappe.PermissionError)


# ---- needs


def needs_impl(department: str | None = None, status: str | None = None, source: str | None = None, employee: str | None = None) -> dict[str, Any]:
    """HR sees every need; a line manager their team's; a head their department's; everyone their own."""
    import frappe

    filters: dict[str, Any] = {}
    if department:
        filters["department"] = department
    if status:
        filters["status"] = status
    if source:
        filters["source"] = source
    if employee:
        filters["employee"] = employee
    rows = _needs(filters)
    if not _is_hr():
        v = _viewer()
        rows = [r for r in rows if r["employee"] in v.people or r.get("department") in v.headed]
    departments = [d["name"] for d in frappe.get_all("Department", filters={"is_group": 0, "disabled": 0}, fields=["name"], limit=0)] if _is_hr() else _viewer().headed
    return {"needs": rows, "open": sum(1 for r in rows if r["status"] == OPEN), "sources": list(SOURCES), "departments": departments}


def _insert_need(e: dict[str, Any], topic: str, skill: str | None, source: str, source_name: str | None, priority: str | None,
                 note: str | None = None, key: str | None = None, raised_by: str | None = None) -> str:
    import frappe

    d = frappe.get_doc(
        {
            "doctype": NEED,
            "employee": e["name"],
            "employee_name": e.get("employee_name"),
            "department": e.get("department"),
            "topic": topic.strip(),
            "skill": skill or None,
            "source": source,
            "source_name": source_name,
            "key": key,
            "raised_by": raised_by or frappe.session.user,
            "priority": priority or "Medium",
            "status": OPEN,
            "note": (note or "").strip() or None,
        }
    )
    d.insert(ignore_permissions=True)
    return d.name


def raise_need_impl(employee: str, topic: str, skill: str | None = None, priority: str | None = None, note: str | None = None) -> dict[str, Any]:
    """HR raises a need for anyone, a line manager for their reports, a person for themselves (source Self)."""
    import frappe

    e = _employee(employee)
    v = None if _is_hr() else _viewer()
    if v is not None and employee not in v.people:
        frappe.throw("You can raise a training need for yourself or your team only.", frappe.PermissionError)
    source = "Self" if v is not None and employee == v.employee else "Manager"
    errs = need_errors(topic, source, priority)
    if skill and not frappe.db.exists("Skill", skill):
        errs.append("That competence isn't in the catalogue.")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    _insert_need(e, topic, skill, source, None, priority, note)
    return needs_impl(employee=employee)


def needs_from_review(employee: str, needs: list[dict[str, Any]] | None, appraisal: str) -> int:
    """T5: the manager review adds needs (source Appraisal). Called after the review is submitted."""
    import frappe

    if not needs or not _has(NEED):
        return 0
    e = _employee(employee)
    n = 0
    for item in needs:
        topic = str((item or {}).get("topic") or "").strip()
        if not topic:
            continue
        skill = (item or {}).get("skill") or None
        if skill and not frappe.db.exists("Skill", skill):
            skill = None
        _insert_need(e, topic, skill, "Appraisal", appraisal, (item or {}).get("priority"))
        n += 1
    return n


def review_need_errors(needs: list[dict[str, Any]] | None) -> list[str]:
    """Checked before the review is saved, so a bad need doesn't leave a half-done review."""
    errs = []
    for i, item in enumerate(needs or [], start=1):
        if not str((item or {}).get("topic") or "").strip():
            errs.append(f"Training need {i}: say what training is needed.")
    return errs


def training_needs() -> int:
    """Daily, after R-H3: one need per employee authorisation that is Expiring, once (key ``need:auth:<name>``)."""
    import frappe

    if not (_has(NEED) and _has("Staff Authorisation")):
        return 0
    n = 0
    for a in frappe.get_all("Staff Authorisation", filters={"docstatus": 1, "status": "Expiring"},
                            fields=["name", "employee", "skill", "valid_to"], limit=0):
        if not a.get("employee") or frappe.db.exists(NEED, {"key": need_key(a["name"])}):
            continue  # external people have no training plan here
        e = frappe.db.get_value("Employee", a["employee"], ["name", "employee_name", "department", "status"], as_dict=True)
        if not e or e.get("status") != "Active":
            continue
        topic = f"Renew {a['skill']}" + (f" (expires {_str(a.get('valid_to'))})" if a.get("valid_to") else "")
        _insert_need(dict(e), topic, a.get("skill"), "Authorisation expiry", a["name"], "High", key=need_key(a["name"]), raised_by="Administrator")
        n += 1
    return n


# ---- plans


def _plan_summary(p: dict[str, Any]) -> dict[str, Any]:
    lines = _lines(p["name"])
    return {**_row(p, PLAN_FIELDS), "totals": plan_totals(lines, _events(ln.get("event") for ln in lines))}


def plans_impl(year: str | None = None, department: str | None = None) -> dict[str, Any]:
    """H17 list: HR sees every department; a head sees their own."""
    import frappe

    filters: dict[str, Any] = {}
    if year:
        filters["year"] = year
    if department:
        filters["department"] = department
    rows = [dict(r) for r in frappe.get_all(PLAN, filters=filters, fields=PLAN_FIELDS, order_by="year desc, department asc", limit=0)] if _has(PLAN) else []
    if not _is_hr():
        headed = _viewer().headed
        rows = [r for r in rows if r.get("department") in headed]
    plans = [_plan_summary(r) for r in rows]
    years = [y["name"] for y in frappe.get_all("Fiscal Year", fields=["name"], order_by="year_start_date desc", limit=0)] if _has("Fiscal Year") else []
    departments = [d["name"] for d in frappe.get_all("Department", filters={"is_group": 0, "disabled": 0}, fields=["name"], limit=0)] if _is_hr() else _viewer().headed
    return {
        "plans": plans,
        "years": years,
        "departments": departments,
        "can_prepare": _is_hr() or bool(departments),
        "waiting": sum(1 for p in plans if p["status"] == WAITING),
        "approver_note": PROVISIONAL_APPROVER,
    }


def _deciders(preparer: str | None) -> list[str]:
    from eswasa_hr.recruitment import _hr_manager_users

    return _hr_manager_users(exclude=preparer)


def plan_impl(name: str) -> dict[str, Any]:
    import frappe

    p = frappe.db.get_value(PLAN, name, PLAN_FIELDS, as_dict=True)
    if not p:
        frappe.throw("Training plan not found.", frappe.DoesNotExistError)
    p = dict(p)
    _require_see_plan(p["department"])
    lines = _lines(name)
    events = _events(ln.get("event") for ln in lines)
    need_names = sorted({n for ln in lines for n in split_names(ln.get("needs"))})
    needs = {r["name"]: r for r in _needs({"name": ["in", need_names]})} if need_names else {}
    user = frappe.session.user
    out_lines = []
    for ln in lines:
        ev = events.get(ln.get("event") or "")
        out_lines.append(
            {
                **{k: _str(ln.get(k)) for k in LINE_FIELDS},
                "needs": [needs[n] for n in split_names(ln.get("needs")) if n in needs],
                "event_status": ev.get("event_status") if ev else None,
                "start_time": _str(ev.get("start_time")) if ev else None,
                "can_schedule": _is_hr() and schedule_error(p["status"], ln.get("event")) is None,
            }
        )
    return {
        **_row(p, PLAN_FIELDS),
        "lines": out_lines,
        "totals": plan_totals(lines, events),
        "deciders": _deciders(p.get("prepared_by")) if p["status"] == WAITING else [],
        "can_edit": can_edit(p["status"]) and _can_prepare(p["department"]),
        "can_decide": decider_error(user, _roles(), p.get("prepared_by"), p["status"]) is None,
        "approver_note": PROVISIONAL_APPROVER,
    }


def _clean_line(ln: dict[str, Any]) -> dict[str, Any]:
    return {
        "topic": str(ln.get("topic") or "").strip(),
        "skill": ln.get("skill") or None,
        "reason": ln.get("reason") or "Need",
        "quarter": ln.get("quarter"),
        "people": int(_num(ln.get("people"))) if ln.get("people") not in (None, "") else None,
        "provider": (str(ln.get("provider") or "").strip()) or None,
        "needs": "\n".join(split_names(ln.get("needs"))) or None,
        "estimated_direct": _num(ln.get("estimated_direct")),
        "estimated_indirect": _num(ln.get("estimated_indirect")),
    }


def _write_lines(plan: str, lines: list[dict[str, Any]]) -> None:
    import frappe

    frappe.db.delete(LINE, {"parent": plan, "parenttype": PLAN})
    for i, ln in enumerate(lines, start=1):
        frappe.get_doc({"doctype": LINE, "parent": plan, "parenttype": PLAN, "parentfield": "lines", "idx": i, **ln}).insert(ignore_permissions=True)


def _link_needs(plan: str, department: str) -> None:
    """Needs picked on a line point at the plan and line; needs dropped from the plan are let go again."""
    import frappe

    picked: dict[str, str] = {}
    for ln in _lines(plan):
        for n in split_names(ln.get("needs")):
            picked[n] = ln["name"]
    for r in _needs({"plan": plan}):
        if r["name"] not in picked and r["status"] == OPEN:
            frappe.db.set_value(NEED, r["name"], {"plan": None, "plan_line": None})
    for n, line in picked.items():
        frappe.db.set_value(NEED, n, {"plan": plan, "plan_line": line})


def _need_pick_errors(lines: list[dict[str, Any]], department: str) -> list[str]:
    names = sorted({n for ln in lines for n in split_names(ln.get("needs"))})
    if not names:
        return []
    found = {r["name"]: r for r in _needs({"name": ["in", names]})}
    errs = []
    for n in names:
        r = found.get(n)
        if not r:
            errs.append(f"Training need {n} doesn't exist.")
        elif r.get("department") != department:
            errs.append(f"Training need {n} is for another department.")
        elif r.get("status") not in (OPEN, PLANNED):
            errs.append(f"Training need {n} is already {r['status'].lower()}.")
    return errs


def save_plan_impl(department: str, year: str, lines: list[dict[str, Any]], note: str | None = None, submit: Any = False, name: str | None = None) -> dict[str, Any]:
    """Create or update a department's plan (Draft or Sent back), and optionally send it for approval."""
    import frappe

    from eswasa_hr.lifecycle import _route

    _require_prepare(department)
    if not frappe.db.exists("Department", department):
        frappe.throw("Department not found.", frappe.ValidationError)
    if not frappe.db.exists("Fiscal Year", year):
        frappe.throw("Choose a year from the fiscal years.", frappe.ValidationError)
    clean = [_clean_line(ln or {}) for ln in lines or []]
    errs = plan_errors(clean) + _need_pick_errors(clean, department)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    other = frappe.db.get_value(PLAN, {"department": department, "year": year}, "name")
    if name:
        cur = frappe.db.get_value(PLAN, name, ["name", "status", "department", "year"], as_dict=True)
        if not cur:
            frappe.throw("Training plan not found.", frappe.DoesNotExistError)
        if not can_edit(cur["status"]):
            frappe.throw("Only a draft or sent-back plan can change.", frappe.ValidationError)
        if other and other != name:
            frappe.throw(f"{department} already has a training plan for {year}.", frappe.ValidationError)
        frappe.db.set_value(PLAN, name, {"department": department, "year": year, "note": (note or "").strip() or None, "prepared_by": frappe.session.user})
    else:
        if other:
            frappe.throw(f"{department} already has a training plan for {year}.", frappe.ValidationError)
        d = frappe.get_doc({"doctype": PLAN, "department": department, "year": year, "status": DRAFT, "prepared_by": frappe.session.user,
                            "note": (note or "").strip() or None})
        d.insert(ignore_permissions=True)
        name = d.name
    _write_lines(name, clean)
    _link_needs(name, department)
    if str(submit).lower() in ("1", "true", "yes"):
        if not _deciders(frappe.session.user):
            frappe.throw("There's no other HR Manager to approve this plan. Ask an HR Manager to send it.", frappe.ValidationError)
        frappe.db.set_value(PLAN, name, {"status": WAITING, "decision_note": None})
        from frappe.utils import add_days

        from eswasa_hr import settings

        _route(_Ref(PLAN, name), plan_title(department, year), add_days(_today(), settings.get("decision_sla_days")))
    return plan_impl(name)


class _Ref:
    def __init__(self, doctype: str, name: str) -> None:
        self.doctype, self.name = doctype, name


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler: a named HR Manager other than the preparer approves or sends back (with a note)."""
    import frappe

    from eswasa_hr.lifecycle import _close

    p = frappe.db.get_value(PLAN, name, ["name", "department", "year", "status", "prepared_by"], as_dict=True)
    if not p:
        frappe.throw("Training plan not found.", frappe.DoesNotExistError)
    err = decider_error(frappe.session.user, _roles(), p.get("prepared_by"), p.get("status"))
    if err:
        frappe.throw(err, frappe.ValidationError if "isn't waiting" in err else frappe.PermissionError)
    key = (action or "").strip().lower()
    note = (comment or "").strip()
    if key == "approve":
        frappe.db.set_value(PLAN, name, {"status": APPROVED, "approved_by": frappe.session.user, "decided_on": _today().isoformat(), "decision_note": note or None})
        state = APPROVED
    elif key in ("reject", "return", "send back"):
        if not note:
            frappe.throw("Say what to change, so the preparer can correct it.", frappe.ValidationError)
        frappe.db.set_value(PLAN, name, {"status": SENT_BACK, "decided_on": _today().isoformat(), "decision_note": note})
        _tell_preparer(p, note)
        state = SENT_BACK
    else:
        frappe.throw("Approve or send back.", frappe.ValidationError)
    _close(PLAN, name)
    return {"ok": True, "doctype": PLAN, "name": name, "action": action, "workflow_action": None, "status": state, "message": f"{PLAN}: {state}"}


def _tell_preparer(p: dict[str, Any], note: str) -> int:
    """A sent-back plan reaches its preparer as a "Training plan" alert (raised once per decision)."""
    import frappe

    from eswasa_hr.alerts import raise_alert

    if not p.get("prepared_by"):
        return 0
    n = frappe.db.count("HR Alert", {"subject_name": p["name"], "rule": ALERT_RULE}) if _has("HR Alert") else 0
    title = f"Review training plan {p['department']} {p['year']}: sent back. {note}"
    return raise_alert(f"training-plan:{p['name']}:sent-back:{n + 1}", ALERT_RULE, title, [p["prepared_by"]], _today().isoformat(), subject=(PLAN, p["name"]))


# ---- events


def schedule_line_impl(plan: str, line: str, start: str, end: str, venue: str | None = None, trainer: str | None = None,
                       event_type: str | None = None) -> dict[str, Any]:
    """HR turns an approved line into an HRMS Training Event; the line's needs move to Planned."""
    import frappe

    _require_hr()
    p = frappe.db.get_value(PLAN, plan, ["name", "status", "department", "year"], as_dict=True)
    ln = next((r for r in _lines(plan) if r["name"] == line), None) if p else None
    if not p or not ln:
        frappe.throw("Plan line not found.", frappe.DoesNotExistError)
    errs = [e for e in (schedule_error(p["status"], ln.get("event")),) if e]
    s, f = str(start or "").strip(), str(end or "").strip()
    if not s or not f:
        errs.append("Give the start and end.")
    elif f < s:
        errs.append("The end can't be before the start.")
    if event_type and event_type not in EVENT_TYPES:
        errs.append("Choose a training type HRMS knows.")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    meta = frappe.get_meta(EVENT)
    doc: dict[str, Any] = {
        "doctype": EVENT,
        "event_name": ln["topic"],
        "type": event_type or EVENT_TYPES[0],
        "event_status": "Scheduled",
        "start_time": s if len(s) > 10 else f"{s} 09:00:00",
        "end_time": f if len(f) > 10 else f"{f} 17:00:00",
        "location": (venue or "").strip() or None,
        "trainer_name": (trainer or "").strip() or None,
        "introduction": f"{ln['topic']} ({ln.get('reason') or 'Need'}), {p['department']} training plan {p['year']}, {ln.get('quarter')}.",
    }
    company = frappe.db.get_value("Department", p["department"], "company")
    if company:
        doc["company"] = company
    for field, value in (("custom_plan_line", line), ("custom_skill", ln.get("skill")), ("custom_direct_cost", 0), ("custom_indirect_cost", 0)):
        if meta.has_field(field):
            doc[field] = value
    ev = frappe.get_doc(doc)
    ev.insert(ignore_permissions=True)
    frappe.db.set_value(LINE, line, "event", ev.name)
    for n in split_names(ln.get("needs")):
        if frappe.db.get_value(NEED, n, "status") in (OPEN, PLANNED):
            frappe.db.set_value(NEED, n, {"status": PLANNED, "event": ev.name, "plan": plan, "plan_line": line})
    return plan_impl(plan)


def _event(name: str) -> dict[str, Any]:
    import frappe

    e = frappe.db.get_value(EVENT, name, _event_fields(), as_dict=True)
    if not e:
        frappe.throw("Training event not found.", frappe.DoesNotExistError)
    return dict(e)


def _row_fields() -> list[str]:
    import frappe

    meta = frappe.get_meta(EVENT_ROW)
    return ["name", "employee", "employee_name", "department"] + [f for f in ("status", "attendance") if meta.has_field(f)]


def _nominees(event: str) -> list[dict[str, Any]]:
    import frappe

    rows = frappe.get_all(EVENT_ROW, filters={"parent": event, "parenttype": EVENT}, fields=_row_fields(), order_by="idx asc", limit=0)
    return [{**dict(r), "present": (r.get("attendance") == "Present") if r.get("attendance") else None} for r in rows]


def _plan_of_line(line: str | None) -> dict[str, Any] | None:
    import frappe

    if not line:
        return None
    parent = frappe.db.get_value(LINE, line, "parent")
    p = frappe.db.get_value(PLAN, parent, ["name", "department", "year", "status"], as_dict=True) if parent else None
    return dict(p) if p else None


def event_impl(name: str) -> dict[str, Any]:
    """Event: nominees, attendance and cost. HR sees everyone; a line manager sees their team's nominees."""
    import frappe

    e = _event(name)
    hr = _is_hr()
    v = None if hr else _viewer()
    rows = _nominees(name)
    if v is not None:
        if not v.reports and not any(r["employee"] == v.employee for r in rows):
            frappe.throw("You can't see this training event.", frappe.PermissionError)
        rows = [r for r in rows if r["employee"] in v.people]
    plan = _plan_of_line(e.get("custom_plan_line"))
    team = []
    if v is not None and v.reports:
        team = [dict(t) for t in frappe.get_all("Employee", filters={"name": ["in", v.reports], "status": "Active"}, fields=["name", "employee_name"], limit=0)]
    elif hr:  # HR picks from the plan department's active staff (anyone, when the event isn't from a plan)
        flt = {"status": "Active", **({"department": plan["department"]} if plan else {})}
        team = [dict(t) for t in frappe.get_all("Employee", filters=flt, fields=["name", "employee_name"], order_by="employee_name asc", limit=0)]
    upcoming = e.get("event_status") in (None, "", "Scheduled")
    return {
        "name": e["name"],
        "event_name": e.get("event_name"),
        "event_status": e.get("event_status"),
        "start_time": _str(e.get("start_time")),
        "end_time": _str(e.get("end_time")),
        "location": e.get("location"),
        "trainer_name": e.get("trainer_name"),
        "skill": e.get("custom_skill"),
        "plan": plan.get("name") if plan else None,
        "department": plan.get("department") if plan else None,
        "direct_cost": _num(e.get("custom_direct_cost")) if hr else None,
        "indirect_cost": _num(e.get("custom_indirect_cost")) if hr else None,
        "nominees": rows,
        "team": team,
        "can_nominate": upcoming and (hr or bool(team)),
        "can_record": hr,
        "result_url": f"/app/training-result/new?training_event={name}" if hr else None,
    }


def nominate_impl(event: str, employees: list[str]) -> dict[str, Any]:
    """Line managers nominate people in their scope; HR nominates anyone. Each nominee is told once."""
    import frappe

    from eswasa_hr import notify

    e = _event(event)
    if e.get("event_status") not in (None, "", "Scheduled"):
        frappe.throw("Nominations close once the event is completed or cancelled.", frappe.ValidationError)
    employees = split_names(employees)
    allowed = None if _is_hr() else _viewer().reports
    errs = nominate_errors(employees, allowed)
    if errs:
        frappe.throw(" ".join(errs), frappe.PermissionError if allowed is not None and employees else frappe.ValidationError)
    have = {r["employee"] for r in _nominees(event)}
    idx = len(have)
    for emp in employees:
        if emp in have:
            continue
        p = _employee(emp)
        if p["status"] != "Active":
            frappe.throw(f"{p['employee_name']} isn't an active employee.", frappe.ValidationError)
        idx += 1
        row = {"doctype": EVENT_ROW, "parent": event, "parenttype": EVENT, "parentfield": "employees", "idx": idx,
               "employee": emp, "employee_name": p["employee_name"], "department": p.get("department")}
        if frappe.get_meta(EVENT_ROW).has_field("status"):
            row["status"] = "Invited"
        frappe.get_doc(row).insert(ignore_permissions=True)
        if p.get("user_id"):
            notify.queue(f"training:{event}:{emp}", [p["user_id"]], "training_nominated",
                         {"event_name": e.get("event_name"), "start": str(e.get("start_time") or "")[:16], "venue": e.get("location") or "the venue given"})
    return event_impl(event)


def attendance_impl(event: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    """HR records who attended. Needs of people present (on this event or its plan line) become Met."""
    import frappe

    _require_hr()
    _event(event)
    nominees = {r["employee"]: r for r in _nominees(event)}
    unknown = [str(r.get("employee")) for r in rows or [] if r.get("employee") not in nominees]
    if not rows:
        frappe.throw("Mark at least one person.", frappe.ValidationError)
    if unknown:
        frappe.throw(f"Not nominated for this event: {', '.join(unknown)}.", frappe.ValidationError)
    fields = _row_fields()
    present = present_of(rows)
    for r in rows:
        here = r["employee"] in present
        change: dict[str, Any] = {}
        if "attendance" in fields:
            change["attendance"] = "Present" if here else "Absent"
        if "status" in fields and here:
            change["status"] = "Completed"
        if change:
            frappe.db.set_value(EVENT_ROW, nominees[r["employee"]]["name"], change)
    e = _event(event)
    pool = _needs({"event": event})
    if e.get("custom_plan_line"):
        pool += [n for n in _needs({"plan_line": e["custom_plan_line"]}) if n["name"] not in {p["name"] for p in pool}]
    for n in needs_met(pool, present):
        frappe.db.set_value(NEED, n, {"status": MET, "event": event})
    return event_impl(event)


def cost_impl(event: str, direct: Any, indirect: Any) -> dict[str, Any]:
    """HR records the actual direct and indirect cost (recorded only; nothing posts to accounts)."""
    import frappe

    _require_hr()
    _event(event)
    errs = cost_errors(direct, indirect)
    meta = frappe.get_meta(EVENT)
    if not (meta.has_field("custom_direct_cost") and meta.has_field("custom_indirect_cost")):
        errs.append("Training cost fields aren't installed yet (run bench migrate).")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    frappe.db.set_value(EVENT, event, {"custom_direct_cost": _num(direct), "custom_indirect_cost": _num(indirect)})
    return event_impl(event)


# ---- team and me


def _upcoming(employees: list[str] | None = None) -> list[dict[str, Any]]:
    import frappe

    if not _has(EVENT):
        return []
    day = _today().isoformat()
    rows = frappe.get_all(EVENT, filters={"event_status": "Scheduled", "start_time": [">=", day]}, fields=_event_fields(), order_by="start_time asc", limit=0)
    out = []
    for r in rows:
        nominees = _nominees(r["name"])
        mine = [n for n in nominees if employees is None or n["employee"] in employees]
        out.append({"name": r["name"], "event_name": r.get("event_name"), "start_time": _str(r.get("start_time")), "end_time": _str(r.get("end_time")),
                    "location": r.get("location"), "skill": r.get("custom_skill"), "nominated": [n["employee"] for n in mine]})
    return out


def team_training_impl() -> dict[str, Any]:
    """T8: my team's needs and upcoming events, with who of my team is nominated."""
    import frappe

    v = _viewer()
    reports = [] if v.hr else v.reports
    if not v.hr and not reports:
        return {"team": [], "needs": [], "events": []}
    team = [dict(t) for t in frappe.get_all("Employee", filters={"name": ["in", reports], "status": "Active"}, fields=["name", "employee_name"], limit=0)] if reports else []
    needs = _needs({"employee": ["in", reports]}) if reports else []
    return {"team": team, "needs": needs, "events": _upcoming(reports)}


def my_training_impl() -> dict[str, Any]:
    """E13: my needs, the courses I'm nominated for, and what I attended."""
    import frappe

    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not emp:
        return {"employee": None, "needs": [], "upcoming": [], "history": []}
    needs = _needs({"employee": emp})
    rows = frappe.get_all(EVENT_ROW, filters={"employee": emp, "parenttype": EVENT}, fields=["parent"] + _row_fields()[1:], limit=0) if _has(EVENT) else []
    events = _events(r["parent"] for r in rows)
    day = _today().isoformat()
    upcoming, history = [], []
    for r in rows:
        e = events.get(r["parent"])
        if not e:
            continue
        item = {"event": e["name"], "event_name": e.get("event_name"), "start_time": _str(e.get("start_time")), "end_time": _str(e.get("end_time")),
                "location": e.get("location"), "event_status": e.get("event_status"), "attendance": r.get("attendance")}
        if e.get("event_status") == "Scheduled" and str(e.get("start_time") or "")[:10] >= day:
            upcoming.append(item)
        else:
            history.append(item)
    upcoming.sort(key=lambda i: i["start_time"] or "")
    history.sort(key=lambda i: i["start_time"] or "", reverse=True)
    return {"employee": emp, "needs": needs, "upcoming": upcoming, "history": history}


# ---------------------------------------------------------------- overview, setup, board pack


def waiting_count() -> int:
    import frappe

    return frappe.db.count(PLAN, {"status": WAITING}) if _has(PLAN) else 0


def _current_year() -> str | None:
    import frappe

    if not _has("Fiscal Year"):
        return None
    day = _today().isoformat()
    rows = frappe.get_all("Fiscal Year", filters={"year_start_date": ["<=", day], "year_end_date": [">=", day]}, fields=["name"], limit=1)
    return rows[0]["name"] if rows else None


def setup_step() -> dict[str, Any]:
    """HR setup: "Training plans for {year}", done when every department has an approved plan."""
    import frappe

    from eswasa_hr.overview import step

    year = _current_year()
    if not year:
        return step("training_plans", "Training plans", "todo", "No fiscal year covers today. Add this year's Fiscal Year first.", "fiscal-year", desk=True)
    depts = [d["name"] for d in frappe.get_all("Department", filters={"is_group": 0, "disabled": 0}, fields=["name"], limit=0)]
    approved = [p["department"] for p in frappe.get_all(PLAN, filters={"year": year, "status": APPROVED}, fields=["department"], limit=0)] if _has(PLAN) else []
    have = len(set(approved) & set(depts))
    return step("training_plans", f"Training plans for {year}", setup_state(depts, approved),
                f"{have} of {len(depts)} departments have an approved training plan. {PROVISIONAL_APPROVER}", "/hr/training")


def board_block() -> dict[str, Any] | None:
    """Board pack: planned against attended training, and estimated against actual cost (totals only)."""
    import frappe

    if not _has(PLAN):
        return None
    year = _current_year()
    plans = frappe.get_all(PLAN, filters={"status": APPROVED, **({"year": year} if year else {})}, fields=["name"], limit=0)
    if not plans:
        return None
    lines = [ln for p in plans for ln in _lines(p["name"])]
    events = _events(ln.get("event") for ln in lines)
    totals = plan_totals(lines, events)
    attended = sum(1 for ev in events for r in _nominees(ev) if r.get("present"))
    return {"year": year, "plans": len(plans), "planned_people": totals["people"], "attended": attended, "lines": totals["lines"],
            "scheduled": totals["scheduled"], "estimated_cost": totals["estimated"], "actual_cost": totals["actual"]}


# ---------------------------------------------------------------- permission hooks (hooks.py)


def need_query(user: str | None = None, doctype: str | None = None) -> str:
    """HR sees every need; others their own, their team's and their headed departments' (narrowing only)."""
    import frappe

    from eswasa_hr.scope import _in, viewer_for

    v = viewer_for(user)
    if v.hr:
        return ""
    t = f"`tab{NEED}`"
    return f"({_in(f'{t}.`employee`', v.people, frappe.db.escape)} or {_in(f'{t}.`department`', v.headed, frappe.db.escape)})"


def need_has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    from eswasa_hr.scope import viewer_for

    v = viewer_for(user)
    if v.hr:
        return True
    if ptype not in (None, "read", "print", "email", "export", "report"):
        return False  # writes go through the methods below
    get = (lambda k: doc.get(k)) if isinstance(doc, dict) else (lambda k: getattr(doc, k, None))
    return get("employee") in v.people or (get("department") or None) in v.headed


def plan_query(user: str | None = None, doctype: str | None = None) -> str:
    """HR sees every plan; a head of department their own departments' plans."""
    import frappe

    from eswasa_hr.scope import _in, viewer_for

    v = viewer_for(user)
    if v.hr:
        return ""
    return _in(f"`tab{PLAN}`.`department`", v.headed, frappe.db.escape)


def plan_has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    from eswasa_hr.scope import viewer_for

    v = viewer_for(user)
    if v.hr:
        return True
    if ptype not in (None, "read", "print", "email", "export", "report"):
        return False
    dept = doc.get("department") if isinstance(doc, dict) else getattr(doc, "department", None)
    return bool(dept) and dept in v.headed


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


def _json(v: Any) -> Any:
    import json

    return json.loads(v) if isinstance(v, str) and v.strip()[:1] in ("[", "{") else v


@_whitelist
def needs(department: str | None = None, status: str | None = None, source: str | None = None, employee: str | None = None) -> dict[str, Any]:
    return needs_impl(department, status, source, employee)


@_whitelist
def raise_need(employee: str, topic: str, skill: str | None = None, priority: str | None = None, note: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return raise_need_impl(employee, topic, skill, priority, note)


@_whitelist
def plans(year: str | None = None, department: str | None = None) -> dict[str, Any]:
    return plans_impl(year, department)


@_whitelist
def plan(name: str) -> dict[str, Any]:
    return plan_impl(name)


@_whitelist
def save_plan(department: str, year: str, lines: Any = None, note: str | None = None, submit: Any = False, name: str | None = None,
              confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return save_plan_impl(department, year, _json(lines) or [], note, submit, name)


@_whitelist
def schedule_line(plan: str, line: str, start: str, end: str, venue: str | None = None, trainer: str | None = None, event_type: str | None = None,
                  confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return schedule_line_impl(plan, line, start, end, venue, trainer, event_type)


@_whitelist
def event(name: str) -> dict[str, Any]:
    return event_impl(name)


@_whitelist
def nominate(event: str, employees: Any = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return nominate_impl(event, _json(employees) or [])


@_whitelist
def attendance(event: str, rows: Any = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return attendance_impl(event, _json(rows) or [])


@_whitelist
def cost(event: str, direct: Any = 0, indirect: Any = 0, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return cost_impl(event, direct, indirect)


@_whitelist
def team_training() -> dict[str, Any]:
    return team_training_impl()


@_whitelist
def my_training() -> dict[str, Any]:
    return my_training_impl()
