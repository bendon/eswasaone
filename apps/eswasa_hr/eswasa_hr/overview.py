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
- Setup: System Manager or HR Manager. Each step is done, partly done, to do, waiting for an ESWASA input,
  or excluded (payroll, until Confirmation Pack H15 is answered).

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable

HR_ROLES = ("HR Manager", "HR User", "System Manager")
BOARD_ROLES = ("Eswasa Board Member", "Eswasa Board Secretary", "Eswasa Executive Director", "HR Manager", "System Manager")
SETUP_ROLES = ("HR Manager", "System Manager")
SOON_DAYS = 60
MOVEMENT_DAYS = 90
CYCLE_WARN_DAYS = 14

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
    """Per rule: alerts someone still has to acknowledge, and the earliest due date."""
    import frappe

    out: dict[str, dict[str, Any]] = {}
    if not _has("HR Alert"):
        return out
    open_ids = {t.get("reference_name") for t in frappe.get_all("ToDo", filters={"reference_type": "HR Alert", "status": "Open"}, fields=["reference_name"], limit=0)}
    if not open_ids:
        return out
    for a in frappe.get_all("HR Alert", filters={"name": ["in", sorted(open_ids)]}, fields=["rule", "due"], limit=0):
        c = out.setdefault(a.get("rule"), {"count": 0, "due": None})
        c["count"] += 1
        due = _d(a.get("due"))
        if due and (c["due"] is None or due < c["due"]):
            c["due"] = due
    return out


def _movements(day: date, days: int) -> dict[str, int]:
    since = day - timedelta(days=days)
    return {
        "joiners": _count("Employee", {"date_of_joining": ["between", [since, day]]}),
        "leavers": _count("Employee", {"relieving_date": ["between", [since, day]]}),
    }


def _turnover(day: date, headcount: int) -> dict[str, Any]:
    m = _movements(day, 365)
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
    soon = day + timedelta(days=SOON_DAYS)
    manager = bool(set(frappe.get_roles()) & {"HR Manager", "System Manager"})
    active = frappe.get_all("Employee", filters={"status": "Active"}, fields=["name", "department", "designation", "reports_to", "leave_approver", "user_id"], limit=0)
    headcount = len(active)
    alerts = _open_alerts()

    items = []
    for rule, (one, many, href) in {
        "R-H2": ("1 contract ends within 60 days", "{n} contracts end within 60 days", "/hr/directory"),
        "R-H3": ("1 staff authorisation is expiring", "{n} staff authorisations are expiring", "/hr/competence"),
        "R-H4": ("1 competence has thin cover", "{n} competences have thin cover", "/hr/competence"),
        "Late declaration": ("1 declaration unsigned after 10 days", "{n} declarations unsigned after 10 days", "/hr/competence"),
        "Document expiry": ("1 employee document is expiring", "{n} employee documents are expiring", "/hr/directory"),
    }.items():
        a = alerts.get(rule, {})
        items.append(attention(rule, a.get("count", 0), one, many, href, a.get("due"), "Acknowledge in Approvals once handled.", 2))
    probation = {"status": "Active", "scheduled_confirmation_date": ["<=", soon], "final_confirmation_date": ["in", ["", None]]}
    items.append(attention("probation", _count("Employee", probation), "1 probation review due", "{n} probation reviews due", "/hr/directory",
                           _earliest("Employee", probation, "scheduled_confirmation_date"), "The line manager records the outcome in My team.", 2))
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
                           "/approvals", _earliest("ToDo", overdue_leave, "date"), "Escalated to the HR Managers in Approvals (provisional 2-working-day SLA).", 2))
    items.append(attention("establishment", _count("Establishment Change", {"state": ["in", list(OPEN_STATES)]}), "1 establishment change waiting for a decision",
                           "{n} establishment changes waiting for a decision", "/hr/structure?tab=establishment"))
    cycles = _cycle_status(day)
    for c in cycles:
        end = _d(c["end_date"])
        left = c["people"] - c["manager_done"]
        if end and (end - day).days <= CYCLE_WARN_DAYS and left:
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
    items.append(attention("record_gaps", snap["counts"].get("people", 0), "1 employee record has gaps", "{n} employee records have gaps", "/hr/directory",
                           None, "Checked nightly. See Record quality for what is missing."))

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
        "movements": _movements(day, MOVEMENT_DAYS),
        "turnover": _turnover(day, headcount),
        "ending_soon": {
            "contracts": _count("Employee", {"status": "Active", "contract_end_date": ["between", [day, soon]]}),
            "probations": _count("Employee", probation),
        },
        "record_quality": integrity.quality(snap["counts"]),
        "record_checked_on": snap["ran_on"],
        "cycles": cycles,
    }


def board_pack_impl() -> dict[str, Any]:
    """H15: aggregates for the Council HR & Remuneration Committee. No names, pay or case details."""
    import frappe

    from eswasa_hr.establishment import OPEN_STATES, _changes, approved_posts, counts

    _require(BOARD_ROLES, "Board HR pack")
    day = _today()
    headcount = frappe.db.count("Employee", {"status": "Active"})
    est = counts() if approved_posts() else None
    cycles = _cycle_status(day - timedelta(days=90))
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
    active = frappe.get_all("Employee", filters={"status": "Active"}, fields=["reports_to", "leave_approver", "user_id"], limit=0)
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
            DONE if depts and headed == len(depts) else PARTIAL if depts else AWAITING,
            f"{len(depts)} departments, {headed} with a head." if depts else "ESWASA's department tree hasn't been loaded (ERPNext's sample departments are hidden).",
            "/hr/structure?tab=departments",
            None if depts else "H1, H2",
        ),
        step(
            "posts",
            "Posts and grades",
            DONE if plans and grades else PARTIAL if plans or grades else AWAITING,
            f"{plans} submitted staffing plans, {grades} grades.",
            "/hr/structure?tab=establishment",
            None if plans and grades else "§0.5 #2",
        ),
        step("holidays", "Holidays", DONE if holidays and company_holidays else PARTIAL if holidays else TODO,
             f"{holidays} holiday lists" + (", company default set." if company_holidays else ", no company default yet."), "holiday-list", desk=True),
        step("leave", "Leave policy", DONE if policies else PARTIAL if leave_types else AWAITING, f"{leave_types} leave types, {policies} submitted leave policies.",
             "leave-policy", None if policies else "§0.5 #4", desk=True),
        step("competence", "Competence catalogue", DONE if skills else AWAITING, f"{skills} competences in the catalogue.", "/hr/competence", None if skills else "§0.5 #8"),
        step("documents", "Required documents", DONE if required_docs else AWAITING,
             f"{required_docs} employment types list the documents staff must hold." if required_docs
             else "No employment type lists required documents yet. ESWASA HR says which documents each type needs and when they expire.",
             "employment-type", None if required_docs else "ESWASA HR", desk=True),
        step(
            "approvers",
            "Approvers and privacy",
            DONE if active and not no_manager and not no_approver and ed and levels else PARTIAL if levels or ed else TODO,
            f"{levels} protected Employee fields; Executive Director role {'assigned' if ed else 'not assigned'}; "
            f"{no_manager} people without a line manager, {no_approver} without a leave approver.",
            "/hr/directory",
            None if active else "§0.5 #10",
        ),
        _import_step(len(active), linked),
        step(
            "expenses",
            "Expense claims",
            DONE if expense_types else AWAITING,
            f"{expense_types} expense types; "
            + (f"receipts needed above {receipt_above:,.2f}." if receipt_above else "a receipt is needed on every line (no threshold set)."),
            "expense-claim-type",
            None if expense_types else "ESWASA Finance",
            desk=True,
        ),
        step("payroll", "Payroll scope", EXCLUDED, "Excluded until ESWASA decides whether payroll runs in EswasaOne.", None, "H15, H16"),
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
        {"done": DONE, "partial": PARTIAL}.get(state, PARTIAL if active else AWAITING),
        (f"{active} active employees, {linked} with a login. " if active else "") + detail,
        "/system-admin?tab=hr-setup#hr-import",
        None if active or state != "todo" else "§0.5 #3",
        desk=False,
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
