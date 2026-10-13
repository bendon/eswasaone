"""
HR Overview (H0), the Board HR pack (H15) and HR setup progress (H14).

All three are built from the same live counts as the slices that own the data (alerts, team, competence,
recruitment, hiring, lifecycle, contracts, performance, cases, declarations, establishment). Nothing is
invented: a count that can't be worked out yet (DocType missing, no data) is zero or ``None`` and the screen
says so.

- Overview: HR roles. Needs attention is one ordered list of what HR has to act on, each with a link.
  Cases appear only for HR Managers, and only as counts.
- Board HR pack: Council HR & Remuneration Committee (Board roles), HR Managers and the Executive Director.
  Aggregates only, never a name.
- Setup: System Manager or HR Manager. Each step is done, partly done or to do, from live counts, with a link to
  where it is set up.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable

from eswasa_hr import settings

HR_ROLES = ("HR Manager", "HR User", "System Manager")
BOARD_ROLES = ("Eswasa Board Member", "Eswasa Board Secretary", "Eswasa Executive Director", "HR Manager", "System Manager")
SETUP_ROLES = ("HR Manager", "System Manager")
# Windows (contract and probation notice, movements, turnover, cycle warning) come from HR Settings.

DONE, PARTIAL, TODO, AWAITING, EXCLUDED = "done", "partial", "todo", "awaiting", "excluded"


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def turnover_pct(leavers: int, headcount_now: int, joiners: int) -> float | None:
    """Leavers in 12 months over the average of headcount then and now."""
    start = headcount_now - joiners + leavers
    avg = (start + headcount_now) / 2
    return round(leavers / avg * 100, 1) if avg > 0 else None


def rank(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Needs attention order: overdue first, then by due date, then the undated; empty counts dropped."""
    far = date.max
    keep = [i for i in items if i.get("count")]
    return sorted(keep, key=lambda i: (_d(i.get("due")) or far, -int(i.get("weight") or 0), i["title"]))


def attention(kind: str, count: int, one: str, many: str, href: str, due: Any = None, detail: str | None = None, weight: int = 0) -> dict[str, Any]:
    d = _d(due)
    return {
        "kind": kind,
        "count": int(count or 0),
        "title": (one if count == 1 else many.format(n=count)),
        "detail": detail,
        "due": d.isoformat() if d else None,
        "href": href,
        "weight": weight,
    }


def gaps_detail(quality: list[dict[str, Any]], ran_on: Any) -> str | None:
    """What the records are missing (largest gaps first, Executive Director excluded) and when that was checked."""
    rows = sorted((q for q in quality if q["field"] != "executive_director"), key=lambda q: -q["count"])
    if not rows:
        return None
    parts = [f"{q['label']} ({q['count']})" for q in rows[:3]] + ([f"{len(rows) - 3} more"] if len(rows) > 3 else [])
    when = f"Checked {str(ran_on)[:16].replace('T', ' ')}." if ran_on else "Checked just now."
    return f"{' · '.join(parts)}. {when}"


def step(id_: str, title: str, state: str, detail: str, href: str | None = None, awaiting: str | None = None, desk: bool = False) -> dict[str, Any]:
    return {"id": id_, "title": title, "state": state, "detail": detail, "href": href, "awaiting": awaiting, "desk": desk}


def progress(steps: list[dict[str, Any]]) -> dict[str, int]:
    counted = [s for s in steps if s["state"] != EXCLUDED]
    done = sum(1 for s in counted if s["state"] == DONE)
    return {"done": done, "total": len(counted), "pct": round(done / len(counted) * 100) if counted else 0}


def record_gaps(rows: Iterable[dict[str, Any]], top: Iterable[str] = (), departments: dict[str, dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Active employee records missing what routing and self-service need (the R-H7 rule, ``integrity.gaps``)."""
    from eswasa_hr.integrity import CHECKS, summarise

    by = summarise(rows, top, departments)["by_field"]
    return [{"field": f, "label": label, "count": by[f]} for f, label in CHECKS]


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _require(roles: tuple[str, ...], what: str) -> None:
    import frappe

    if not set(frappe.get_roles()) & set(roles):
        frappe.throw(f"You can't see the {what}.", frappe.PermissionError)


def _has(dt: str) -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", dt))


def _count(dt: str, filters: dict[str, Any] | list | None = None) -> int:
    import frappe

    return frappe.db.count(dt, filters or {}) if _has(dt) else 0


def _earliest(dt: str, filters: dict[str, Any], field: str) -> Any:
    import frappe

    if not _has(dt):
        return None
    rows = frappe.get_all(dt, filters=filters, fields=[field], order_by=f"{field} asc", limit=1)
    return rows[0].get(field) if rows else None


def _open_alerts() -> dict[str, dict[str, Any]]:
    """Per rule: how many records (not alert rows: one authorisation can have an alert per threshold) still have an
    unacknowledged alert, the earliest due date, and whether the viewer holds one of the open ToDos."""
    import frappe

    out: dict[str, dict[str, Any]] = {}
    if not _has("HR Alert"):
        return out
    todos = frappe.get_all("ToDo", filters={"reference_type": "HR Alert", "status": "Open"}, fields=["reference_name", "allocated_to"], limit=0)
    open_ids = {t.get("reference_name") for t in todos}
    mine = {t.get("reference_name") for t in todos if t.get("allocated_to") == frappe.session.user}
    if not open_ids:
        return out
    for a in frappe.get_all("HR Alert", filters={"name": ["in", sorted(open_ids)]}, fields=["name", "rule", "due", "subject_doctype", "subject_name", "key"], limit=0):
        c = out.setdefault(a.get("rule"), {"subjects": set(), "due": None, "mine": False})
        c["subjects"].add((a.get("subject_doctype"), a.get("subject_name")) if a.get("subject_name") else a.get("key") or a.get("name"))
        c["mine"] = c["mine"] or a.get("name") in mine
        due = _d(a.get("due"))
        if due and (c["due"] is None or due < c["due"]):
            c["due"] = due
    for c in out.values():
        c["count"] = len(c.pop("subjects"))
    return out


def _movements(day: date, days: int) -> dict[str, int]:
    since = day - timedelta(days=days)
    return {
        "joiners": _count("Employee", settings.live({"date_of_joining": ["between", [since, day]]})),
        "leavers": _count("Employee", settings.live({"relieving_date": ["between", [since, day]]})),
    }


def _turnover(day: date, headcount: int) -> dict[str, Any]:
    m = _movements(day, settings.get("turnover_days"))
    return {**m, "pct": turnover_pct(m["leavers"], headcount, m["joiners"])}


def _away_today(day: date) -> list[dict[str, Any]]:
    import frappe

    if not _has("Leave Application"):
        return []
    rows = frappe.get_all(
        "Leave Application",
        filters={"docstatus": 1, "status": "Approved", "from_date": ["<=", day], "to_date": [">=", day]},
        fields=["employee", "employee_name", "leave_type", "to_date"],
        order_by="to_date asc",
        limit=50,
    )
    return [{"employee": r.get("employee"), "employee_name": r.get("employee_name"), "leave_type": r.get("leave_type"), "back_on": str(_d(r.get("to_date")) + timedelta(days=1)) if r.get("to_date") else None} for r in rows]


def _cycle_status(day: date) -> list[dict[str, Any]]:
    """Open appraisal cycles with outstanding steps (people, self done, manager done)."""
    import frappe

    from eswasa_hr.performance import CYCLE, _rows, completion

    if not _has(CYCLE):
        return []
    out = []
    for c in frappe.get_all(CYCLE, filters={"end_date": [">=", day]}, fields=["name", "cycle_name", "end_date"], order_by="end_date asc", limit=5):
        depts = completion(_rows(c["name"]))
        people = sum(d["people"] for d in depts)
        manager_done = sum(d["manager_done"] for d in depts)
        out.append({"name": c["name"], "cycle_name": c.get("cycle_name") or c["name"], "end_date": str(c["end_date"]), "people": people,
                    "self_done": sum(d["self_done"] for d in depts), "manager_done": manager_done})
    return out


def overview_impl() -> dict[str, Any]:
    """H0: KPI strip, needs attention, establishment, away today, movements and record quality."""
    import frappe

    from eswasa_hr.establishment import OPEN_STATES, approved_posts, establishment_impl

    _require(HR_ROLES, "HR overview")
    day = _today()
    soon = day + timedelta(days=settings.get("contract_notice_days"))
    probation_soon = day + timedelta(days=settings.get("probation_notice_days"))
    manager = bool(set(frappe.get_roles()) & {"HR Manager", "System Manager"})
    active = frappe.get_all("Employee", filters=settings.live({"status": "Active"}), fields=["name", "department", "designation", "reports_to", "leave_approver", "user_id"], limit=0)
    headcount = len(active)
    alerts = _open_alerts()

    notice, handoff = settings.get("contract_notice_days"), settings.get("declaration_handoff_days")
    items = []
    for rule, (one, many, href) in {
        "R-H2": (f"1 contract ends within {notice} days", f"{{n}} contracts end within {notice} days", "/hr/directory"),
        "R-H3": ("1 staff authorisation is expiring", "{n} staff authorisations are expiring", "/hr/competence"),
        "R-H4": ("1 competence has thin cover", "{n} competences have thin cover", "/hr/competence"),
        "Late declaration": (f"1 declaration unsigned after {handoff} days", f"{{n}} declarations unsigned after {handoff} days", "/hr/competence"),
        "Document expiry": ("1 employee document is expiring", "{n} employee documents are expiring", "/hr/directory"),
    }.items():
        a = alerts.get(rule, {})
        items.append(attention(rule, a.get("count", 0), one, many, href, a.get("due"), "You have this in Approvals to acknowledge once handled." if a.get("mine") else None, 2))
    probation = settings.live({"status": "Active", "scheduled_confirmation_date": ["<=", probation_soon], "final_confirmation_date": ["in", ["", None]]})
    items.append(attention("probation", _count("Employee", probation), "1 probation review due", "{n} probation reviews due", "/hr/directory",
                           _earliest("Employee", probation, "scheduled_confirmation_date"), None, 2))
    items.append(attention("authorisation", _count("Staff Authorisation", {"docstatus": 0}), "1 staff authorisation waiting for the head",
                           "{n} staff authorisations waiting for the head", "/hr/competence"))
    items.append(attention("requisition", _count("Job Requisition", {"status": "Pending"}), "1 requisition waiting for approval", "{n} requisitions waiting for approval", "/hr/recruitment"))
    items.append(attention("offer", _count("Job Offer", {"docstatus": 0}), "1 job offer waiting for approval", "{n} job offers waiting for approval", "/hr/recruitment"))
    changes = sum(_count(dt, {"docstatus": 0}) for dt in ("Employee Promotion", "Employee Transfer", "Employee Separation"))
    changes += _count("Contract Change", {"state": "Waiting for approval"})
    items.append(attention("change", changes, "1 promotion, transfer, leaver or contract change waiting", "{n} promotions, transfers, leavers or contract changes waiting", "/hr/directory"))
    items.append(attention("leave", _count("Leave Application", {"docstatus": 0, "status": "Open"}), "1 leave request waiting for a decision", "{n} leave requests waiting for a decision", "/hr/time-off"))
    overdue_leave = {"reference_type": "Leave Application", "status": "Open", "date": ["<", day], "description": ["not like", "[escalated]%"]}
    items.append(attention("leave_overdue", _count("ToDo", overdue_leave), "1 leave request past its decision date", "{n} leave requests past their decision date",
                           "/approvals", _earliest("ToDo", overdue_leave, "date"), f"The approver had {settings.get('leave_sla_days')} working days to decide.", 2))
    items.append(attention("establishment", _count("Establishment Change", {"state": ["in", list(OPEN_STATES)]}), "1 establishment change waiting for a decision",
                           "{n} establishment changes waiting for a decision", "/hr/structure?tab=establishment"))
    cycles = _cycle_status(day)
    for c in cycles:
        end = _d(c["end_date"])
        left = c["people"] - c["manager_done"]
        if end and (end - day).days <= settings.get("cycle_warn_days") and left:
            items.append(attention("appraisal", left, f"1 appraisal not finished in {c['cycle_name']}", f"{{n}} appraisals not finished in {c['cycle_name']}",
                                   f"/hr/performance/cycles/{c['name']}", end, "Remind people from the cycle page.", 1))
    if manager and (_has("Employee Grievance") or _has("Disciplinary Case")):
        from eswasa_hr.cases import board_impl

        open_cases = sum(k["open"] for k in board_impl()["kinds"])
        items.append(attention("cases", open_cases, "1 open case", "{n} open cases", "/hr/cases", None, "Details stay inside each case."))

    # R-H7: last night's snapshot; before the first run (or before migrate), the same rule live.
    from eswasa_hr import integrity

    snap = integrity.current()
    if snap is None:
        live = integrity.summarise(integrity._active_rows(), integrity.top_employees(), integrity._departments())
        snap = {"ran_on": None, "counts": {"people": live["people"], "by_field": live["by_field"]}}
    quality = integrity.quality(snap["counts"])
    items.append(attention("record_gaps", snap["counts"].get("people", 0), "1 employee record has gaps", "{n} employee records have gaps", "/hr/directory",
                           None, gaps_detail(quality, snap["ran_on"])))
    if (snap["counts"].get("by_field") or {}).get(integrity.NO_TOP[0]):
        items.append(attention("executive_director", 1, "No Executive Director set", "No Executive Director set", "/system-admin?tab=users", None,
                               f"Give one user the {integrity.TOP_ROLE} role so escalations and Council decisions have someone to go to.", 1))

    est = establishment_impl() if approved_posts() else None
    return {
        "as_of": day.isoformat(),
        "headcount": headcount,
        "departments": len({r.get("department") for r in active if r.get("department")}),
        "establishment": {
            "has_plans": bool(est),
            "totals": est["totals"] if est else None,
            "departments": [{k: r[k] for k in ("department", "approved", "filled", "vacant", "frozen")} for r in est["departments"]] if est else [],
        },
        "attention": rank(items),
        "away_today": _away_today(day),
        "movements": _movements(day, settings.get("movement_days")),
        "windows": {k: settings.get(k) for k in ("movement_days", "turnover_days", "contract_notice_days", "probation_notice_days")},
        "turnover": _turnover(day, headcount),
        "ending_soon": {
            "contracts": _count("Employee", settings.live({"status": "Active", "contract_end_date": ["between", [day, soon]]})),
            "probations": _count("Employee", probation),
        },
        "record_quality": quality,
        "record_checked_on": snap["ran_on"],
        "cycles": cycles,
    }


def board_pack_impl() -> dict[str, Any]:
    """H15: aggregates for the Council HR & Remuneration Committee. No names, pay or case details."""
    import frappe

    from eswasa_hr.establishment import OPEN_STATES, _changes, approved_posts, counts

    _require(BOARD_ROLES, "Board HR pack")
    day = _today()
    headcount = frappe.db.count("Employee", settings.live({"status": "Active"}))
    est = counts() if approved_posts() else None
    cycles = _cycle_status(day - timedelta(days=settings.get("movement_days")))
    latest = max(cycles, key=lambda c: c["end_date"]) if cycles else None
    cover = None
    if _has("Staff Authorisation"):
        from eswasa_hr.alerts import thin_cover
        from eswasa_hr.authorisations import _all_rows, cover as cover_of

        rows = [r for r in _all_rows() if r["status"] != "Withdrawn"]
        skills = [s["name"] for s in frappe.get_all("Skill", filters={"custom_kind": ["is", "set"]}, fields=["name"], limit=0)]
        cover = {"catalogue": len(skills), "at_risk": len(thin_cover(skills, cover_of(rows)))}
    cases = None
    if _has("Employee Grievance") or _has("Disciplinary Case"):
        from eswasa_hr.cases import board_impl

        cases = board_impl()["kinds"]
    declarations = None
    if _has("Impartiality Declaration"):
        from eswasa_hr.declarations import register_impl

        reg = register_impl()
        declarations = {"signed": reg.get("signed", 0), "total": reg.get("total", 0), "year": reg.get("year_label") or reg.get("year")}
    pending = _changes({"state": ["in", list(OPEN_STATES)]}) if _has("Establishment Change") else []
    return {
        "as_of": day.isoformat(),
        "headcount": headcount,
        "establishment": est,
        "turnover": _turnover(day, headcount),
        "appraisals": {k: latest[k] for k in ("cycle_name", "end_date", "people", "self_done", "manager_done")} if latest else None,
        "competence": cover,
        "cases": cases,
        "declarations": declarations,
        "establishment_changes": [{k: c[k] for k in ("summary", "department", "state", "council_required")} for c in pending],
    }


def _receipt_threshold() -> float | None:
    from eswasa_hr.expenses import threshold

    return threshold()


def _required_documents() -> int:
    from eswasa_hr.documents import required_count

    return required_count()


def setup_status_impl() -> dict[str, Any]:
    """H14: where HR setup stands, step by step, from live counts."""
    import frappe

    _require(SETUP_ROLES, "HR setup")
    depts = frappe.get_all("Department", filters={"is_group": 0, "disabled": 0}, fields=["name", "custom_head"], limit=0) if _has("Department") else []
    headed = sum(1 for d in depts if d.get("custom_head"))
    plans, grades = _count("Staffing Plan", {"docstatus": 1}), _count("Employee Grade")
    holidays = _count("Holiday List")
    company_holidays = frappe.db.get_value("Company", {}, "default_holiday_list") if _has("Company") else None
    leave_types, policies = _count("Leave Type"), _count("Leave Policy", {"docstatus": 1})
    skills = _count("Skill", {"custom_kind": ["is", "set"]})
    active = frappe.get_all("Employee", filters=settings.live({"status": "Active"}), fields=["reports_to", "leave_approver", "user_id"], limit=0)
    no_manager = sum(1 for r in active if not r.get("reports_to"))
    no_approver = sum(1 for r in active if not r.get("leave_approver"))
    linked = sum(1 for r in active if r.get("user_id"))
    ed = _count("Has Role", {"role": "Eswasa Executive Director", "parenttype": "User"})
    levels = _count("Property Setter", {"doc_type": "Employee", "property": "permlevel"})
    expense_types = _count("Expense Claim Type")
    receipt_above = _receipt_threshold() if expense_types else None
    required_docs = _required_documents()

    steps = [
        step("organisation", "Organisation", DONE if _count("Company") else TODO, "The company record ESWASA's departments sit under.", "company", desk=True),
        step(
            "departments",
            "Departments and heads",
            DONE if depts and headed == len(depts) else PARTIAL if depts else TODO,
            f"{len(depts)} departments, {headed} with a head." if depts else "No departments yet. Add ESWASA's departments and set a head for each.",
            "/hr/structure?tab=departments",
        ),
        step(
            "posts",
            "Posts and grades",
            DONE if plans and grades else PARTIAL if plans or grades else TODO,
            f"{plans} submitted staffing plans, {grades} grades.",
            "/hr/structure?tab=establishment",
        ),
        step("holidays", "Holidays", DONE if holidays and company_holidays else PARTIAL if holidays else TODO,
             f"{holidays} holiday lists" + (", company default set." if company_holidays else ", no company default yet."), "holiday-list", desk=True),
        step("leave", "Leave policy", DONE if policies else PARTIAL if leave_types else TODO, f"{leave_types} leave types, {policies} submitted leave policies.",
             "leave-policy", desk=True),
        step("competence", "Competence catalogue", DONE if skills else TODO, f"{skills} competences in the catalogue.", "/hr/competence"),
        step("documents", "Required documents", DONE if required_docs else TODO,
             f"{required_docs} employment types list the documents staff must hold." if required_docs
             else "No employment type lists required documents yet. Add them to each employment type with how long they stay valid.",
             "employment-type", desk=True),
        step(
            "approvers",
            "Approvers and privacy",
            DONE if active and not no_manager and not no_approver and ed and levels else PARTIAL if levels or ed else TODO,
            f"{levels} protected Employee fields; Executive Director role {'assigned' if ed else 'not assigned'}; "
            f"{no_manager} people without a line manager, {no_approver} without a leave approver.",
            "/hr/directory",
        ),
        _import_step(len(active), linked),
        step(
            "expenses",
            "Expense claims",
            DONE if expense_types else TODO,
            f"{expense_types} expense types; "
            + (f"receipts needed above {receipt_above:,.2f}." if receipt_above else "a receipt is needed on every line (no threshold set)."),
            "expense-claim-type",
            desk=True,
        ),
        # _payroll_step(),  # off: ESWASA doesn't run payroll in EswasaOne; restore when it does
    ]
    return {"steps": steps, **progress(steps)}


def _import_step(active: int, linked: int) -> dict[str, Any]:
    """Plan 09: the state comes from the last HR Import Run per pass (records, then links); the link opens the
    import panel on the HR setup page (template, dry run, run, past runs)."""
    from eswasa_hr.employee_import import import_state, last_runs

    state, detail = import_state(last_runs())
    return step(
        "import",
        "Import employees",
        {"done": DONE, "partial": PARTIAL}.get(state, PARTIAL if active else TODO),
        (f"{active} active employees, {linked} with a login. " if active else "") + detail,
        "/system-admin?tab=hr-setup#hr-import",
        desk=False,
    )


def _payroll_step() -> dict[str, Any]:
    """Payroll from what HRMS holds: salary structures, who is assigned one, and the last payroll run."""
    import frappe

    structures = _count("Salary Structure", {"docstatus": 1})
    assigned = _count("Salary Structure Assignment", {"docstatus": 1})
    runs = frappe.get_all("Payroll Entry", filters={"docstatus": 1}, fields=["posting_date"], order_by="posting_date desc", limit=1) if _has("Payroll Entry") else []
    last = f" Last payroll run {runs[0]['posting_date']}." if runs else ""
    return step(
        "payroll",
        "Payroll",
        DONE if structures and assigned and runs else PARTIAL if structures else TODO,
        f"{structures} salary structures, {assigned} employees assigned one.{last}",
        "salary-structure",
        desk=True,
    )


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def overview() -> dict[str, Any]:
    return overview_impl()


@_whitelist
def board_pack() -> dict[str, Any]:
    return board_pack_impl()


@_whitelist
def setup_status() -> dict[str, Any]:
    return setup_status_impl()
