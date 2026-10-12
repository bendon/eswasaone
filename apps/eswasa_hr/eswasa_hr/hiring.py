"""
Recruitment, part 2 (brief §7; journey J2): shortlist → interview → feedback → offer → answer → employee.

- HR moves an applicant between Open, Shortlisted, Hold and Rejected (process steps, not approvals).
- An interview has named interviewers; each gets one ToDo to record feedback (Interview Feedback, ratings 1–5).
  HR then marks the interview Cleared or Rejected, which submits it.
- HR prepares a Job Offer as a draft. Each HR Manager except the preparer gets an approval ToDo
  (``eswasa_approval_handlers``); approving submits it (status Awaiting Response). HRMS's own validation
  refuses offers beyond the Staffing Plan vacancies and duplicates.
- HR records the candidate's answer. On Accepted, HR creates the Employee through HRMS's ``make_employee``.

Field names follow HRMS version-16. Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any

APPLICANT = "Job Applicant"
INTERVIEW = "Interview"
FEEDBACK = "Interview Feedback"
OFFER = "Job Offer"
HR_ROLES = ("HR Manager", "HR User", "System Manager")
HR_STATUSES = ("Open", "Shortlisted", "Hold", "Rejected")


# ---------------------------------------------------------------- pure rules


def stage(status: str | None, has_interview: bool, offer_status: str | None, has_employee: bool) -> str:
    """Pipeline column for an applicant."""
    if has_employee:
        return "Hired"
    if offer_status and offer_status not in ("Rejected", "Cancelled"):
        return "Offer"
    if (status or "") == "Rejected":
        return "Not taken forward"
    if has_interview:
        return "Interview"
    if (status or "") in ("Shortlisted", "Accepted"):
        return "Shortlist"
    return "Applied"


def status_change_error(current: str | None, target: str, note: str | None) -> str | None:
    if target not in HR_STATUSES:
        return "Choose Shortlist, Hold or Not taken forward."
    if current == "Accepted":
        return "This applicant accepted an offer; their status is final."
    if target == "Rejected" and not (note or "").strip():
        return "Note why they're not taken forward. It stays on the record (not sent to the applicant)."
    return None


def rating_to_frappe(stars: int) -> float:
    """HRMS Rating fields store a 0–1 fraction; the UI uses 1–5 stars."""
    s = int(stars)
    if s < 1 or s > 5:
        raise ValueError("Ratings are 1 to 5.")
    return round(s / 5, 2)


def rating_to_stars(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return round(float(value) * 5, 1)


def offer_title(applicant_name: str, designation: str) -> str:
    return f"Approve offer: {applicant_name}, {designation}"


def interview_todo_title(applicant_name: str, scheduled_on: str, from_time: str) -> str:
    return f"Interview {applicant_name} on {scheduled_on} at {str(from_time)[:5]}, then record your feedback"


FEEDBACK_DAYS = 1  # working days after the interview (brief §7, provisional)
OFFER_WAIT_DAYS = 5  # working days an offer may wait for the candidate's answer (provisional)
REMINDER_RULE = "Recruitment reminder"
OPEN_INTERVIEW = ("Pending", "Under Review")


def feedback_title(applicant_name: str, scheduled_on: Any) -> str:
    return f"Interview feedback overdue: record yours for {applicant_name} (interviewed {str(scheduled_on)[:10]})"


def offer_wait_title(applicant_name: str, offer_date: Any) -> str:
    return f"No answer to the offer to {applicant_name} since {str(offer_date)[:10]}. Follow up with the candidate"


def missing_feedback(panel: list[str], given: list[str]) -> list[str]:
    """Panel members who haven't submitted feedback, in panel order."""
    done = set(given)
    return [u for u in dict.fromkeys(panel) if u and u not in done]


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


def _hr_managers(exclude: str | None) -> list[str]:
    from eswasa_hr.recruitment import _hr_manager_users

    return _hr_manager_users(exclude=exclude)


def _todo(user: str, title: str, doctype: str, name: str, due: Any) -> None:
    import frappe

    if frappe.db.exists("ToDo", {"reference_type": doctype, "reference_name": name, "allocated_to": user, "status": "Open"}):
        return
    frappe.get_doc(
        {
            "doctype": "ToDo",
            "allocated_to": user,
            "description": title,
            "reference_type": doctype,
            "reference_name": name,
            "status": "Open",
            "priority": "Medium",
            "assigned_by": frappe.session.user,
            "date": due,
        }
    ).insert(ignore_permissions=True)


def _close(doctype: str, name: str, user: str | None = None) -> None:
    import frappe

    f: dict[str, Any] = {"reference_type": doctype, "reference_name": name, "status": "Open"}
    if user:
        f["allocated_to"] = user
    for row in frappe.get_all("ToDo", filters=f, fields=["name"]):
        frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")


def _offer_for(applicant: str) -> dict[str, Any] | None:
    import frappe

    rows = frappe.get_all(
        OFFER,
        filters={"job_applicant": applicant, "docstatus": ["<", 2]},
        fields=["name", "status", "docstatus", "offer_date", "designation", "owner"],
        order_by="creation desc",
        limit=1,
    )
    if not rows:
        return None
    o = dict(rows[0])
    o["employee"] = frappe.db.get_value("Employee", {"job_offer": o["name"]}, "name")
    o["state"] = "Draft, waiting for approval" if int(o.get("docstatus") or 0) == 0 else (o.get("status") or "Awaiting Response")
    return o


def pipeline_impl(opening: str) -> dict[str, Any]:
    import frappe

    _require_hr()
    job = frappe.db.get_value("Job Opening", opening, ["name", "job_title", "designation", "department", "closes_on", "status"], as_dict=True)
    if not job:
        frappe.throw("Opening not found.", frappe.DoesNotExistError)
    rows = frappe.get_all(
        APPLICANT,
        filters={"job_title": opening},
        fields=["name", "applicant_name", "status", "creation", "source"],
        order_by="creation asc",
        limit=0,
    )
    out = []
    for r in rows:
        interviews = frappe.get_all(INTERVIEW, filters={"job_applicant": r["name"], "docstatus": ["<", 2]}, fields=["name", "status"], limit=0)
        offer = _offer_for(r["name"])
        out.append(
            {
                "id": r["name"],
                "applicant_name": r["applicant_name"],
                "status": r["status"],
                "applied_on": str(r["creation"])[:10],
                "source": r.get("source"),
                "stage": stage(r["status"], bool(interviews), offer and offer.get("status"), bool(offer and offer.get("employee"))),
                "interview_status": interviews[-1]["status"] if interviews else None,
                "offer_state": offer["state"] if offer else None,
            }
        )
    return {
        "opening": {k: (str(v) if k == "closes_on" and v else v) for k, v in dict(job).items()},
        "applicants": out,
    }


def applicant_impl(name: str) -> dict[str, Any]:
    import frappe

    _require_hr()
    a = frappe.get_doc(APPLICANT, name)
    interviews = []
    for i in frappe.get_all(
        INTERVIEW,
        filters={"job_applicant": name, "docstatus": ["<", 2]},
        fields=["name", "status", "scheduled_on", "from_time", "to_time", "interview_type", "average_rating"],
        order_by="scheduled_on asc",
        limit=0,
    ):
        panel = [d.get("interviewer") for d in frappe.get_all("Interview Detail", filters={"parent": i["name"]}, fields=["interviewer"], limit=0)]
        fbs = [
            {
                "interviewer": frappe.db.get_value("User", f["interviewer"], "full_name") or f["interviewer"],
                "result": f["result"],
                "rating": rating_to_stars(f.get("average_rating")),
                "feedback": f.get("feedback"),
            }
            for f in frappe.get_all(FEEDBACK, filters={"interview": i["name"], "docstatus": 1}, fields=["interviewer", "result", "average_rating", "feedback"], limit=0)
        ]
        interviews.append(
            {
                "id": i["name"],
                "status": i["status"],
                "scheduled_on": str(i["scheduled_on"]) if i.get("scheduled_on") else None,
                "from_time": str(i["from_time"])[:5] if i.get("from_time") else None,
                "to_time": str(i["to_time"])[:5] if i.get("to_time") else None,
                "interview_type": i.get("interview_type"),
                "panel": [frappe.db.get_value("User", u, "full_name") or u for u in panel],
                "feedback": fbs,
                "waiting_for": len(panel) - len(fbs),
                "average_rating": rating_to_stars(i.get("average_rating")),
            }
        )
    offer = _offer_for(name)
    opening = frappe.db.get_value("Job Opening", a.job_title, ["name", "job_title", "designation", "department"], as_dict=True) if a.job_title else None
    return {
        "id": a.name,
        "applicant_name": a.applicant_name,
        "email": a.email_id,
        "phone": a.phone_number,
        "status": a.status,
        "cover_letter": a.cover_letter,
        "has_cv": bool(a.resume_link or a.resume_attachment),
        "source": a.source,
        "applied_on": str(a.creation)[:10],
        "opening": dict(opening) if opening else None,
        "interviews": interviews,
        "offer": {k: (str(v) if k == "offer_date" and v else v) for k, v in offer.items() if k != "owner"} if offer else None,
        "stage": stage(a.status, bool(interviews), offer and offer.get("status"), bool(offer and offer.get("employee"))),
    }


def cv_link_impl(name: str) -> str | None:
    import frappe

    _require_hr()
    a = frappe.db.get_value(APPLICANT, name, ["resume_link", "resume_attachment"], as_dict=True)
    return (a.resume_link or a.resume_attachment) if a else None


def set_status_impl(name: str, status: str, note: str | None) -> dict[str, Any]:
    import frappe

    _require_hr()
    a = frappe.get_doc(APPLICANT, name)
    err = status_change_error(a.status, status, note)
    if err:
        frappe.throw(err, frappe.ValidationError)
    a.status = status
    a.save()
    if (note or "").strip():
        a.add_comment("Comment", note.strip())
    return applicant_impl(name)


def interview_types_impl() -> list[str]:
    import frappe

    _require_hr()
    return [r.get("name") for r in frappe.get_all("Interview Type", fields=["name"], order_by="name asc", limit=0)]


def schedule_impl(applicant: str, interview_type: str, scheduled_on: str, from_time: str, to_time: str, interviewers: list[str]) -> dict[str, Any]:
    import frappe

    _require_hr()
    a = frappe.get_doc(APPLICANT, applicant)
    if a.status not in ("Shortlisted",):
        frappe.throw("Shortlist the applicant before scheduling an interview.", frappe.ValidationError)
    panel = [u for u in dict.fromkeys(interviewers or []) if u]
    if not panel:
        frappe.throw("Add at least one interviewer.", frappe.ValidationError)
    if str(to_time) <= str(from_time):
        frappe.throw("The interview must end after it starts.", frappe.ValidationError)
    doc = frappe.get_doc(
        {
            "doctype": INTERVIEW,
            "job_applicant": applicant,
            "job_opening": a.job_title,
            "designation": a.designation,
            "interview_type": interview_type,
            "scheduled_on": scheduled_on,
            "from_time": from_time,
            "to_time": to_time,
            "status": "Pending",
            "resume_link": a.resume_link,
            "interview_details": [{"interviewer": u} for u in panel],
        }
    )
    doc.insert()
    for u in panel:
        _todo(u, interview_todo_title(a.applicant_name, scheduled_on, from_time), INTERVIEW, doc.name, scheduled_on)
    return applicant_impl(applicant)


def my_interviews_impl() -> list[dict[str, Any]]:
    """Interviews where the caller is on the panel and hasn't given feedback yet."""
    import frappe

    me = frappe.session.user
    parents = {r.get("parent") for r in frappe.get_all("Interview Detail", filters={"interviewer": me, "parenttype": INTERVIEW}, fields=["parent"], limit=0)}
    out = []
    for name in sorted(parents):
        i = frappe.db.get_value(INTERVIEW, name, ["name", "job_applicant", "scheduled_on", "from_time", "status", "interview_type", "docstatus"], as_dict=True)
        if not i or int(i.docstatus or 0) == 2 or i.status in ("Cleared", "Rejected", "Cancelled"):
            continue
        if frappe.db.exists(FEEDBACK, {"interview": name, "interviewer": me, "docstatus": 1}):
            continue
        a = frappe.db.get_value(APPLICANT, i.job_applicant, ["applicant_name", "job_title", "designation"], as_dict=True) or {}
        skills = [r.get("skill") for r in frappe.get_all("Expected Skill Set", filters={"parent": i.interview_type}, fields=["skill"], limit=0)] if i.interview_type else []
        out.append(
            {
                "id": i.name,
                "applicant_name": a.get("applicant_name"),
                "designation": a.get("designation"),
                "scheduled_on": str(i.scheduled_on) if i.scheduled_on else None,
                "from_time": str(i.from_time)[:5] if i.from_time else None,
                "interview_type": i.interview_type,
                "skills": skills,
            }
        )
    return out


def feedback_impl(interview: str, result: str, ratings: list[dict[str, Any]], feedback: str | None) -> dict[str, Any]:
    import frappe

    me = frappe.session.user
    i = frappe.get_doc(INTERVIEW, interview)
    if me not in [d.interviewer for d in (i.get("interview_details") or [])]:
        frappe.throw("Only someone on the interview panel can record feedback.", frappe.PermissionError)
    if frappe.db.exists(FEEDBACK, {"interview": interview, "interviewer": me, "docstatus": 1}):
        frappe.throw("You already recorded feedback for this interview.", frappe.ValidationError)
    if result not in ("Cleared", "Rejected"):
        frappe.throw("Say whether the candidate cleared this interview.", frappe.ValidationError)
    try:
        rows = [{"skill": r["skill"], "rating": rating_to_frappe(r["stars"])} for r in (ratings or [])]
    except (KeyError, ValueError) as exc:
        frappe.throw(f"Rate every skill from 1 to 5. ({exc})", frappe.ValidationError)
    if not rows:
        frappe.throw("Rate at least one skill.", frappe.ValidationError)
    fb = frappe.get_doc(
        {
            "doctype": FEEDBACK,
            "interview": interview,
            "interview_type": i.interview_type,
            "job_applicant": i.job_applicant,
            "interviewer": me,
            "result": result,
            "skill_assessment": rows,
            "feedback": (feedback or "").strip(),
        }
    )
    fb.insert()
    fb.submit()
    _close(INTERVIEW, interview, me)
    if i.status == "Pending":
        i.db_set("status", "Under Review")
    return {"interview": interview, "result": result}


def interview_result_impl(interview: str, status: str) -> dict[str, Any]:
    import frappe

    _require_hr()
    if status not in ("Cleared", "Rejected"):
        frappe.throw("An interview ends Cleared or Rejected.", frappe.ValidationError)
    i = frappe.get_doc(INTERVIEW, interview)
    if int(i.docstatus or 0) != 0:
        frappe.throw("This interview's result is already recorded.", frappe.ValidationError)
    i.status = status
    i.save()
    i.submit()
    _close(INTERVIEW, interview)
    return applicant_impl(i.job_applicant)


def make_offer_impl(applicant: str, offer_date: str, terms: str | None) -> dict[str, Any]:
    import frappe

    _require_hr()
    a = frappe.get_doc(APPLICANT, applicant)
    cleared = frappe.db.exists(INTERVIEW, {"job_applicant": applicant, "status": "Cleared", "docstatus": 1})
    if not cleared:
        frappe.throw("An offer needs a cleared interview first.", frappe.ValidationError)
    designation = a.designation or frappe.db.get_value("Job Opening", a.job_title, "designation")
    company = frappe.db.get_value("Job Opening", a.job_title, "company")
    doc = frappe.get_doc(
        {
            "doctype": OFFER,
            "job_applicant": applicant,
            "applicant_name": a.applicant_name,
            "applicant_email": a.email_id,
            "offer_date": offer_date,
            "designation": designation,
            "company": company,
            "status": "Awaiting Response",
            "terms": (terms or "").strip() or None,
        }
    )
    doc.insert()  # HRMS validates Staffing Plan vacancies and duplicate offers here
    for user in _hr_managers(exclude=frappe.session.user):
        _todo(user, offer_title(a.applicant_name, designation), OFFER, doc.name, offer_date)
    return applicant_impl(applicant)


def decide_offer(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler for Job Offer: an HR Manager who didn't prepare it approves (submits) or returns it."""
    import frappe

    o = frappe.get_doc(OFFER, name)
    if not set(frappe.get_roles()) & {"HR Manager", "System Manager"}:
        frappe.throw("Only an HR Manager can approve an offer.", frappe.PermissionError)
    if o.owner == frappe.session.user:
        frappe.throw("You prepared this offer, so someone else must approve it.", frappe.PermissionError)
    if int(o.docstatus or 0) != 0:
        frappe.throw("This offer was already decided.", frappe.ValidationError)
    key = (action or "").strip().lower()
    note = (comment or "").strip()
    if key == "approve":
        o.submit()
        state = "Approved"
        email = getattr(o, "applicant_email", None)
        if email:
            from eswasa_hr import notify

            notify.queue(f"offer-sent:{name}", [], "offer_sent", {"applicant_name": o.applicant_name, "designation": o.designation}, to_address=email)
    elif key in ("reject", "return"):
        if not note:
            frappe.throw("Say what to change in the offer.", frappe.ValidationError)
        o.add_comment("Comment", f"Sent back: {note}")
        state = "Sent back"
    else:
        frappe.throw("An offer can be approved or sent back.", frappe.ValidationError)
    _close(OFFER, name)
    return {"ok": True, "doctype": OFFER, "name": name, "action": action, "workflow_action": None, "status": state,
            "message": f"Offer {state.lower()}: {o.applicant_name}"}


def remind_due() -> int:
    """Daily: interview feedback 1 working day late goes to each panel member; an offer waiting more than
    5 working days goes to the HR person who prepared it. Each is raised once (the key carries the due date)."""
    import frappe
    from frappe.utils import getdate

    from eswasa_hr.alerts import raise_alert, recipients
    from eswasa_hr.workdays import add_working_days, holidays

    if not frappe.db.exists("DocType", "HR Alert"):
        return 0
    day = getdate(_today())
    off = holidays()
    n = 0
    for i in frappe.get_all(INTERVIEW, filters={"docstatus": 0, "status": ["in", list(OPEN_INTERVIEW)], "scheduled_on": ["<", day]},
                            fields=["name", "job_applicant", "scheduled_on"], limit=0):
        due = add_working_days(getdate(i["scheduled_on"]), FEEDBACK_DAYS, off)
        if due > day:
            continue
        panel = [d.get("interviewer") for d in frappe.get_all("Interview Detail", filters={"parent": i["name"], "parenttype": INTERVIEW}, fields=["interviewer"], limit=0)]
        given = [f.get("interviewer") for f in frappe.get_all(FEEDBACK, filters={"interview": i["name"], "docstatus": 1}, fields=["interviewer"], limit=0)]
        name = frappe.db.get_value(APPLICANT, i["job_applicant"], "applicant_name") or i["job_applicant"]
        for user in recipients(missing_feedback(panel, given)):
            n += raise_alert(f"interview-feedback:{i['name']}:{user}:{due.isoformat()}", REMINDER_RULE, feedback_title(name, i["scheduled_on"]),
                             [user], due.isoformat(), None, (INTERVIEW, i["name"]))
    for o in frappe.get_all(OFFER, filters={"docstatus": 1, "status": "Awaiting Response"}, fields=["name", "applicant_name", "offer_date", "owner"], limit=0):
        if not o.get("offer_date"):
            continue
        due = add_working_days(getdate(o["offer_date"]), OFFER_WAIT_DAYS, off)
        users = recipients(o.get("owner")) or recipients(_hr_managers(None))
        if due < day and users:
            n += raise_alert(f"offer-waiting:{o['name']}:{due.isoformat()}", REMINDER_RULE, offer_wait_title(o.get("applicant_name") or o["name"], o["offer_date"]),
                             users, due.isoformat(), None, (OFFER, o["name"]))
    return n


def answer_impl(offer: str, answer: str) -> dict[str, Any]:
    import frappe

    _require_hr()
    o = frappe.get_doc(OFFER, offer)
    if int(o.docstatus or 0) != 1:
        frappe.throw("The offer must be approved before the candidate can answer.", frappe.ValidationError)
    if o.status != "Awaiting Response":
        frappe.throw(f"The candidate already answered ({o.status}).", frappe.ValidationError)
    if answer not in ("Accepted", "Rejected"):
        frappe.throw("The answer is Accepted or Rejected.", frappe.ValidationError)
    o.db_set("status", answer)
    o.run_method("on_change")  # HRMS keeps the Job Applicant status in step
    return applicant_impl(o.job_applicant)


def create_employee_impl(offer: str, date_of_joining: str, gender: str, date_of_birth: str, department: str | None, reports_to: str | None) -> dict[str, Any]:
    import frappe
    from hrms.hr.doctype.job_offer.job_offer import make_employee

    _require_hr()
    o = frappe.get_doc(OFFER, offer)
    if o.status != "Accepted":
        frappe.throw("Create the employee once the candidate has accepted.", frappe.ValidationError)
    if frappe.db.exists("Employee", {"job_offer": offer}):
        frappe.throw("An employee already exists for this offer.", frappe.ValidationError)
    emp = make_employee(offer)
    parts = (o.applicant_name or "").split()
    emp.first_name = parts[0] if parts else o.applicant_name
    emp.last_name = " ".join(parts[1:]) or None
    emp.gender = gender
    emp.date_of_birth = date_of_birth
    emp.date_of_joining = date_of_joining
    emp.company = o.company
    emp.designation = o.designation
    emp.department = department or frappe.db.get_value("Job Opening", frappe.db.get_value(APPLICANT, o.job_applicant, "job_title"), "department")
    emp.reports_to = reports_to or None
    if reports_to:
        approver = frappe.db.get_value("Employee", reports_to, "user_id")
        emp.leave_approver = approver
        emp.expense_approver = approver
    emp.status = "Active"
    emp.insert()
    return {"employee": emp.name, "employee_name": emp.employee_name}


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
    import frappe

    return frappe.parse_json(v) if isinstance(v, str) else v


@_whitelist
def pipeline(opening: str) -> dict[str, Any]:
    return pipeline_impl(opening)


@_whitelist
def applicant(name: str) -> dict[str, Any]:
    return applicant_impl(name)


@_whitelist
def cv_link(name: str) -> str | None:
    return cv_link_impl(name)


@_whitelist
def set_status(name: str, status: str, note: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return set_status_impl(name, status, note)


@_whitelist
def interview_types() -> list[str]:
    return interview_types_impl()


@_whitelist
def schedule(applicant: str, interview_type: str, scheduled_on: str, from_time: str, to_time: str, interviewers: Any = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return schedule_impl(applicant, interview_type, scheduled_on, from_time, to_time, _json(interviewers) or [])


@_whitelist
def my_interviews() -> list[dict[str, Any]]:
    return my_interviews_impl()


@_whitelist
def feedback(interview: str, result: str, ratings: Any = None, feedback: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return feedback_impl(interview, result, _json(ratings) or [], feedback)


@_whitelist
def interview_result(interview: str, status: str, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return interview_result_impl(interview, status)


@_whitelist
def make_offer(applicant: str, offer_date: str, terms: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return make_offer_impl(applicant, offer_date, terms)


@_whitelist
def answer(offer: str, answer: str, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return answer_impl(offer, answer)


@_whitelist
def create_employee(offer: str, date_of_joining: str, gender: str, date_of_birth: str, department: str | None = None, reports_to: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return create_employee_impl(offer, date_of_joining, gender, date_of_birth, department, reports_to)
