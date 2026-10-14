"""Demo people: three staff hired through the whole HR journey, for exploring the portal. DEMO SITES ONLY.

Runs after every ``bench migrate`` (``setup.after_migrate``) on a site whose ``site_config.json`` has
``"eswasa_demo_seed": 1`` and an ``"eswasa_demo_password"``; on any other site it does nothing. By hand:

    bench --site <site> execute eswasa_hr.demo_seed.run

It adds the three existing staff the journey needs (two HR Managers and the head of Certification) and three
joiners. Each joiner goes through the real steps, each called as the person who would do it: requisition raised
by HR, approved by the head and then the other HR Manager, advertised, applied for, shortlisted, interviewed with
panel feedback, offered (prepared by one HR Manager, approved by the other), accepted, made an employee and
onboarded, with every checklist task ticked by its owner. Dates are then moved back so each hire has a believable
history (joined about three months, two months and three weeks ago).

Every login uses ``eswasa_demo_password`` and has the emailed sign-in code switched off (``User.custom_otp_enabled``)
so a demo needs no mailbox. Work addresses use ``eswasa_demo_mail_domain`` (default ``eswasa.demo``, which can't
receive mail) and personal ones ``example.com``, so nothing reaches a real person. The people and their details
are made up. They are not marked ``custom_is_demo``: that would hide them from headcount and the HR lists.

Running it again resumes where it stopped and leaves finished steps alone. A step this site can't support (no
vacancy, no onboarding template, no Leave Period, …) is recorded under ``skipped`` with the reason. What was made
is written to ``sites/<site>/private/hr_demo_seed.json``. Never set the flag on production.
"""

from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta
from typing import Any, Callable

FLAG = "eswasa_demo_seed"
PASSWORD = "eswasa_demo_password"
MAIL_DOMAIN = "eswasa_demo_mail_domain"
DEFAULT_DOMAIN = "eswasa.demo"
PERSONAL_DOMAIN = "example.com"  # reserved (RFC 2606): never a real mailbox
DECLARATION_ACTIVITY = "Sign the impartiality and confidentiality declaration"

# Existing staff who run the journey. Joined years ago; created directly, as an HR import would.
STAFF: dict[str, dict[str, Any]] = {
    "hr_lead": {
        "first": "Nomvula", "last": "Dlamini", "gender": "Female", "dob": "1984-03-17", "joined": "2016-02-01",
        "department": "Human Resources", "designation": "Human Resources Manager",
        "roles": ["HR Manager", "HR User", "Employee"], "boss": None,
        "marital": "Married", "phone": "+268 7612 4471", "address": "Plot 88, Coates Valley, Manzini",
        "home": "Ka-Khoza, Manzini", "kin": ("Themba Dlamini", "Spouse", "+268 7604 2219"),
        "bank": ("Standard Bank Eswatini", "9110 4482 3371"),
    },
    "hr_second": {
        "first": "Sandile", "last": "Motsa", "gender": "Male", "dob": "1989-09-05", "joined": "2019-07-15",
        "department": "Human Resources", "designation": "Senior Human Resources Officer",
        "roles": ["HR Manager", "HR User", "Interviewer", "Employee"], "boss": "hr_lead",
        "marital": "Single", "phone": "+268 7688 1352", "address": "Flat 4, Mhlambanyatsi Road, Mbabane",
        "home": "Ezulwini, Hhohho", "kin": ("Gugu Motsa", "Mother", "+268 7615 9030"),
        "bank": ("FNB Eswatini", "6233 0917 554"),
    },
    "cert_head": {
        "first": "Mduduzi", "last": "Nxumalo", "gender": "Male", "dob": "1980-11-22", "joined": "2013-05-02",
        "department": "Certification", "designation": "Certification Manager",
        "roles": ["Interviewer", "Employee"], "boss": None,
        "marital": "Married", "phone": "+268 7622 7045", "address": "House 12, Thembelihle, Mbabane",
        "home": "Siteki, Lubombo", "kin": ("Zanele Nxumalo", "Spouse", "+268 7630 5582"),
        "bank": ("Nedbank Eswatini", "0204 7716 2093"),
    },
}

# Joiners, hired through Recruitment into approved vacancies. ``joined_days_ago`` sets the whole timeline.
HIRES: list[dict[str, Any]] = [
    {
        "key": "lindiwe", "first": "Lindiwe", "last": "Mamba", "gender": "Female", "dob": "1994-06-12",
        "department": "Certification", "designation": "Certification Officer", "joined_days_ago": 95,
        "monthly_pay": 21500, "reason": "Workload increase",
        "description": (
            "Process product and system certification applications from receipt to decision: check applications "
            "are complete, plan audits with the Lead Auditor, keep client files and follow up corrective actions. "
            "Needs a degree in a science or engineering field, two years in quality or conformity assessment, and "
            "working knowledge of ISO/IEC 17065."
        ),
        "cover": "I have spent three years in quality assurance at a food processor in Matsapha and would like to bring "
                 "that experience to product certification.",
        "marital": "Single", "phone": "+268 7645 2208", "address": "Plot 214, Fairview North, Manzini",
        "home": "Nhlangano, Shiselweni", "kin": ("Sibongile Mamba", "Mother", "+268 7690 1147"),
        "bank": ("Standard Bank Eswatini", "9110 7735 0482"),
        "medical": ("Swazimed", "SWM-448210", "Essential", 1), "dependants": [],
        "education": [("University of Eswatini", "BSc Chemistry", "Graduate", 2016)],
        "history": [("Matsapha Food Processors (Pty) Ltd", "Quality Assurance Officer", "3 years")],
    },
    {
        "key": "sibusiso", "first": "Sibusiso", "last": "Maseko", "gender": "Male", "dob": "1987-01-28",
        "department": "Certification", "designation": "Lead Auditor", "joined_days_ago": 60,
        "monthly_pay": 32800, "reason": "Replacement",
        "description": (
            "Lead management system audits against ISO 9001, ISO 22000 and ISO 14001: plan the audit, lead the team "
            "on site, write the report and recommend the certification decision. Needs a registered lead auditor "
            "qualification in at least two standards and five years of third-party auditing."
        ),
        "cover": "I am an IRCA-registered lead auditor with seven years of third-party audits across Southern Africa.",
        "marital": "Married", "phone": "+268 7671 9364", "address": "House 31, Sidwashini, Mbabane",
        "home": "Piggs Peak, Hhohho", "kin": ("Nonhlanhla Maseko", "Spouse", "+268 7683 4410"),
        "bank": ("FNB Eswatini", "6233 5520 819"),
        "medical": ("Medsas", "MDS-102274", "Comprehensive", 1),
        "dependants": [
            ("Nonhlanhla Maseko", "Spouse", "1990-04-09", "9004090144087", 1, 60, "+268 7683 4410"),
            ("Lwazi Maseko", "Child", "2016-08-21", "1608210512083", 1, 40, None),
        ],
        "education": [("University of Eswatini", "BEng Electrical Engineering", "Graduate", 2010),
                      ("University of Johannesburg", "Postgraduate Diploma in Quality Management", "Post Graduate", 2014)],
        "history": [("Southern Certification Services", "Lead Auditor", "4 years"),
                    ("Mbabane Engineering Works", "Quality Engineer", "3 years")],
    },
    {
        "key": "phumzile", "first": "Phumzile", "last": "Hlophe", "gender": "Female", "dob": "1991-10-03",
        "department": "Certification", "designation": "Technical Reviewer", "joined_days_ago": 21,
        "monthly_pay": 26400, "reason": "New service line",
        "description": (
            "Review completed audit files before the certification decision: check that evidence supports every "
            "finding, that the audit team was competent for the scope, and that the report is complete. Needs a "
            "degree, auditor training in ISO 9001 or ISO 22000, and an eye for detail."
        ),
        "cover": "After four years as a laboratory analyst I trained as an auditor and want to move into technical review.",
        "marital": "Married", "phone": "+268 7659 0813", "address": "Unit 7, Riverstone Village, Matsapha",
        "home": "Mankayane, Manzini", "kin": ("Bheki Hlophe", "Spouse", "+268 7617 3328"),
        "bank": ("Eswatini Bank", "2201 0398 1166"),
        "medical": ("Swazimed", "SWM-551903", "Family", 1),
        "dependants": [("Bheki Hlophe", "Spouse", "1988-02-14", "8802140233081", 1, 100, "+268 7617 3328")],
        "education": [("University of Eswatini", "BSc Biological Sciences", "Graduate", 2013)],
        "history": [("Eswatini Water Laboratories", "Laboratory Analyst", "4 years")],
    },
]

INTERVIEW_TYPE = "Panel interview"
INTERVIEW_SKILLS = ("Technical knowledge", "Communication", "Judgement")


# ---------------------------------------------------------------- pure (tested without Frappe)

def refusal(conf: dict[str, Any]) -> str | None:
    if not conf.get(FLAG):
        return f"Demo sites only: set \"{FLAG}\": 1 in this site's site_config.json to seed the demo people."
    if not conf.get(PASSWORD):
        return f"Set \"{PASSWORD}\" in site_config.json: the demo logins need a password."
    domain = conf.get(MAIL_DOMAIN) or DEFAULT_DOMAIN
    if "@" in domain or "." not in domain:
        return f"\"{MAIL_DOMAIN}\" must be a bare domain such as {DEFAULT_DOMAIN}."
    return None


def work_email(first: str, last: str, domain: str | None = None) -> str:
    return f"{first}.{last}@{domain or DEFAULT_DOMAIN}".lower()


def personal_email(first: str, last: str) -> str:
    return f"{first}.{last}@{PERSONAL_DOMAIN}".lower()


def timeline(today: date, joined_days_ago: int) -> dict[str, date]:
    """Every date in one hire's journey, counted back from the day they joined."""
    j = today - timedelta(days=joined_days_ago)
    return {
        "raised": j - timedelta(days=56),
        "posted": j - timedelta(days=52),
        "applied": j - timedelta(days=46),
        "closes": j - timedelta(days=38),
        "interview": j - timedelta(days=33),
        "offer": j - timedelta(days=28),
        "boarding": j - timedelta(days=7),
        "joined": j,
        "signed": j + timedelta(days=1),
        "probation_ends": _add_months(j, 6),
        "settled": min(j + timedelta(days=10), today),  # last onboarding task done
    }


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y, m = d.year + m // 12, m % 12 + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(y, m, day)
        except ValueError:
            continue
    return date(y, m, 28)


def task_done_on(t: dict[str, date], i: int, n: int) -> date:
    """Spread the onboarding tasks from the boarding start to ``settled``, in checklist order."""
    span = (t["settled"] - t["boarding"]).days
    return t["boarding"] + timedelta(days=round(span * (i + 1) / max(n, 1)))


def prorated_leave(days_per_year: float, start: date, period_start: date, period_end: date) -> float:
    """Leave earned from ``start`` (or the period start) to the period end, to the half day."""
    begin = max(start, period_start)
    total = (period_end - period_start).days + 1
    left = max((period_end - begin).days + 1, 0)
    return round(days_per_year * left / total * 2) / 2 if total > 0 else 0.0


def block(out: dict[str, Any], name: str, fn: Callable[[], Any]) -> Any:
    """Run one seed block; record its result, or why it was skipped."""
    try:
        value = fn()
    except Exception as exc:  # noqa: BLE001 - every failure becomes a skip reason
        out["skipped"][name] = f"{type(exc).__name__}: {exc}"[:400]
        return None
    if value is None:
        out["skipped"].setdefault(name, "not available on this site")
    else:
        out[name] = value
    return value


# ---------------------------------------------------------------- Frappe glue

def _guarded(name: str, fn: Callable[[], Any]) -> Callable[[], Any]:
    """Run ``fn`` inside a savepoint so a failing block leaves no half-made records."""
    def run() -> Any:
        import frappe

        frappe.db.savepoint(name)
        try:
            return fn()
        except Exception:
            try:
                frappe.db.rollback(save_point=name)
            except Exception:  # noqa: BLE001 - something inside committed; the next run resumes from there
                pass
            raise
    return run


def _as(user: str, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Call ``fn`` as ``user``, so ToDos, owners and the business rules (head first, never the requester, another
    HR Manager approves the offer) are theirs. DocType permissions are lifted: this site's role setup isn't what the
    demo is about, and a missing permission would stop the seed halfway."""
    import frappe

    prev, lifted = frappe.session.user, frappe.flags.ignore_permissions
    frappe.set_user(user)
    frappe.flags.ignore_permissions = True
    try:
        return fn(*args, **kwargs)
    finally:
        frappe.flags.ignore_permissions = lifted
        frappe.set_user(prev)


def _set(doctype: str, name: str, values: dict[str, Any]) -> None:
    """set_value for the fields this site has; skips the rest."""
    import frappe

    meta = frappe.get_meta(doctype)
    have = {k: v for k, v in values.items() if meta.has_field(k)}
    if have:
        frappe.db.set_value(doctype, name, have, update_modified=False)


def _company() -> str:
    import frappe

    company = frappe.defaults.get_global_default("company") or frappe.db.get_value("Company", {}, "name")
    if not company:
        frappe.throw("No Company on this site.")
    return company


def _department(stem: str, company: str) -> str:
    import frappe

    name = frappe.db.get_value("Department", {"department_name": stem, "company": company, "is_group": 0}, "name")
    if name:
        if frappe.db.get_value("Department", name, "disabled"):
            frappe.db.set_value("Department", name, "disabled", 0)
        return name
    root = frappe.db.get_value("Department", {"is_group": 1, "company": company}, "name") or frappe.db.get_value(
        "Department", {"is_group": 1}, "name")
    return frappe.get_doc({"doctype": "Department", "department_name": stem, "company": company,
                           "parent_department": root}).insert(ignore_permissions=True).name


def _designation(name: str) -> str:
    import frappe

    if not frappe.db.exists("Designation", name):
        frappe.get_doc({"doctype": "Designation", "designation_name": name}).insert(ignore_permissions=True)
    return name


def _grade() -> str | None:
    """The grade most active staff already have; the record check counts a missing grade as a gap."""
    import frappe

    rows = frappe.get_all("Employee", filters={"status": "Active", "grade": ["is", "set"]}, fields=["grade"], limit=0)
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["grade"]] = counts.get(r["grade"], 0) + 1
    if counts:
        return max(counts, key=lambda g: counts[g])
    return frappe.db.get_value("Employee Grade", {}, "name") if frappe.db.exists("DocType", "Employee Grade") else None


def _employment_type() -> str | None:
    import frappe

    for t in ("Full-time", "Permanent"):
        if frappe.db.exists("Employment Type", t):
            return t
    return None


def _user(email: str, first: str, last: str, roles: list[str], password: str) -> str:
    import frappe
    from frappe.utils.password import update_password

    if frappe.db.exists("User", email):
        user = frappe.get_doc("User", email)
    else:
        user = frappe.get_doc({"doctype": "User", "email": email, "first_name": first, "last_name": last,
                               "user_type": "System User", "send_welcome_email": 0, "enabled": 1})
        user.flags.no_welcome_mail = True
        user.insert(ignore_permissions=True)
    user.enabled = 1
    have = {r.role for r in user.roles}
    user.extend("roles", [{"role": r} for r in roles if r not in have and frappe.db.exists("Role", r)])
    if frappe.get_meta("User").has_field("custom_otp_enabled"):
        user.custom_otp_enabled = 0  # Core skips the emailed sign-in code for this login
    user.save(ignore_permissions=True)
    update_password(email, password)
    return email


def _profile(employee: str, p: dict[str, Any]) -> None:
    """Personal, bank, family and history details, the way HR would have captured them."""
    import frappe

    kin_name, kin_rel, kin_phone = p["kin"]
    bank, account = p["bank"]
    _set("Employee", employee, {k: v for k, v in {
        "marital_status": p["marital"],
        "cell_number": p["phone"],
        "personal_email": personal_email(p["first"], p["last"]),
        "current_address": p["address"],
        "current_accommodation_type": "Rented",
        "permanent_address": p["home"],
        "permanent_accommodation_type": "Owned",
        "person_to_be_contacted": kin_name,
        "relation": kin_rel,
        "emergency_phone_number": kin_phone,
        "salary_mode": "Bank",
        "salary_currency": "SZL" if frappe.db.exists("Currency", "SZL") else None,
        "bank_name": bank,
        "bank_ac_no": account,
        "ctc": (p.get("monthly_pay") or 0) * 12 or None,
    }.items() if v is not None})
    doc = frappe.get_doc("Employee", employee)
    meta = frappe.get_meta("Employee")
    changed = False
    if p.get("medical") and meta.has_field("custom_medical_aid_scheme"):
        scheme, number, plan, main = p["medical"]
        doc.custom_medical_aid_scheme, doc.custom_medical_aid_number = scheme, number
        doc.custom_medical_aid_plan, doc.custom_medical_aid_main_member = plan, main
        changed = True
    if p.get("dependants") and meta.has_field("custom_dependants") and not doc.get("custom_dependants"):
        for full_name, rel, dob, id_no, on_aid, share, phone in p["dependants"]:
            doc.append("custom_dependants", {"full_name": full_name, "relationship": rel, "date_of_birth": dob,
                                             "id_number": id_no, "on_medical_aid": on_aid, "beneficiary_share": share,
                                             "phone": phone})
        changed = True
    if p.get("education") and meta.has_field("education") and not doc.get("education"):
        for school, qualification, level, year in p["education"]:
            doc.append("education", {"school_univ": school, "qualification": qualification, "level": level,
                                     "year_of_passing": year})
        changed = True
    if p.get("history") and meta.has_field("external_work_history") and not doc.get("external_work_history"):
        for company, designation, years in p["history"]:
            doc.append("external_work_history", {"company_name": company, "designation": designation,
                                                 "total_experience": years})
        changed = True
    if changed:
        doc.flags.ignore_permissions = True
        doc.flags.ignore_mandatory = True
        doc.save()


def _staff(out: dict[str, Any], conf: dict[str, Any]) -> dict[str, Any]:
    """The HR Managers and the head of Certification, with logins. Managers first."""
    import frappe

    company, domain = _company(), conf.get(MAIL_DOMAIN) or DEFAULT_DOMAIN
    out["company"] = company
    grade, holidays, etype = _grade(), frappe.db.get_value("Company", company, "default_holiday_list"), _employment_type()
    cast: dict[str, Any] = {}
    for key in sorted(STAFF, key=lambda k: STAFF[k]["boss"] is not None):
        p = STAFF[key]
        email = _user(work_email(p["first"], p["last"], domain), p["first"], p["last"], p["roles"], conf[PASSWORD])
        dept = _department(p["department"], company)
        boss = cast[p["boss"]] if p["boss"] else None
        emp = frappe.db.get_value("Employee", {"user_id": email}, "name")
        if not emp:
            joined = date.fromisoformat(p["joined"])
            emp = frappe.get_doc({
                "doctype": "Employee", "first_name": p["first"], "last_name": p["last"], "gender": p["gender"],
                "date_of_birth": p["dob"], "date_of_joining": p["joined"], "status": "Active", "company": company,
                "department": dept, "designation": _designation(p["designation"]), "grade": grade,
                "holiday_list": holidays, "employment_type": etype, "user_id": email, "company_email": email,
                "prefered_contact_email": "Company Email", "reports_to": boss["employee"] if boss else None,
                "final_confirmation_date": _add_months(joined, 6).isoformat(),
            }).insert(ignore_permissions=True).name
            _profile(emp, p)
        cast[key] = {"user": email, "employee": emp, "name": f"{p['first']} {p['last']}", "department": dept}
    # Leave and expenses go to the line manager; those at the top go to the HR lead (never themselves).
    for key, c in cast.items():
        boss = STAFF[key]["boss"]
        approver = cast[boss]["user"] if boss else (cast["hr_second"]["user"] if key == "hr_lead" else cast["hr_lead"]["user"])
        frappe.db.set_value("Employee", c["employee"], {"leave_approver": approver, "expense_approver": approver})
    head = cast["cert_head"]
    current = frappe.db.get_value("Department", head["department"], "custom_head")
    if not current or not frappe.db.get_value("Employee", current, "user_id"):
        frappe.db.set_value("Department", head["department"], "custom_head", head["employee"])
    else:
        out["kept_existing_head"] = {"department": head["department"], "head": current}
    hr_dept = cast["hr_lead"]["department"]
    if not frappe.db.get_value("Department", hr_dept, "custom_head"):
        frappe.db.set_value("Department", hr_dept, "custom_head", cast["hr_lead"]["employee"])
    from eswasa_hr import scope

    scope.release_deciders()  # set_value skips hooks: heads and approvers must still see what they decide
    return cast


def _interview_setup() -> tuple[str, list[str]]:
    """An interview type with skills to rate: the first HR set up, else a panel interview."""
    import frappe

    for row in frappe.get_all("Interview Type", fields=["name"], order_by="creation asc", limit=0):
        skills = [r["skill"] for r in frappe.get_all("Expected Skill Set", filters={"parent": row["name"]}, fields=["skill"], limit=0)]
        if skills:
            return row["name"], skills
    for s in INTERVIEW_SKILLS:
        if not frappe.db.exists("Skill", s):
            frappe.get_doc({"doctype": "Skill", "skill_name": s}).insert(ignore_permissions=True)
    if not frappe.db.exists("Interview Type", INTERVIEW_TYPE):
        frappe.get_doc({"doctype": "Interview Type", "name": INTERVIEW_TYPE,
                        "description": "Head of department and HR, structured questions on the job description.",
                        "expected_skill_set": [{"skill": s} for s in INTERVIEW_SKILLS]}).insert(ignore_permissions=True)
    return INTERVIEW_TYPE, list(INTERVIEW_SKILLS)


def _hire(h: dict[str, Any], cast: dict[str, Any], conf: dict[str, Any], today: date) -> dict[str, Any]:
    import frappe

    from eswasa_hr import hiring, onboarding, recruitment

    hr, hr2 = cast["hr_lead"]["user"], cast["hr_second"]["user"]
    company = _company()
    dept = _department(h["department"], company)
    t = timeline(today, h["joined_days_ago"])
    full = f"{h['first']} {h['last']}"
    email = personal_email(h["first"], h["last"])
    login = work_email(h["first"], h["last"], conf.get(MAIL_DOMAIN))
    steps: list[str] = []

    # 1. Requisition, raised by HR (or found again on a re-run).
    app = frappe.db.get_value("Job Applicant", {"email_id": email}, ["name", "job_title"], as_dict=True)
    req = frappe.db.get_value("Job Opening", app.job_title, "job_requisition") if app and app.job_title else None
    req = req or frappe.db.get_value(recruitment.REQ, {"designation": h["designation"], "department": dept,
                                                        "requested_by": cast["hr_lead"]["employee"],
                                                        "status": ["!=", "Rejected"]}, "name")
    if not req:
        _as(hr, recruitment.raise_impl, h["designation"], dept, h["reason"], h["description"], h["monthly_pay"],
            t["joined"].isoformat())
        req = frappe.db.get_value(recruitment.REQ, {"designation": h["designation"], "department": dept,
                                                     "requested_by": cast["hr_lead"]["employee"]}, "name",
                                  order_by="creation desc")
        steps.append("requisition raised")

    # 2. Approvals: the head of the department, then an HR Manager who isn't the requester.
    for _ in range(2):
        doc = frappe.get_doc(recruitment.REQ, req)
        if doc.status != "Pending":
            break
        stage = recruitment._stage(doc) if recruitment._has_stage() else recruitment.STAGE_HR
        if stage == recruitment.STAGE_HEAD:
            _as(recruitment._head_user(dept), recruitment.decide, req, "approve", "Within the approved establishment.")
            steps.append("approved by head")
        else:
            _as(hr2, recruitment.decide, req, "approve", "Budgeted for this year.")
            steps.append("approved by HR")

    # 3. Advertised, and the candidate applies on the careers page.
    opening = frappe.db.get_value(recruitment.OPENING, {"job_requisition": req}, "name")
    if not opening:
        _as(hr, recruitment.publish_impl, req, (today + timedelta(days=14)).isoformat())
        opening = frappe.db.get_value(recruitment.OPENING, {"job_requisition": req}, "name")
        steps.append("advertised")
    if not app:
        recruitment.apply_impl(opening, full, email, h["phone"], h["cover"],
                               f"https://{PERSONAL_DOMAIN}/cv/{h['first']}-{h['last']}.pdf".lower(), True)
        app = frappe.db.get_value("Job Applicant", {"email_id": email}, ["name", "job_title"], as_dict=True)
        steps.append("applied")
    applicant = app.name

    # 4. Shortlisted and interviewed by the head and the second HR Manager.
    if frappe.db.get_value("Job Applicant", applicant, "status") == "Open":
        _as(hr, hiring.set_status_impl, applicant, "Shortlisted", "Meets the qualifications and experience asked for.")
        steps.append("shortlisted")
    head_user = recruitment._head_user(dept) or cast["cert_head"]["user"]
    panel = [head_user, hr2]
    interview = frappe.db.get_value("Interview", {"job_applicant": applicant, "docstatus": ["<", 2]}, "name")
    if not interview:
        itype, _skills = _interview_setup()
        _as(hr, hiring.schedule_impl, applicant, itype, t["interview"].isoformat(), "10:00:00", "11:00:00", panel)
        interview = frappe.db.get_value("Interview", {"job_applicant": applicant, "docstatus": ["<", 2]}, "name")
        steps.append("interview scheduled")
    itype = frappe.db.get_value("Interview", interview, "interview_type")
    skills = [r["skill"] for r in frappe.get_all("Expected Skill Set", filters={"parent": itype}, fields=["skill"], limit=0)]
    for n, user in enumerate(panel):
        if not frappe.db.exists("Interview Feedback", {"interview": interview, "interviewer": user, "docstatus": 1}):
            ratings = [{"skill": s, "stars": 5 if (i + n) % 3 == 0 else 4} for i, s in enumerate(skills)]
            note = ("Clear, well-prepared answers on the scope of the role; strong examples from previous work."
                    if n == 0 else "Good fit with the team; references and qualifications check out.")
            _as(user, hiring.feedback_impl, interview, "Cleared", ratings, note)
            steps.append(f"feedback from {user}")
    if int(frappe.db.get_value("Interview", interview, "docstatus") or 0) == 0:
        _as(hr, hiring.interview_result_impl, interview, "Cleared")
        steps.append("interview cleared")

    # 5. Offer: prepared by the HR lead, approved by the other HR Manager, accepted.
    offer = frappe.db.get_value("Job Offer", {"job_applicant": applicant, "docstatus": ["<", 2]}, "name")
    if not offer:
        _as(hr, hiring.make_offer_impl, applicant, t["offer"].isoformat(),
            f"Monthly basic salary E {h['monthly_pay']:,}. Six months' probation.")
        offer = frappe.db.get_value("Job Offer", {"job_applicant": applicant, "docstatus": ["<", 2]}, "name")
        steps.append("offer prepared")
    if int(frappe.db.get_value("Job Offer", offer, "docstatus") or 0) == 0:
        _as(hr2, hiring.decide_offer, offer, "approve")
        steps.append("offer approved")
    if frappe.db.get_value("Job Offer", offer, "status") == "Awaiting Response":
        _as(hr, hiring.answer_impl, offer, "Accepted")
        steps.append("offer accepted")

    # 6. Employee record, login and profile.
    _user(login, h["first"], h["last"], ["Employee"], conf[PASSWORD])
    head_emp = frappe.db.get_value("Employee", {"user_id": head_user}, "name")
    emp = frappe.db.get_value("Employee", {"job_offer": offer}, "name")
    if not emp:
        _as(hr, hiring.create_employee_impl, offer, t["joined"].isoformat(), h["gender"], h["dob"], dept, head_emp)
        emp = frappe.db.get_value("Employee", {"job_offer": offer}, "name")
        # A real save, not set_value: linking the login runs the Employee hooks (own-record permission, scope).
        doc = frappe.get_doc("Employee", emp)
        meta = frappe.get_meta("Employee")
        doc.update({k: v for k, v in {
            "user_id": login, "company_email": login, "prefered_contact_email": "Company Email", "grade": _grade(),
            "employment_type": _employment_type(),
            "holiday_list": frappe.db.get_value("Company", company, "default_holiday_list"),
            "scheduled_confirmation_date": t["probation_ends"].isoformat(),
        }.items() if v and meta.has_field(k)})
        doc.flags.ignore_permissions = True
        doc.save()
        _profile(emp, h)
        steps.append("employee created")

    # 7. Onboarding, every task ticked by its owner; the joiner signs their declaration.
    ob = frappe.db.get_value(onboarding.ONBOARDING, {"employee": emp, "docstatus": 1}, "name")
    if not ob:
        _as(hr, onboarding.start_impl, emp, [], t["boarding"].isoformat())
        ob = frappe.db.get_value(onboarding.ONBOARDING, {"employee": emp, "docstatus": 1}, "name")
        steps.append("onboarding started")
    _declare(emp, login, full, t["signed"])
    acts = frappe.get_all("Employee Boarding Activity", filters={"parent": ob, "parenttype": onboarding.ONBOARDING},
                          fields=["activity_name", "user", "task"], order_by="idx asc", limit=0)
    for i, a in enumerate(acts):
        if not a["task"]:
            continue
        if frappe.db.get_value("Task", a["task"], "status") not in ("Completed", "Cancelled"):
            _as(a["user"] or hr, onboarding.complete_task_impl, a["task"])
        _set("Task", a["task"], {"completed_on": task_done_on(t, i, len(acts)).isoformat(),
                                 "exp_start_date": t["boarding"].isoformat()})
    frappe.db.set_value(onboarding.ONBOARDING, ob, "boarding_status", "Completed", update_modified=False)

    # 8. Move the history back to when it happened; the opening closed after the hire.
    _set(recruitment.REQ, req, {"posting_date": t["raised"].isoformat(), "expected_by": t["joined"].isoformat()})
    _set(recruitment.OPENING, opening, {"posted_on": datetime.combine(t["posted"], time(9, 0)),
                                        "closes_on": t["closes"].isoformat(), "status": "Closed",
                                        "closed_on": t["closes"].isoformat()})
    return {"employee": emp, "name": full, "login": login, "designation": h["designation"], "department": dept,
            "joined": t["joined"].isoformat(), "requisition": req, "opening": opening, "applicant": applicant,
            "interview": interview, "offer": offer, "onboarding": ob, "steps_this_run": steps}


def _declare(employee: str, user: str, signed_name: str, signed_on: date) -> str:
    """The joiner signs the yearly declaration; its hook ticks the onboarding task."""
    import frappe

    from eswasa_hr.declarations import declaration_year

    year = declaration_year(signed_on)
    name = frappe.db.get_value("Impartiality Declaration", {"employee": employee, "year": year, "docstatus": 1}, "name")
    if name:
        return name

    def sign() -> str:
        doc = frappe.get_doc({"doctype": "Impartiality Declaration", "person_type": "Employee", "employee": employee,
                              "year": year, "signed_on": signed_on.isoformat(), "nothing_else": 1,
                              "confidentiality_accepted": 1, "signed_name": signed_name})
        doc.insert(ignore_permissions=True)
        doc.submit()
        return doc.name

    return _as(user, sign)


def _leave(cast: dict[str, Any], hires: dict[str, Any]) -> dict[str, Any] | None:
    """This period's leave for everyone seeded; joiners get it from the day they joined."""
    import frappe
    from frappe.utils import getdate

    today = date.today()
    period = frappe.db.get_value("Leave Period", {"from_date": ["<=", today], "to_date": [">=", today], "is_active": 1},
                                 ["name", "from_date", "to_date"], as_dict=True)
    if not period:
        raise ValueError("No active Leave Period on this site")
    leave_type = None
    for want in ("Annual Leave", "Privilege Leave"):
        if frappe.db.exists("Leave Type", want):
            leave_type = want
            break
    leave_type = leave_type or frappe.db.get_value("Leave Type", {"is_lwp": 0}, "name")
    if not leave_type:
        raise ValueError("No Leave Type on this site")
    cap = frappe.db.get_value("Leave Type", leave_type, "max_leaves_allowed") or 0
    per_year = min(20, cap) if cap else 20
    made = []
    for emp in [c["employee"] for c in cast.values()] + [h["employee"] for h in hires.values()]:
        if frappe.db.exists("Leave Allocation", {"employee": emp, "leave_type": leave_type, "docstatus": 1,
                                                 "to_date": [">=", today]}):
            continue
        joined = getdate(frappe.db.get_value("Employee", emp, "date_of_joining"))
        start = max(getdate(period.from_date), joined)
        days = prorated_leave(per_year, joined, getdate(period.from_date), getdate(period.to_date))
        if days <= 0:
            continue
        frappe.get_doc({"doctype": "Leave Allocation", "employee": emp, "leave_type": leave_type,
                        "from_date": start.isoformat(), "to_date": str(period.to_date),
                        "new_leaves_allocated": days}).insert(ignore_permissions=True).submit()
        made.append(emp)
    return {"leave_type": leave_type, "period": period.name, "allocated": made}


def _items(cast: dict[str, Any], hires: dict[str, Any]) -> dict[str, Any] | None:
    """A laptop and an access card for each joiner, acknowledged by them. Needs HR's item types (A2)."""
    import frappe

    from eswasa_hr import issued_items

    types = issued_items.types()
    if not types:
        raise ValueError("No issued item types in HR Settings yet (A2)")
    want = [t for t in types if any(w in t.lower() for w in ("laptop", "access", "card"))] or types[:1]
    hr = cast["hr_lead"]["user"]
    out = []
    for key, h in hires.items():
        for n, item_type in enumerate(want[:2]):
            if frappe.db.exists(issued_items.DOCTYPE, {"employee": h["employee"], "item_type": item_type}):
                continue
            tag = f"ESW-{'LT' if 'laptop' in item_type.lower() else 'AC'}-{h['employee'][-4:]}{n}"
            _as(hr, issued_items.issue_impl, h["employee"], item_type, None, tag, "New")
            name = frappe.db.get_value(issued_items.DOCTYPE, {"employee": h["employee"], "item_type": item_type}, "name")
            _as(h["login"], issued_items.acknowledge_impl, name)
            out.append(name)
    return {"issued": out}


def run(out_path: str | None = None) -> dict[str, Any]:
    import frappe

    reason = refusal(dict(frappe.conf))
    if reason:
        frappe.throw(reason)
    conf = dict(frappe.conf)
    today = date.today()
    frappe.flags.in_demo_seed = True
    muted = frappe.flags.mute_emails
    frappe.flags.mute_emails = True  # nothing leaves the site while seeding
    out: dict[str, Any] = {"site": frappe.local.site, "seeded_on": today.isoformat(), "skipped": {}}
    hires: dict[str, Any] = {}
    try:
        cast = block(out, "staff", _guarded("staff", lambda: _staff(out, conf)))
        if cast:
            for h in HIRES:
                done = block(out, f"hire_{h['key']}", _guarded(f"hire_{h['key']}", lambda h=h: _hire(h, cast, conf, today)))
                if done:
                    hires[h["key"]] = done
            block(out, "leave", _guarded("leave", lambda: _leave(cast, hires)))
            if hires:
                block(out, "issued_items", _guarded("issued_items", lambda: _items(cast, hires)))
        frappe.db.commit()
    finally:
        frappe.flags.mute_emails = muted
        frappe.flags.in_demo_seed = False
    path = out_path or frappe.get_site_path("private", "hr_demo_seed.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=2, default=str)
    logins = [c["user"] for c in (out.get("staff") or {}).values()] + [h["login"] for h in hires.values()]
    summary = {"written": path, "logins": logins, "password": f"site_config {PASSWORD}", "skipped": out["skipped"]}
    print(json.dumps(summary, indent=2))
    return summary


def after_migrate() -> None:
    """Seed on migrate, only where the site asks for it. Never fails the migrate."""
    import frappe

    if refusal(dict(frappe.conf)):
        return
    try:
        run()
    except Exception:  # noqa: BLE001
        frappe.db.rollback()
        frappe.log_error(title="HR demo seed failed")
