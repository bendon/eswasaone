"""
Performance (brief §8; journey J6; screens H8, H8a, H8b, E7, T5).

HRMS objects, used natively: ``Appraisal Cycle`` → one ``Appraisal`` per person (rating criteria come from the
``Appraisal Template``) → ``Employee Performance Feedback`` from the line manager. Objectives are HRMS ``Goal``s
in the cycle, each linked to the strategic plan through ``Goal.custom_strategic_goal``.

- HR starts a cycle for chosen departments with one template; every appraisee gets a self-assessment ToDo.
- The employee rates the template criteria (1 to rating_max stars) and writes reflections; saving all ratings is "self done"
  and hands a review ToDo to the direct line manager.
- The direct line manager sets objectives, rates the same criteria and submits feedback ("manager done").
- HR sees completion by department (objectives set, self done, manager done) and can remind anyone with an open
  step. R-H6 does the same automatically 10 and 3 working days before the cycle end date.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable

from eswasa_hr import settings

from eswasa_hr.workdays import working_days_before

CYCLE = "Appraisal Cycle"
APPRAISAL = "Appraisal"
FEEDBACK = "Employee Performance Feedback"
# R-H6 reminder days (working days before end_date): HR Settings ``appraisal_reminder_days``.


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def fmt(d: date) -> str:
    return f"{d.day} {d.strftime('%b %Y')}"


def reminder_due(day: date, end: Any, holidays: Iterable[date] = ()) -> int | None:
    """R-H6: 10 or 3 when today is that many working days before the end date, else None."""
    e = _d(end)
    if not e:
        return None
    hol = list(holidays)
    return next((n for n in settings.get("appraisal_reminder_days") if working_days_before(e, n, hol) == day), None)


def completion(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per department: people, objectives set, self-assessments done, manager reviews done."""
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        c = out.setdefault(r.get("department") or "No department", {"department": r.get("department") or "No department", "people": 0, "objectives_set": 0, "self_done": 0, "manager_done": 0})
        c["people"] += 1
        c["objectives_set"] += 1 if r.get("objectives") else 0
        c["self_done"] += 1 if r.get("self_done") else 0
        c["manager_done"] += 1 if r.get("manager_done") else 0
    return sorted(out.values(), key=lambda c: c["department"])


def step_of(self_done: bool, manager_done: bool) -> str:
    if not self_done:
        return "self"
    return "done" if manager_done else "manager"


def rating_errors(criteria: list[str], stars: dict[str, Any]) -> list[str]:
    """Every criterion rated 1 to HR Settings' rating_max."""
    missing = [c for c in criteria if c not in stars or stars[c] in (None, "")]
    if missing:
        return [f"Rate every item: {', '.join(missing)}."]
    top = settings.get("rating_max")
    bad = [c for c in criteria if not str(stars[c]).isdigit() or not 1 <= int(stars[c]) <= top]
    return [f"Ratings are 1 to {top}: {', '.join(bad)}."] if bad else []


def cycle_errors(name: str, start: Any, end: Any, template: str | None) -> list[str]:
    errs = []
    if not (name or "").strip():
        errs.append("Name the cycle, e.g. Mid-year review 2026/27.")
    s, e = _d(start), _d(end)
    if not s or not e:
        errs.append("Choose the start and end dates.")
    elif e <= s:
        errs.append("The end date must be after the start date.")
    if not template:
        errs.append("Choose the template people are rated on.")
    return errs


def self_title(cycle: str, end: date) -> str:
    return f"Complete your self-assessment for {cycle} by {fmt(end)}"


def review_title(employee_name: str, cycle: str, end: date) -> str:
    return f"Review {employee_name}'s self-assessment for {cycle} by {fmt(end)}"


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _is_hr() -> bool:
    from eswasa_hr.lifecycle import _is_hr as hr

    return hr()


def _require_hr() -> None:
    from eswasa_hr.lifecycle import _require_hr as req

    req()


def _stars(v: Any) -> int | None:
    from eswasa_hr.hiring import rating_to_stars

    s = rating_to_stars(v)
    return int(round(s)) if s else None


def _user_of(employee: str | None) -> str | None:
    import frappe

    return frappe.db.get_value("Employee", employee, "user_id") if employee else None


def _todo(user: str | None, title: str, appraisal: str, due: Any) -> str | None:
    """One open ToDo per person per appraisal and title kind; returns the new ToDo's name, or None."""
    import frappe

    if not user:
        return None
    if frappe.db.exists("ToDo", {"reference_type": APPRAISAL, "reference_name": appraisal, "allocated_to": user, "status": "Open"}):
        return None
    todo = frappe.get_doc(
        {
            "doctype": "ToDo",
            "allocated_to": user,
            "description": title,
            "reference_type": APPRAISAL,
            "reference_name": appraisal,
            "status": "Open",
            "priority": "Medium",
            "date": due,
        }
    )
    todo.insert(ignore_permissions=True)
    return getattr(todo, "name", None) or "ToDo"


def _close_todos(appraisal: str, user: str | None = None) -> None:
    import frappe

    filters: dict[str, Any] = {"reference_type": APPRAISAL, "reference_name": appraisal, "status": "Open"}
    if user:
        filters["allocated_to"] = user
    for t in frappe.get_all("ToDo", filters=filters, fields=["name"], limit=0):
        frappe.db.set_value("ToDo", t["name"], "status", "Closed")


def _manager_done(appraisal: str, manager: str | None) -> bool:
    import frappe

    if not manager:
        return False
    return bool(frappe.db.exists(FEEDBACK, {"appraisal": appraisal, "reviewer": manager, "docstatus": 1}))


def _rows(cycle: str, department: str | None = None) -> list[dict[str, Any]]:
    """One row per appraisal in the cycle with its step."""
    import frappe

    filters: dict[str, Any] = {"appraisal_cycle": cycle, "docstatus": ["<", 2]}
    if department:
        filters["department"] = department
    out = []
    for a in frappe.get_all(APPRAISAL, filters=filters, fields=["name", "employee", "employee_name", "department", "designation", "self_score"], order_by="employee_name asc", limit=0):
        manager = frappe.db.get_value("Employee", a["employee"], "reports_to")
        self_done = bool(float(a.get("self_score") or 0))
        mgr_done = _manager_done(a["name"], manager)
        out.append(
            {
                "appraisal": a["name"],
                "employee": a["employee"],
                "employee_name": a["employee_name"],
                "department": a.get("department"),
                "designation": a.get("designation"),
                "manager_name": frappe.db.get_value("Employee", manager, "employee_name") if manager else None,
                "objectives": frappe.db.count("Goal", {"employee": a["employee"], "appraisal_cycle": cycle}),
                "self_done": self_done,
                "manager_done": mgr_done,
                "step": step_of(self_done, mgr_done),
            }
        )
    return out


def _cycle_head(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": c["name"],
        "cycle_name": c.get("cycle_name") or c["name"],
        "start_date": str(c["start_date"]) if c.get("start_date") else None,
        "end_date": str(c["end_date"]) if c.get("end_date") else None,
        "status": c.get("status"),
    }


def cycles_impl() -> dict[str, Any]:
    """H8: every cycle with overall completion."""
    import frappe

    _require_hr()
    items = []
    for c in frappe.get_all(CYCLE, fields=["name", "cycle_name", "start_date", "end_date", "status"], order_by="start_date desc", limit=20):
        depts = completion(_rows(c["name"]))
        total = {k: sum(d[k] for d in depts) for k in ("people", "objectives_set", "self_done", "manager_done")}
        items.append({**_cycle_head(c), **total})
    return {"items": items}


def cycle_impl(name: str, department: str | None = None) -> dict[str, Any]:
    """H8 detail: completion by department and everyone with their step."""
    import frappe

    _require_hr()
    c = frappe.db.get_value(CYCLE, name, ["name", "cycle_name", "start_date", "end_date", "status"], as_dict=True)
    if not c:
        frappe.throw("Cycle not found.", frappe.DoesNotExistError)
    rows = _rows(name)
    return {
        **_cycle_head(dict(c)),
        "departments": completion(rows),
        "people": [r for r in rows if not department or r["department"] == department],
    }


def defaults_impl() -> dict[str, Any]:
    """H8a: templates (with what people are rated on) and departments with their active headcount."""
    import frappe

    _require_hr()
    templates = []
    for t in frappe.get_all("Appraisal Template", fields=["name", "template_title"], order_by="name asc", limit=0):
        criteria = [r["criteria"] for r in frappe.get_all("Employee Feedback Rating", filters={"parent": t["name"], "parenttype": "Appraisal Template"}, fields=["criteria"], order_by="idx asc", limit=0)]
        kras = [r["key_result_area"] for r in frappe.get_all("Appraisal Template Goal", filters={"parent": t["name"]}, fields=["key_result_area"], order_by="idx asc", limit=0)]
        templates.append({"name": t["name"], "title": t.get("template_title") or t["name"], "criteria": criteria, "kras": kras})
    counts: dict[str, int] = {}
    for e in frappe.get_all("Employee", filters={"status": "Active"}, fields=["department"], limit=0):
        counts[e.get("department") or ""] = counts.get(e.get("department") or "", 0) + 1
    return {
        "templates": templates,
        "departments": [{"name": k, "people": v} for k, v in sorted(counts.items()) if k],
        "reminder_days": list(settings.get("appraisal_reminder_days")),
        "rating_max": settings.get("rating_max"),
    }


def start_cycle_impl(cycle_name: str, start_date: str, end_date: str, template: str, departments: list[str]) -> dict[str, Any]:
    """H8a: create the cycle, one appraisal per active person in the chosen departments, and self-assessment ToDos."""
    import frappe

    _require_hr()
    errs = cycle_errors(cycle_name, start_date, end_date, template)
    if template and not frappe.db.exists("Appraisal Template", template):
        errs.append("That template doesn't exist.")
    if frappe.db.exists(CYCLE, {"cycle_name": (cycle_name or "").strip()}):
        errs.append("A cycle with this name already exists.")
    filters: dict[str, Any] = {"status": "Active"}
    if departments:
        filters["department"] = ["in", departments]
    people = frappe.get_all("Employee", filters=filters, fields=["name", "employee_name", "company", "user_id"], order_by="employee_name asc", limit=0)
    if not people:
        errs.append("Nobody is in it. Choose departments with active staff.")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    cycle = frappe.get_doc(
        {
            "doctype": CYCLE,
            "cycle_name": cycle_name.strip(),
            "company": people[0]["company"],
            "start_date": start_date,
            "end_date": end_date,
            "kra_evaluation_method": "Automated Based on Goal Progress",
            "appraisees": [{"employee": p["name"], "appraisal_template": template} for p in people],
        }
    )
    cycle.insert()
    cycle.db_set("status", "In Progress")
    end = _d(end_date)
    for p in people:
        a = frappe.get_doc({"doctype": APPRAISAL, "employee": p["name"], "appraisal_cycle": cycle.name, "appraisal_template": template})
        a.insert(ignore_permissions=True)
        _todo(p.get("user_id"), self_title(cycle.cycle_name, end), a.name, end_date)
    return cycle_impl(cycle.name)


def remind_impl(cycle: str, department: str | None = None) -> dict[str, Any]:
    """HR "Remind outstanding" and R-H6: a ToDo for everyone with an open step (idempotent)."""
    import frappe

    c = frappe.db.get_value(CYCLE, cycle, ["name", "cycle_name", "end_date"], as_dict=True)
    if not c:
        frappe.throw("Cycle not found.", frappe.DoesNotExistError)
    end = _d(c["end_date"])
    sent = 0
    from eswasa_hr import notify

    for r in _rows(cycle, department):
        if r["step"] == "self":
            user, step_text = _user_of(r["employee"]), "Your self-assessment"
        elif r["step"] == "manager":
            user, step_text = _user_of(frappe.db.get_value("Employee", r["employee"], "reports_to")), f"Your review of {r['employee_name']}"
        else:
            continue
        title = self_title(c["cycle_name"], end) if r["step"] == "self" else review_title(r["employee_name"], c["cycle_name"], end)
        todo = _todo(user, title, r["appraisal"], c["end_date"])
        if todo:
            sent += 1
            notify.queue(f"appraisal:{r['appraisal']}:{r['step']}:{todo}", [user], "appraisal_step",
                         {"step_text": step_text, "cycle_name": c["cycle_name"], "due": str(c["end_date"])[:10]})
    return {"sent": sent}


def rh6_reminders() -> int:
    """Daily: R-H6 for cycles in progress, on the 10th and 3rd working day before the end date."""
    import frappe

    day = _today()
    n = 0
    for c in frappe.get_all(CYCLE, filters={"status": "In Progress", "end_date": [">=", day]}, fields=["name", "company", "end_date"], limit=0):
        from eswasa_hr.workdays import holidays

        if reminder_due(day, c["end_date"], holidays(company=c.get("company")) if c.get("company") else ()):
            n += remind_impl(c["name"])["sent"]
    return n


def _access(appraisal: Any) -> dict[str, bool]:
    """Who is looking: the person, their direct line manager, someone above them, or HR."""
    import frappe

    from eswasa_hr.team import _me, _tree

    me = _me()
    manager = frappe.db.get_value("Employee", appraisal.employee, "reports_to")
    own = bool(me) and me == appraisal.employee
    direct = bool(me) and me == manager
    above = bool(me) and not own and appraisal.employee in _tree(me)
    hr = _is_hr()
    if not (own or above or hr):
        frappe.throw("You can't see this appraisal.", frappe.PermissionError)
    return {"own": own, "direct": direct, "hr": hr}


def detail_impl(name: str) -> dict[str, Any]:
    """H8b / E7 / T5: goals with strategic links, criteria with self and manager stars, reflections, step."""
    import frappe

    a = frappe.get_doc(APPRAISAL, name)
    who = _access(a)
    c = frappe.db.get_value(CYCLE, a.appraisal_cycle, ["name", "cycle_name", "start_date", "end_date", "status"], as_dict=True) or {"name": a.appraisal_cycle}
    manager = frappe.db.get_value("Employee", a.employee, "reports_to")
    fb = frappe.get_all(FEEDBACK, filters={"appraisal": name, "reviewer": manager, "docstatus": 1}, fields=["name", "feedback"], limit=1) if manager else []
    mgr_stars = {}
    if fb:
        mgr_stars = {r["criteria"]: _stars(r.get("rating")) for r in frappe.get_all("Employee Feedback Rating", filters={"parent": fb[0]["name"], "parenttype": FEEDBACK}, fields=["criteria", "rating"], limit=0)}
    self_rows = list(a.get("self_ratings") or [])
    self_done = bool(float(a.get("self_score") or 0))
    mgr_done = bool(fb)
    open_cycle = (c.get("status") or "") != "Completed"
    goals = frappe.get_all("Goal", filters={"employee": a.employee, "appraisal_cycle": a.appraisal_cycle}, fields=["name", "goal_name", "kra", "custom_strategic_goal", "progress", "status"], order_by="creation asc", limit=0)
    return {
        "id": a.name,
        "cycle": a.appraisal_cycle,
        "cycle_name": c.get("cycle_name") or a.appraisal_cycle,
        "start_date": str(c["start_date"]) if c.get("start_date") else None,
        "end_date": str(c["end_date"]) if c.get("end_date") else None,
        "cycle_status": c.get("status"),
        "employee": a.employee,
        "employee_name": a.employee_name,
        "department": a.get("department"),
        "designation": a.get("designation"),
        "manager": manager,
        "manager_name": frappe.db.get_value("Employee", manager, "employee_name") if manager else None,
        "kras": [r.get("kra") for r in (a.get("appraisal_kra") or []) if r.get("kra")],
        "goals": [
            {"id": g["name"], "goal_name": g["goal_name"], "kra": g.get("kra"), "strategic_goal": g.get("custom_strategic_goal"), "progress": float(g.get("progress") or 0), "status": g.get("status")}
            for g in goals
        ],
        "criteria": [
            {
                "criteria": r.get("criteria"),
                "weight": float(r.get("per_weightage") or 0),
                # Self ratings are the person's own until they finish; the manager sees them after.
                "self": _stars(r.get("rating")) if (who["own"] or self_done) else None,
                "manager": mgr_stars.get(r.get("criteria")) if (mgr_done and (who["direct"] or who["hr"] or who["own"])) else None,
            }
            for r in self_rows
        ],
        "reflections": a.get("reflections") if (who["own"] or self_done) else None,
        "manager_feedback": fb[0].get("feedback") if fb else None,
        "self_done": self_done,
        "manager_done": mgr_done,
        "step": step_of(self_done, mgr_done),
        "can_self": who["own"] and open_cycle and not mgr_done,
        "can_review": who["direct"] and open_cycle and self_done and not mgr_done,
        "can_add_goals": (who["direct"] or who["hr"]) and open_cycle and not mgr_done,
    }


def _current(employee: str) -> str | None:
    import frappe

    rows = frappe.get_all(APPRAISAL, filters={"employee": employee, "docstatus": ["<", 2]}, fields=["name", "appraisal_cycle"], order_by="creation desc", limit=5)
    for r in rows:
        if frappe.db.get_value(CYCLE, r["appraisal_cycle"], "status") != "Completed":
            return r["name"]
    return rows[0]["name"] if rows else None


def my_appraisal_impl() -> dict[str, Any] | None:
    """E7: the signed-in person's current appraisal, or None."""
    import frappe

    from eswasa_hr.team import _me

    me = _me()
    if not me:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    name = _current(me)
    return detail_impl(name) if name else None


def save_self_impl(ratings: list[dict[str, Any]], reflections: str | None) -> dict[str, Any]:
    """E7: rate every criterion; saving all of them is "self done" and hands the review to the line manager."""
    import frappe

    from eswasa_hr.hiring import rating_to_frappe
    from eswasa_hr.team import _me

    me = _me()
    name = _current(me) if me else None
    if not name:
        frappe.throw("You have no appraisal open.", frappe.DoesNotExistError)
    d = detail_impl(name)
    if not d["can_self"]:
        frappe.throw("Your self-assessment can't be changed now.", frappe.ValidationError)
    stars = {str(r.get("criteria")): r.get("stars") for r in ratings or []}
    errs = rating_errors([c["criteria"] for c in d["criteria"]], stars)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    a = frappe.get_doc(APPRAISAL, name)
    for row in a.self_ratings:
        row.rating = rating_to_frappe(int(stars[row.criteria]))
    a.reflections = (reflections or "").strip() or None
    a.flags.ignore_permissions = True  # own record, checked above
    a.save()
    _close_todos(name, frappe.session.user)
    manager = frappe.db.get_value("Employee", a.employee, "reports_to")
    c = frappe.db.get_value(CYCLE, a.appraisal_cycle, ["cycle_name", "end_date"], as_dict=True)
    _todo(_user_of(manager), review_title(a.employee_name, c["cycle_name"], _d(c["end_date"])), name, c["end_date"])
    return detail_impl(name)


def team_review_impl(employee: str) -> dict[str, Any] | None:
    """T5: the report's current appraisal (for anyone above them; only the direct manager can submit)."""
    from eswasa_hr.team import _require_in_team

    _require_in_team(employee)
    name = _current(employee)
    return detail_impl(name) if name else None


def add_goal_impl(employee: str, goal_name: str, kra: str | None, strategic_goal: str | None) -> dict[str, Any]:
    """T5 / H8b: an objective in the current cycle, linked to the strategic plan."""
    import frappe

    name = _current(employee)
    if not name:
        frappe.throw("There's no appraisal open for this person.", frappe.DoesNotExistError)
    d = detail_impl(name)
    if not d["can_add_goals"]:
        frappe.throw("Only the line manager or HR can set objectives while the review is open.", frappe.PermissionError)
    if not (goal_name or "").strip():
        frappe.throw("Describe the objective.", frappe.ValidationError)
    if d["kras"] and kra not in d["kras"]:
        frappe.throw("Choose one of the result areas in this person's template.", frappe.ValidationError)
    a = frappe.get_doc(APPRAISAL, name)
    c = frappe.db.get_value(CYCLE, a.appraisal_cycle, ["start_date", "end_date"], as_dict=True)
    frappe.get_doc(
        {
            "doctype": "Goal",
            "goal_name": goal_name.strip(),
            "employee": employee,
            "appraisal_cycle": a.appraisal_cycle,
            "kra": kra or None,
            "custom_strategic_goal": (strategic_goal or "").strip() or None,
            "start_date": c["start_date"],
            "end_date": c["end_date"],
        }
    ).insert(ignore_permissions=True)
    return detail_impl(name)


def submit_review_impl(employee: str, ratings: list[dict[str, Any]], feedback: str, training_needs: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """T5: the direct line manager rates the criteria and comments; submitted as Employee Performance Feedback.
    ``training_needs`` ([{topic, skill?}]) each become a Training Need (source Appraisal, additions plan 05)."""
    import frappe

    from eswasa_hr.hiring import rating_to_frappe
    from eswasa_hr.team import _me

    name = _current(employee)
    if not name:
        frappe.throw("There's no appraisal open for this person.", frappe.DoesNotExistError)
    d = detail_impl(name)
    if not d["can_review"]:
        if d["step"] == "self":
            frappe.throw("Wait for the self-assessment first.", frappe.ValidationError)
        frappe.throw("Only the direct line manager reviews, once.", frappe.PermissionError)
    stars = {str(r.get("criteria")): r.get("stars") for r in ratings or []}
    errs = rating_errors([c["criteria"] for c in d["criteria"]], stars)
    if not (feedback or "").strip():
        errs.append("Add a comment for the person.")
    from eswasa_hr.training_plan import needs_from_review, review_need_errors

    errs += review_need_errors(training_needs)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    fb = frappe.get_doc(
        {
            "doctype": FEEDBACK,
            "employee": employee,
            "reviewer": _me(),
            "appraisal": name,
            "appraisal_cycle": d["cycle"],
            "feedback": feedback.strip(),
            "feedback_ratings": [{"criteria": c["criteria"], "per_weightage": c["weight"], "rating": rating_to_frappe(int(stars[c["criteria"]]))} for c in d["criteria"]],
        }
    )
    fb.insert(ignore_permissions=True)
    fb.submit()
    needs_from_review(employee, training_needs, name)
    _close_todos(name, frappe.session.user)
    return detail_impl(name)


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals "Mark done" on an appraisal ToDo: only once your step is actually done."""
    import frappe

    from eswasa_hr.team import _me

    d = detail_impl(name)
    me = _me()
    mine_open = (d["employee"] == me and d["step"] == "self") or (d["manager"] == me and d["step"] == "manager")
    if mine_open:
        frappe.throw("Open the appraisal in EswasaOne to finish this step.", frappe.ValidationError)
    _close_todos(name, frappe.session.user)
    return {"ok": True, "doctype": APPRAISAL, "name": name, "action": action, "workflow_action": None, "status": "Done", "message": "Appraisal step done"}


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
def cycles() -> dict[str, Any]:
    return cycles_impl()


@_whitelist
def cycle(name: str, department: str | None = None) -> dict[str, Any]:
    return cycle_impl(name, department)


@_whitelist
def defaults() -> dict[str, Any]:
    return defaults_impl()


@_whitelist
def start_cycle(cycle_name: str, start_date: str, end_date: str, template: str, departments: Any = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return start_cycle_impl(cycle_name, start_date, end_date, template, _json(departments) or [])


@_whitelist
def remind(cycle: str, department: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    _require_hr()
    return remind_impl(cycle, department)


@_whitelist
def appraisal(name: str) -> dict[str, Any]:
    return detail_impl(name)


@_whitelist
def my_appraisal() -> dict[str, Any] | None:
    return my_appraisal_impl()


@_whitelist
def save_self(ratings: Any = None, reflections: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return save_self_impl(_json(ratings) or [], reflections)


@_whitelist
def team_review(employee: str) -> dict[str, Any] | None:
    return team_review_impl(employee)


@_whitelist
def add_goal(employee: str, goal_name: str, kra: str | None = None, strategic_goal: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return add_goal_impl(employee, goal_name, kra, strategic_goal)


@_whitelist
def submit_review(employee: str, ratings: Any = None, feedback: str = "", training_needs: Any = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return submit_review_impl(employee, _json(ratings) or [], feedback, _json(training_needs) or [])
