"""
Onboarding (brief §4; journey J2 end, screens H7 and E10).

HR starts an Employee Onboarding from the accepted Job Offer, or (plan 08) for any Active employee hired
before go-live or outside Recruitment, with a checklist where every activity has a
named owner (HR, ICT, Finance, the line manager, the new joiner) — never a role pool. Submitting it makes
HRMS create the Project and one Task per activity, assigned to its owner (a ToDo in their Approvals).
Owners mark their task done here or from Approvals (``eswasa_approval_handlers`` for Task); when every task
is done, onboarding is Completed. The new joiner's impartiality and confidentiality declaration (slice 2a)
is part of their checklist and completes itself when they sign.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any

ONBOARDING = "Employee Onboarding"
SEPARATION = "Employee Separation"  # offboarding uses the same checklist machinery
HR_ROLES = ("HR Manager", "HR User", "System Manager")
DECLARATION_ACTIVITY = "Sign the impartiality and confidentiality declaration"

# (owner kind, activity). Owners: hr = whoever starts it, manager = the line manager, joiner = the new
# employee, pick = HR chooses (ICT, Finance). A checklist, not policy; HR can change every row.
DEFAULT_ACTIVITIES: list[tuple[str, str, str]] = [
    ("hr", "Contract signed and filed", "HR"),
    ("hr", "Required documents on file: ID, qualifications, police clearance", "HR"),
    ("pick", "Email address and EswasaOne login", "ICT"),
    ("pick", "Laptop and access card", "ICT"),
    ("pick", "Bank details captured for payroll", "Finance"),
    ("manager", "Welcome meeting and first-week plan", "Line manager"),
    ("manager", "Choose a buddy for the first month", "Line manager"),
    ("joiner", DECLARATION_ACTIVITY, "New joiner"),
    ("joiner", "Complete the induction course", "New joiner"),
]


# ---------------------------------------------------------------- pure rules


def default_checklist(hr_user: str | None, manager_user: str | None, joiner_user: str | None) -> list[dict[str, Any]]:
    owners = {"hr": hr_user, "manager": manager_user, "joiner": joiner_user, "pick": None}
    return [{"activity_name": name, "group": group, "user": owners[kind]} for kind, name, group in DEFAULT_ACTIVITIES]


def checklist_errors(rows: list[dict[str, Any]]) -> list[str]:
    errs = []
    if not rows:
        errs.append("Add at least one activity.")
    for i, r in enumerate(rows, start=1):
        if not str(r.get("activity_name") or "").strip():
            errs.append(f"Activity {i} needs a name.")
        elif not r.get("user"):
            errs.append(f"Choose who does “{r['activity_name']}”.")
    return errs


def filled_checklist(rows: list[dict[str, Any]], starter: str | None) -> list[dict[str, Any]]:
    """The default checklist with no owner left blank: rows HR would pick (ICT, Finance) go to the HR person
    starting it, who can reassign the task. Named people only, never a pool."""
    return [{**r, "user": r.get("user") or starter} for r in rows]


def duplicate_error(active: bool) -> str | None:
    return "Onboarding has already started for this employee." if active else None


def progress(statuses: list[str]) -> tuple[int, int]:
    done = sum(1 for s in statuses if s in ("Completed", "Cancelled"))
    return done, len(statuses)


# ---------------------------------------------------------------- Frappe glue


def _today() -> str:
    from frappe.utils import nowdate

    return nowdate()


def _is_hr() -> bool:
    import frappe

    return bool(set(frappe.get_roles()) & set(HR_ROLES))


def _require_hr() -> None:
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can do this.", frappe.PermissionError)


def _user_name(user: str | None) -> str | None:
    import frappe

    return (frappe.db.get_value("User", user, "full_name") or user) if user else None


def defaults_impl(employee: str) -> dict[str, Any]:
    import frappe

    _require_hr()
    e = frappe.db.get_value("Employee", employee, ["name", "employee_name", "user_id", "reports_to", "job_offer", "date_of_joining"], as_dict=True)
    if not e:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    manager_user = frappe.db.get_value("Employee", e.reports_to, "user_id") if e.reports_to else None
    rows = default_checklist(frappe.session.user, manager_user, e.user_id)
    return {
        "employee": e.name,
        "employee_name": e.employee_name,
        "date_of_joining": str(e.date_of_joining) if e.date_of_joining else None,
        "job_offer": e.job_offer,
        "has_login": bool(e.user_id),
        "activities": [{**r, "user_name": _user_name(r["user"])} for r in rows],
    }


def _active_onboarding(employee: str, job_offer: str | None) -> bool:
    import frappe

    if job_offer and frappe.db.exists(ONBOARDING, {"job_offer": job_offer, "docstatus": ["<", 2]}):
        return True
    return bool(frappe.db.exists(ONBOARDING, {"employee": employee, "docstatus": ["<", 2], "boarding_status": ["not in", ["Completed"]]}))


def _applicant_required() -> bool:
    """Read from the installed HRMS (versions differ): is Employee Onboarding.job_applicant mandatory?"""
    import frappe

    field = frappe.get_meta(ONBOARDING).get_field("job_applicant")
    return bool(field and int(getattr(field, "reqd", 0) or 0))


def _direct_applicant(e: Any) -> str:
    """A minimal Job Applicant flagged ``custom_source = "Direct"``, only when the installed HRMS needs one."""
    import frappe

    email = e.get("company_email") or e.get("personal_email") or e.get("user_id")
    if not email:
        frappe.throw(f"Add an email address for {e.employee_name} first: HRMS needs one to start onboarding.", frappe.ValidationError)
    existing = frappe.db.get_value("Job Applicant", {"email_id": email, "custom_source": "Direct"}, "name")
    if existing:
        return existing
    doc = frappe.get_doc({"doctype": "Job Applicant", "applicant_name": e.employee_name, "email_id": email, "status": "Accepted",
                          "designation": e.get("designation"), "custom_source": "Direct"})
    doc.insert(ignore_permissions=True)
    return doc.name


def start_impl(employee: str, activities: list[dict[str, Any]], boarding_begins_on: str | None) -> dict[str, Any]:
    """From the accepted offer when there is one; otherwise for the existing employee (plan 08). Without
    activities, the default checklist is used with every row owned by a named person."""
    import frappe

    _require_hr()
    e = frappe.get_doc("Employee", employee)
    if e.get("status") and e.status != "Active":
        frappe.throw("Only an active employee can be onboarded.", frappe.ValidationError)
    err = duplicate_error(_active_onboarding(e.name, e.get("job_offer")))
    if err:
        frappe.throw(err, frappe.ValidationError)
    if activities:
        rows = [{"activity_name": str(a.get("activity_name") or "").strip(), "user": a.get("user"), "description": a.get("description")} for a in activities]
    else:
        manager_user = frappe.db.get_value("Employee", e.reports_to, "user_id") if e.get("reports_to") else None
        rows = filled_checklist(default_checklist(frappe.session.user, manager_user, e.get("user_id")), frappe.session.user)
        rows = [{"activity_name": r["activity_name"], "user": r["user"], "description": None} for r in rows]
    errs = checklist_errors(rows)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    if e.get("job_offer"):
        source = {"job_offer": e.job_offer, "job_applicant": frappe.db.get_value("Job Offer", e.job_offer, "job_applicant")}
    else:
        source = {"job_applicant": _direct_applicant(e)} if _applicant_required() else {}
    doc = frappe.get_doc(
        {
            "doctype": ONBOARDING,
            **source,
            "employee": e.name,
            "employee_name": e.employee_name,
            "date_of_joining": e.date_of_joining,
            "boarding_begins_on": boarding_begins_on or _today(),
            "company": e.company,
            "department": e.department,
            "designation": e.designation,
            "holiday_list": e.holiday_list,
            "boarding_status": "Pending",
            "activities": [{**r, "duration": 5, "begin_on": 0} for r in rows],
        }
    )
    doc.insert()
    doc.submit()  # HRMS creates the Project and one Task per activity, assigned to its user
    return detail_impl(doc.name)


def _tasks(project: str | None) -> dict[str, dict[str, Any]]:
    import frappe

    if not project:
        return {}
    return {t["name"]: t for t in frappe.get_all("Task", filters={"project": project}, fields=["name", "subject", "status"], limit=0)}


def _signed_declaration(employee: str) -> bool:
    import frappe

    from eswasa_hr.declarations import declaration_year
    from frappe.utils import getdate

    return bool(frappe.db.exists("Impartiality Declaration", {"employee": employee, "year": declaration_year(getdate(_today())), "docstatus": 1}))


def detail_impl(name: str, doctype: str = ONBOARDING) -> dict[str, Any]:
    import frappe

    o = frappe.get_doc(doctype, name)
    person_user = frappe.db.get_value("Employee", o.employee, "user_id") if o.employee else None
    if not (_is_hr() or frappe.session.user == person_user):
        frappe.throw("Only HR and the person themselves can see this checklist.", frappe.PermissionError)
    tasks = _tasks(o.project)
    declared = _signed_declaration(o.employee) if o.employee else False
    acts = []
    for a in o.get("activities") or []:
        status = (tasks.get(a.task) or {}).get("status") or "Open"
        if a.activity_name == DECLARATION_ACTIVITY and declared:
            status = "Completed"
        acts.append(
            {
                "activity_name": a.activity_name,
                "user": a.user,
                "user_name": _user_name(a.user),
                "task": a.task,
                "status": status,
                "mine": a.user == frappe.session.user,
            }
        )
    done, total = progress([a["status"] for a in acts])
    last_day = frappe.db.get_value("Employee", o.employee, "relieving_date") if doctype == SEPARATION and o.employee else None
    return {
        "id": o.name,
        "kind": "offboarding" if doctype == SEPARATION else "onboarding",
        "employee": o.employee,
        "employee_name": o.employee_name,
        "designation": o.designation,
        "department": o.department,
        "date_of_joining": str(o.get("date_of_joining")) if o.get("date_of_joining") else None,
        "last_day": str(last_day) if last_day else None,
        "reason": o.get("custom_reason"),
        "boarding_status": o.boarding_status,
        "done": done,
        "total": total,
        "activities": acts,
    }


def list_impl() -> list[dict[str, Any]]:
    import frappe

    _require_hr()
    rows = frappe.get_all(ONBOARDING, filters={"docstatus": 1}, fields=["name"], order_by="date_of_joining desc", limit=50)
    out = []
    for r in rows:
        d = detail_impl(r["name"])
        out.append({k: d[k] for k in ("id", "employee", "employee_name", "designation", "department", "date_of_joining", "boarding_status", "done", "total")})
    return out


def _boarding_of_task(task: str) -> tuple[str, str] | None:
    """(doctype, name) of the onboarding or separation whose project holds this task."""
    import frappe

    project = frappe.db.get_value("Task", task, "project")
    if not project:
        return None
    for dt in (ONBOARDING, SEPARATION):
        name = frappe.db.get_value(dt, {"project": project, "docstatus": 1}, "name")
        if name:
            return dt, name
    return None


def _onboarding_of_task(task: str) -> str | None:
    hit = _boarding_of_task(task)
    return hit[1] if hit else None


def complete_task_impl(task: str) -> dict[str, Any]:
    import frappe

    hit = _boarding_of_task(task)
    if not hit:
        frappe.throw("This task isn't part of an onboarding or offboarding.", frappe.ValidationError)
    doctype, onboarding = hit
    owner = frappe.db.get_value("Employee Boarding Activity", {"parent": onboarding, "task": task}, "user")
    if not (_is_hr() or owner == frappe.session.user):
        frappe.throw("Only the task's owner or HR can mark it done.", frappe.PermissionError)
    t = frappe.get_doc("Task", task)
    if t.status not in ("Completed", "Cancelled"):
        t.status = "Completed"
        t.flags.ignore_permissions = True  # owner may not have Project rights; the check above stands in
        t.save()
    for row in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": task, "status": "Open"}, fields=["name"]):
        frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")
    o = frappe.get_doc(doctype, onboarding)
    statuses = [s for s in (_tasks(o.project).get(a.task, {}).get("status") for a in o.get("activities") or []) if s]
    done, total = progress(statuses)
    if total and done == total and o.boarding_status != "Completed":
        o.db_set("boarding_status", "Completed")
    elif done and o.boarding_status == "Pending":
        o.db_set("boarding_status", "In Process")
    try:
        return detail_impl(onboarding, doctype)
    except frappe.PermissionError:  # an ICT or Finance owner sees their task, not the whole onboarding
        return {"task": task, "status": "Completed"}


def decide_task(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler for Task: an onboarding task is marked done; any other Task just closes its ToDos,
    which is what Approvals did for Tasks before this hook."""
    import frappe

    if _boarding_of_task(name):
        complete_task_impl(name)
        message = "Boarding task done"
    else:
        for row in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": name, "status": "Open"}, fields=["name"]):
            frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")
        message = "Task acknowledged"
    return {"ok": True, "doctype": "Task", "name": name, "action": action, "workflow_action": None, "status": None, "message": message}


def my_onboarding_impl() -> dict[str, Any] | None:
    import frappe

    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not emp:
        return None
    name = frappe.db.get_value(ONBOARDING, {"employee": emp, "docstatus": 1, "boarding_status": ["not in", ["Completed"]]}, "name")
    if not name:
        return None
    d = detail_impl(name)
    manager = frappe.db.get_value("Employee", frappe.db.get_value("Employee", emp, "reports_to"), "employee_name") if frappe.db.get_value("Employee", emp, "reports_to") else None
    return {**d, "line_manager": manager}


def on_declaration_signed(employee: str) -> None:
    """Called when a declaration is submitted: tick the joiner's onboarding task, if any."""
    import frappe

    name = frappe.db.get_value(ONBOARDING, {"employee": employee, "docstatus": 1, "boarding_status": ["not in", ["Completed"]]}, "name")
    if not name:
        return
    task = frappe.db.get_value("Employee Boarding Activity", {"parent": name, "activity_name": DECLARATION_ACTIVITY}, "task")
    if task and frappe.db.get_value("Task", task, "status") not in ("Completed", "Cancelled"):
        t = frappe.get_doc("Task", task)
        t.status = "Completed"
        t.flags.ignore_permissions = True
        t.save()
        for row in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": task, "status": "Open"}, fields=["name"]):
            frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")


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
def defaults(employee: str) -> dict[str, Any]:
    return defaults_impl(employee)


@_whitelist
def start(employee: str, activities: Any = None, boarding_begins_on: str | None = None, confirm: Any = False, start_date: str | None = None) -> dict[str, Any]:
    import frappe

    _confirm(confirm)
    rows = frappe.parse_json(activities) if isinstance(activities, str) else (activities or [])
    return start_impl(employee, rows, boarding_begins_on or start_date)


@_whitelist
def onboardings() -> list[dict[str, Any]]:
    return list_impl()


@_whitelist
def detail(name: str) -> dict[str, Any]:
    return detail_impl(name)


@_whitelist
def complete_task(task: str, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return complete_task_impl(task)


@_whitelist
def my_onboarding() -> dict[str, Any] | None:
    return my_onboarding_impl()
