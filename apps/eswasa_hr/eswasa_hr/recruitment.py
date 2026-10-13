"""
Recruitment, part 1 (brief §3, §7, §7.1; journey J2): vacancy → requisition → approval → public opening →
online application.

- Only approved, vacant posts can be requisitioned (Staffing Plan − active employees − open requisitions).
- A requisition goes first to the head of its department, then to each HR Manager, in Approvals (brief §12.1,
  plan 08; named people, not a pool; never the requester). A requester who heads the department skips the head
  stage; a department with no head raises an HR Alert and goes straight to HR. The HR approver can't be the
  head who approved. HRMS ``status`` stays Pending through both stages; ``custom_stage`` says which.
- HR publishes an approved requisition as a Job Opening; open, published, unexpired openings are what
  the public careers page lists.
- Anyone can apply (guest methods). Applications become Job Applicants with status Open.

Field names follow HRMS version-16. Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from eswasa_hr import settings

REQ = "Job Requisition"
OPENING = "Job Opening"
APPLICANT = "Job Applicant"
HR_ROLES = ("HR Manager", "HR User", "System Manager")
STAGE_HEAD, STAGE_HR, STAGE_DONE = "Head", "HR", "Done"
STAGE_FIELD = "custom_stage"
RULE_NO_HEAD = "Department head"  # HR Alert rule
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------- pure rules


def vacant(approved: int, filled: int, open_requisitions: int) -> int:
    return max(0, int(approved or 0) - int(filled or 0) - int(open_requisitions or 0))


def requisition_title(designation: str, department: str | None) -> str:
    return f"Approve requisition: {designation}" + (f", {department}" if department else "")


def next_stage(stage: str | None, requester_is_head: bool = False) -> str:
    """None (new) → Head, or HR when the requester heads the department; Head → HR; HR → Done."""
    if not stage:
        return STAGE_HR if requester_is_head else STAGE_HEAD
    return STAGE_HR if stage == STAGE_HEAD else STAGE_DONE


def legacy_stage(status: str | None) -> str:
    """Rows from before the head stage: a Pending one stays with HR, anything decided is Done."""
    return STAGE_HR if (status or "Pending") == "Pending" else STAGE_DONE


def stage_decider_error(stage: str | None, user: str, roles: list[str], requester: str | None, head: str | None) -> str | None:
    """Head stage: only the department head. HR stage: an HR Manager who isn't the head (four-eyes). Never the requester."""
    if requester and user == requester:
        return "You can't approve a requisition you raised."
    if (stage or STAGE_HR) == STAGE_HEAD:
        return None if head and user == head else "Only the head of the department can approve this requisition at this stage."
    if not set(roles or ()) & {"HR Manager", "System Manager"}:
        return "Only an HR Manager can decide a requisition."
    if head and user == head:
        return "You approved this as head of department, so another HR Manager must approve it."
    return None


def no_head_title(department: str | None) -> str:
    return f"Set a head for {department or 'this department'}: a requisition skipped the head-of-department approval"


def opening_is_live(status: str | None, publish: Any, closes_on: Any, today: date) -> bool:
    if (status or "Open") != "Open" or not int(publish or 0):
        return False
    if closes_on in (None, ""):
        return True
    end = closes_on if isinstance(closes_on, date) else date.fromisoformat(str(closes_on)[:10])
    return end >= today


def application_errors(name: str, email: str, consent: bool, has_cv: bool) -> list[str]:
    errs: list[str] = []
    if len((name or "").strip()) < 3:
        errs.append("Enter your full name.")
    if not _EMAIL.match((email or "").strip()):
        errs.append("Enter an email address we can reply to.")
    if not has_cv:
        errs.append("Attach your CV.")
    if not consent:
        errs.append("Agree to ESWASA keeping your application to consider it.")
    return errs


def public_opening(row: dict[str, Any]) -> dict[str, Any]:
    """Only what the public may see. No pay unless the opening says to publish it."""
    out = {
        "id": row.get("name"),
        "job_title": row.get("job_title"),
        "department": row.get("department"),
        "designation": row.get("designation"),
        "location": row.get("location"),
        "employment_type": row.get("employment_type"),
        "description": row.get("description") or "",
        "posted_on": str(row.get("posted_on"))[:10] if row.get("posted_on") else None,
        "closes_on": str(row.get("closes_on"))[:10] if row.get("closes_on") else None,
    }
    if int(row.get("publish_salary_range") or 0):
        out["salary"] = {
            "lower": row.get("lower_range"),
            "upper": row.get("upper_range"),
            "currency": row.get("currency"),
            "per": row.get("salary_per") or "Month",
        }
    return out


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _is_hr() -> bool:
    import frappe

    return bool(set(frappe.get_roles()) & set(HR_ROLES))


def _company() -> str | None:
    import frappe

    return frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")


def _my_employee() -> dict[str, Any] | None:
    import frappe

    return frappe.db.get_value(
        "Employee",
        {"user_id": frappe.session.user, "status": "Active"},
        ["name", "employee_name", "department", "designation"],
        as_dict=True,
    )


def _hr_manager_users(exclude: str | None = None) -> list[str]:
    import frappe

    users = {
        r.get("parent")
        for r in frappe.get_all("Has Role", filters={"role": "HR Manager", "parenttype": "User"}, fields=["parent"], limit=0)
    }
    users.discard("Administrator")
    users.discard(exclude)
    enabled = {u.get("name") for u in frappe.get_all("User", filters={"name": ["in", list(users)], "enabled": 1}, fields=["name"], limit=0)} if users else set()
    return sorted(enabled)


def vacancies_impl() -> list[dict[str, Any]]:
    """Approved, unfrozen posts with a vacancy, per department and designation (submitted Staffing Plans)."""
    import frappe

    from eswasa_hr.establishment import approved_posts, post_counts

    out = []
    for (dept, desig), base in sorted(approved_posts().items(), key=lambda kv: (kv[0][0] or "", kv[0][1] or "")):
        filled = frappe.db.count("Employee", {"status": "Active", "department": dept, "designation": desig})
        open_reqs = frappe.db.count(REQ, {"department": dept, "designation": desig, "status": ["in", ["Pending", "Open & Approved", "On Hold"]]})
        p = post_counts(base["approved"], base["frozen"], filled, open_reqs)
        if p["vacant"] > 0:
            out.append({"department": dept, "designation": desig, "approved": p["approved"], "filled": filled, "in_recruitment": open_reqs, "vacant": p["vacant"]})
    return out


def _has_stage() -> bool:
    import frappe

    try:
        return bool(frappe.get_meta(REQ).has_field(STAGE_FIELD))
    except AttributeError:  # tests' stand-in frappe without get_meta
        return False


def _user_of(employee: str | None) -> str | None:
    import frappe

    return frappe.db.get_value("Employee", employee, "user_id") if employee else None


def _head_user(department: str | None) -> str | None:
    import frappe

    head = frappe.db.get_value("Department", department, "custom_head") if department else None
    return _user_of(head)


def _stage(doc: Any) -> str:
    return getattr(doc, STAGE_FIELD, None) or legacy_stage(doc.status)


def _route_requisition(doc: Any) -> None:
    """One ToDo per named approver for the current stage: the department head, or each HR Manager (never the
    requester, and at the HR stage never the head)."""
    import frappe
    from frappe.utils import add_days

    requester = _user_of(doc.requested_by)
    head = _head_user(doc.department)
    stage = _stage(doc) if _has_stage() else STAGE_HR
    if stage == STAGE_HEAD:
        users = [head] if head and head != requester else []
    elif stage == STAGE_HR:
        users = [u for u in _hr_manager_users(exclude=requester) if u != head]
    else:
        users = []
    for user in users:
        if frappe.db.exists("ToDo", {"reference_type": REQ, "reference_name": doc.name, "allocated_to": user, "status": "Open"}):
            continue
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": user,
                "description": requisition_title(doc.designation, doc.department),
                "reference_type": REQ,
                "reference_name": doc.name,
                "status": "Open",
                "priority": "Medium",
                "assigned_by": requester or frappe.session.user,
                "date": add_days(_today(), settings.get("decision_sla_days")),  # brief §12.1: 3 days
            }
        ).insert(ignore_permissions=True)


def _first_stage(department: str, requester: str | None) -> tuple[str, bool]:
    """(stage, no_head) for a new requisition."""
    head = _head_user(department)
    if not head:
        return STAGE_HR, True
    return next_stage(None, requester_is_head=head == requester), False


def _no_head_alert(doc: Any) -> None:
    import frappe

    from eswasa_hr.alerts import raise_alert

    doc.add_comment("Comment", f"No head is set for {doc.department}, so this requisition went straight to HR.")
    if frappe.db.exists("DocType", "HR Alert"):
        requester = _user_of(doc.requested_by)
        raise_alert(f"requisition-no-head:{doc.name}", RULE_NO_HEAD, no_head_title(doc.department), _hr_manager_users(exclude=requester),
                    _today().isoformat(), None, (REQ, doc.name))


def _close_todos(doctype: str, name: str) -> None:
    import frappe

    for row in frappe.get_all("ToDo", filters={"reference_type": doctype, "reference_name": name, "status": "Open"}, fields=["name"]):
        frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")


def raise_impl(designation: str, department: str, reason: str, description: str, expected_compensation: float, expected_by: str | None) -> dict[str, Any]:
    import frappe

    me = _my_employee()
    if not me:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    head = frappe.db.get_value("Department", department, "custom_head")
    if not (_is_hr() or head == me.name):
        frappe.throw("Only the head of the department or HR can raise a requisition.", frappe.PermissionError)
    post = next((v for v in vacancies_impl() if v["department"] == department and v["designation"] == designation), None)
    if not post:
        frappe.throw(
            f"There is no approved vacancy for {designation} in {department}. Request an establishment change first.",
            frappe.ValidationError,
        )
    if not (description or "").strip():
        frappe.throw("Describe the job: what the person will do and what they need.", frappe.ValidationError)
    stage, no_head = _first_stage(department, frappe.session.user) if _has_stage() else (None, False)
    doc = frappe.get_doc(
        {
            "doctype": REQ,
            **({STAGE_FIELD: stage} if stage else {}),
            "designation": designation,
            "department": department,
            "no_of_positions": 1,
            "expected_compensation": float(expected_compensation or 0),
            "company": _company(),
            "status": "Pending",
            "requested_by": me.name,
            "requested_by_name": me.employee_name,
            "requested_by_dept": me.department,
            "requested_by_designation": me.designation,
            "posting_date": _today().isoformat(),
            "expected_by": expected_by or None,
            "reason_for_requesting": (reason or "").strip(),
            "description": description.strip(),
        }
    )
    doc.insert()
    if no_head:
        _no_head_alert(doc)
    _route_requisition(doc)
    return requisition_row(doc.name)


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler for Job Requisition: the department head, then an HR Manager (never the requester,
    and never the head twice). Approving at the head stage moves it to HR; at the HR stage it is approved."""
    import frappe

    doc = frappe.get_doc(REQ, name)
    staged = _has_stage()
    stage = _stage(doc) if staged else STAGE_HR
    err = stage_decider_error(stage, frappe.session.user, list(frappe.get_roles()), _user_of(doc.requested_by), _head_user(getattr(doc, "department", None)))
    if err:
        frappe.throw(err, frappe.PermissionError)
    if doc.status != "Pending" or stage == STAGE_DONE:
        frappe.throw(f"This requisition was already decided ({doc.status}).", frappe.ValidationError)
    key = (action or "").strip().lower()
    note = (comment or "").strip()
    moved_to_hr = False
    if key == "approve":
        if stage == STAGE_HEAD:
            moved_to_hr = True
        else:
            doc.status = "Open & Approved"
    elif key in ("reject", "return"):
        if not note:
            frappe.throw("Say why, so the head of department can respond." if stage == STAGE_HR else "Say why, so the requester can respond.", frappe.ValidationError)
        doc.status = "Rejected" if key == "reject" else "On Hold"
    else:
        frappe.throw("A requisition can be approved, put on hold or rejected.", frappe.ValidationError)
    if staged:
        setattr(doc, STAGE_FIELD, next_stage(stage) if moved_to_hr else STAGE_DONE)
    doc.save()
    if moved_to_hr:
        doc.add_comment("Comment", f"Approved by the head of department ({frappe.session.user})" + (f": {note}" if note else ""))
    elif note:
        doc.add_comment("Comment", note)
    _close_todos(REQ, name)
    if moved_to_hr:
        _route_requisition(doc)
        return {"ok": True, "doctype": REQ, "name": name, "action": action, "workflow_action": None, "status": doc.status,
                "message": f"Requisition approved by the head of department and sent to HR: {doc.designation}"}
    return {"ok": True, "doctype": REQ, "name": name, "action": action, "workflow_action": None, "status": doc.status,
            "message": f"Requisition {doc.status.lower()}: {doc.designation}"}


def requisition_row(name: str) -> dict[str, Any]:
    import frappe

    r = frappe.get_doc(REQ, name)
    opening = frappe.db.get_value(OPENING, {"job_requisition": name}, ["name", "status", "publish", "closes_on"], as_dict=True)
    counts: dict[str, int] = {}
    if opening:
        for a in frappe.get_all(APPLICANT, filters={"job_title": opening.name}, fields=["status"], limit=0):
            counts[a.get("status") or "Open"] = counts.get(a.get("status") or "Open", 0) + 1
    return {
        "id": r.name,
        "designation": r.designation,
        "department": r.department,
        "status": r.status,
        "requested_by": r.requested_by_name or r.requested_by,
        "posting_date": str(r.posting_date) if r.posting_date else None,
        "expected_by": str(r.expected_by) if r.expected_by else None,
        "opening": {
            "id": opening.name,
            "status": opening.status,
            "published": bool(opening.publish),
            "closes_on": str(opening.closes_on) if opening.closes_on else None,
        }
        if opening
        else None,
        "applicants": counts,
        "stage": (getattr(r, STAGE_FIELD, None) or legacy_stage(r.status)) if r.status == "Pending" else None,
        "waiting_on": _waiting_on(name) if r.status == "Pending" else None,
    }


def _waiting_on(name: str) -> str | None:
    """The named people whose Approvals card is open, by full name (never a role)."""
    import frappe

    users = sorted({t["allocated_to"] for t in frappe.get_all("ToDo", filters={"reference_type": REQ, "reference_name": name, "status": "Open"},
                                                              fields=["allocated_to"], limit=0) if t.get("allocated_to")})
    names = [frappe.db.get_value("User", u, "full_name") or u for u in users]
    return ", ".join(names) or None


def requisition_impl(name: str) -> dict[str, Any]:
    """One requisition with its stage and who it waits on: HR, the department head or the requester."""
    import frappe

    if not frappe.db.exists(REQ, name):
        frappe.throw("Requisition not found.", frappe.DoesNotExistError)
    r = frappe.db.get_value(REQ, name, ["requested_by", "department"], as_dict=True)
    me = frappe.session.user
    if not (_is_hr() or me in (_user_of(r.get("requested_by")), _head_user(r.get("department")))):
        frappe.throw("Only HR, the head of the department or the requester can see this requisition.", frappe.PermissionError)
    return requisition_row(name)


def requisitions_impl() -> list[dict[str, Any]]:
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can see all requisitions.", frappe.PermissionError)
    names = [r.get("name") for r in frappe.get_all(REQ, filters={"status": ["!=", "Cancelled"]}, fields=["name"], order_by="posting_date desc", limit=100)]
    return [requisition_row(n) for n in names]


def publish_impl(requisition: str, closes_on: str, job_title: str | None = None, location: str | None = None) -> dict[str, Any]:
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can publish an opening.", frappe.PermissionError)
    r = frappe.get_doc(REQ, requisition)
    if r.status != "Open & Approved":
        frappe.throw("Only an approved requisition can be advertised.", frappe.ValidationError)
    if frappe.db.exists(OPENING, {"job_requisition": requisition}):
        frappe.throw("This requisition is already advertised.", frappe.ValidationError)
    end = date.fromisoformat(str(closes_on)[:10])
    if end < _today():
        frappe.throw("The closing date is in the past.", frappe.ValidationError)
    doc = frappe.get_doc(
        {
            "doctype": OPENING,
            "job_title": (job_title or r.designation).strip(),
            "company": r.company,
            "designation": r.designation,
            "department": r.department,
            "job_requisition": r.name,
            "planned_vacancies": r.no_of_positions,
            "vacancies": r.no_of_positions,
            "status": "Open",
            "publish": 1,
            "prevent_duplicate_applicant": 1,
            "closes_on": end.isoformat(),
            "location": location or None,
            "description": r.description,
        }
    )
    doc.insert()
    return requisition_row(requisition)


def public_openings_impl() -> list[dict[str, Any]]:
    import frappe

    rows = frappe.get_all(
        OPENING,
        filters={"status": "Open", "publish": 1},
        fields=["name", "job_title", "department", "designation", "location", "employment_type", "description",
                "posted_on", "closes_on", "publish_salary_range", "lower_range", "upper_range", "currency", "salary_per"],
        order_by="posted_on desc",
        limit=50,
    )  # get_all ignores permissions: guests may read published openings only, filtered here
    today = _today()
    contact = settings.get("hr_email")  # HR Settings: where applicants write to HR
    return [{**public_opening(r), "contact_email": contact} for r in rows if opening_is_live(r.get("status", "Open"), 1, r.get("closes_on"), today)]


def public_opening_impl(opening: str) -> dict[str, Any]:
    match = [o for o in public_openings_impl() if o["id"] == opening]
    if not match:
        import frappe

        frappe.throw("This vacancy is closed or doesn't exist.", frappe.DoesNotExistError)
    return match[0]


def apply_impl(opening: str, applicant_name: str, email: str, phone: str | None, cover_letter: str | None, cv_link: str | None, consent: bool) -> dict[str, Any]:
    import frappe

    job = public_opening_impl(opening)  # throws when closed or unpublished
    errs = application_errors(applicant_name, email, consent, bool(cv_link))
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    email = email.strip().lower()
    if frappe.db.exists(APPLICANT, {"job_title": opening, "email_id": email}):
        frappe.throw("We already have an application from this email address for this vacancy.", frappe.ValidationError)
    doc = frappe.get_doc(
        {
            "doctype": APPLICANT,
            "applicant_name": applicant_name.strip(),
            "email_id": email,
            "phone_number": (phone or "").strip() or None,
            "job_title": opening,
            "designation": job.get("designation"),
            "status": "Open",
            "source": "Website Listing" if frappe.db.exists("Job Applicant Source", "Website Listing") else None,
            "cover_letter": (cover_letter or "").strip() or None,
            "resume_link": cv_link,
            "notes": "Applied online. Consent to keep the application given.",
        }
    )
    doc.insert(ignore_permissions=True)
    from eswasa_hr import notify

    notify.queue(f"applied:{doc.name}", [], "application_received",
                 {"applicant_name": doc.applicant_name, "job_title": job.get("job_title"), "reference": doc.name}, to_address=email)
    return {"reference": doc.name, "job_title": job.get("job_title"), "closes_on": job.get("closes_on")}


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(**kw):
    def deco(fn):
        try:
            import frappe

            return frappe.whitelist(**kw)(fn)
        except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
            return fn

    return deco


def _confirm(confirm: Any) -> None:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)


@_whitelist()
def vacancies() -> list[dict[str, Any]]:
    return vacancies_impl()


@_whitelist()
def requisitions() -> list[dict[str, Any]]:
    return requisitions_impl()


@_whitelist()
def requisition(name: str) -> dict[str, Any]:
    return requisition_impl(name)


@_whitelist()
def raise_requisition(designation: str, department: str, description: str = "", reason: str = "", expected_compensation: Any = 0, expected_by: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return raise_impl(designation, department, reason, description, float(expected_compensation or 0), expected_by)


@_whitelist()
def publish(requisition: str, closes_on: str, job_title: str | None = None, location: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return publish_impl(requisition, closes_on, job_title, location)


@_whitelist(allow_guest=True)
def public_openings() -> list[dict[str, Any]]:
    return public_openings_impl()


@_whitelist(allow_guest=True)
def public_opening_detail(opening: str) -> dict[str, Any]:
    return public_opening_impl(opening)


@_whitelist(allow_guest=True, methods=["POST"])
def apply(opening: str, applicant_name: str, email: str, phone: str | None = None, cover_letter: str | None = None, cv_link: str | None = None, consent: Any = False) -> dict[str, Any]:
    from frappe.utils import cint

    return apply_impl(opening, applicant_name, email, phone, cover_letter, cv_link, bool(cint(consent)))
