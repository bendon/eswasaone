"""Plan 10: test users and records for the HR Playwright suite (e2e/hr). STAGING ONLY.

    bench --site <staging> execute eswasa_hr.e2e_seed.run

Refuses to run unless the site's ``site_config.json`` has ``"eswasa_e2e_seed": 1`` and an
``"eswasa_e2e_password"`` for the test logins. Never add this flag on production, and never turn these
records into fixtures. Everything it makes is named ``E2E …`` (people, department, designation, plan) so it is
easy to find and remove. Logins use ``eswasa_e2e_mailbox`` (default ``e2e-{persona}@eswasa.test``); point it
at a real mailbox with plus-addressing (``qa+{persona}@example.org``) so the sign-in codes arrive.

Each block runs on its own. A block that can't be built on this site (no Leave Period, no Skill tagged to a
scheme, HRMS refusing a Staffing Plan, …) is recorded under ``skipped`` with the reason, and the specs that
need it skip with that reason instead of failing. Running it again reuses what exists.

Writes the names the specs need (and each persona's Desk API key and secret) to
``sites/<site>/private/hr_e2e_seed.json``; copy that file to the machine that runs Playwright
(``HR_E2E_SEED=/path/to/hr_e2e_seed.json``). It holds credentials: keep it out of git.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Callable

FLAG = "eswasa_e2e_seed"
PASSWORD = "eswasa_e2e_password"
MAILBOX = "eswasa_e2e_mailbox"
DEFAULT_MAILBOX = "e2e-{persona}@eswasa.test"
DEPARTMENT = "E2E People"
DESIGNATION = "E2E Officer"

# persona → (first name, roles, reports to). Every persona gets an Employee in the E2E department.
PERSONAS: dict[str, tuple[str, list[str], str | None]] = {
    "hr_manager": ("E2E HR Manager", ["HR Manager", "HR User", "Employee"], None),
    "hr_manager_2": ("E2E HR Manager Two", ["HR Manager", "HR User", "Employee"], None),
    "hr_user": ("E2E HR User", ["HR User", "Employee"], None),
    "ed": ("E2E Executive Director", ["Eswasa Executive Director", "Employee"], None),
    "line_manager": ("E2E Line Manager", ["Employee"], None),
    "employee": ("E2E Employee", ["Employee"], "line_manager"),
    "auditor_expiring": ("E2E Auditor Expiring", ["Employee"], "line_manager"),
    "auditor_undeclared": ("E2E Auditor Undeclared", ["Employee"], "line_manager"),
    "expiring": ("E2E Authorisation Expiring", ["Employee"], "line_manager"),
    "leaver": ("E2E Leaver", ["Employee"], "line_manager"),
    "cert_officer": ("E2E Certification Officer", ["Certification Officer", "Employee"], "line_manager"),
}


# ---------------------------------------------------------------- pure (tested without Frappe)

def refusal(conf: dict[str, Any]) -> str | None:
    if not conf.get(FLAG):
        return f"Staging only: set \"{FLAG}\": 1 in this site's site_config.json to seed HR e2e data."
    if not conf.get(PASSWORD):
        return f"Set \"{PASSWORD}\" in site_config.json: the test logins need a password."
    template = conf.get(MAILBOX) or DEFAULT_MAILBOX
    if "{persona}" not in template or "@" not in template:
        return f"\"{MAILBOX}\" must be an address containing {{persona}}, e.g. qa+{{persona}}@example.org."
    return None


def persona_email(template: str | None, persona: str) -> str:
    return (template or DEFAULT_MAILBOX).replace("{persona}", persona.replace("_", "-")).lower()


def dates(today: date) -> dict[str, str]:
    """The dates each guard spec relies on, relative to the seed day."""
    return {
        "visit": (today + timedelta(days=10)).isoformat(),  # after auditor_expiring's valid_to
        "expiring_valid_to": (today + timedelta(days=5)).isoformat(),
        "alert_valid_to": (today + timedelta(days=60)).isoformat(),  # R-H3's first threshold
        "valid_from": (today - timedelta(days=300)).isoformat(),
        "far_valid_to": (today + timedelta(days=700)).isoformat(),
    }


def block(out: dict[str, Any], name: str, fn: Callable[[], Any]) -> Any:
    """Run one seed block; record its result, or why it was skipped."""
    try:
        value = fn()
    except Exception as exc:  # noqa: BLE001 - every failure becomes a skip reason for the specs
        out["skipped"][name] = f"{type(exc).__name__}: {exc}"[:400]
        return None
    if value is None:
        out["skipped"].setdefault(name, "not available on this site")
    else:
        out[name] = value
    return value


# ---------------------------------------------------------------- Frappe glue

def _company() -> str:
    import frappe

    company = frappe.defaults.get_global_default("company") or frappe.db.get_value("Company", {}, "name")
    if not company:
        frappe.throw("No Company on this site.")
    return company


def _department(company: str) -> str:
    import frappe

    name = frappe.db.get_value("Department", {"department_name": DEPARTMENT, "company": company}, "name")
    if name:
        return name
    root = frappe.db.get_value("Department", {"is_group": 1, "company": company}, "name") or frappe.db.get_value(
        "Department", {"is_group": 1}, "name")
    return frappe.get_doc({"doctype": "Department", "department_name": DEPARTMENT, "company": company,
                           "parent_department": root}).insert(ignore_permissions=True).name


def _designation() -> str:
    import frappe

    if not frappe.db.exists("Designation", DESIGNATION):
        frappe.get_doc({"doctype": "Designation", "designation_name": DESIGNATION}).insert(ignore_permissions=True)
    return DESIGNATION


def _user(email: str, first_name: str, roles: list[str], password: str) -> dict[str, Any]:
    import frappe
    from frappe.utils.password import update_password

    if frappe.db.exists("User", email):
        user = frappe.get_doc("User", email)
    else:
        user = frappe.get_doc({"doctype": "User", "email": email, "first_name": first_name, "user_type": "System User",
                               "send_welcome_email": 0, "enabled": 1})
        user.flags.no_welcome_mail = True
        user.insert(ignore_permissions=True)
    user.enabled = 1
    have = {r.role for r in user.roles}
    missing_roles = [r for r in roles if not frappe.db.exists("Role", r)]
    user.extend("roles", [{"role": r} for r in roles if r not in have and r not in missing_roles])
    if not user.api_key:
        user.api_key = frappe.generate_hash(length=15)
    secret = frappe.generate_hash(length=15)
    user.api_secret = secret
    user.save(ignore_permissions=True)
    update_password(email, password)
    return {"user": email, "api_key": user.api_key, "api_secret": secret, "missing_roles": missing_roles}


def _gender() -> str:
    import frappe

    for g in ("Female", "Male"):
        if frappe.db.exists("Gender", g):
            return g
    return frappe.db.get_value("Gender", {}, "name")


def _employee(first_name: str, user: str, company: str, department: str, designation: str,
              reports_to: str | None) -> str:
    import frappe

    name = frappe.db.get_value("Employee", {"user_id": user}, "name")
    values = {"department": department, "designation": designation, "reports_to": reports_to, "status": "Active",
              "company": company, "relieving_date": None}
    if name:
        frappe.db.set_value("Employee", name, values)
        return name
    return frappe.get_doc({"doctype": "Employee", "first_name": first_name, "user_id": user, "gender": _gender(),
                           "date_of_birth": "1990-01-01", "date_of_joining": (date.today() - timedelta(days=400)).isoformat(),
                           "prefered_email": user, "company_email": user, **values}).insert(ignore_permissions=True).name


def _people(out: dict[str, Any], conf: dict[str, Any]) -> dict[str, Any]:
    import frappe

    company, password = _company(), conf[PASSWORD]
    department, designation = _department(company), _designation()
    out.update(company=company, department=department, designation=designation)
    people: dict[str, Any] = {}
    for key in sorted(PERSONAS, key=lambda k: PERSONAS[k][2] is not None):  # managers first
        first, roles, boss = PERSONAS[key]
        email = persona_email(conf.get(MAILBOX), key)
        p = _user(email, first, roles, password)
        p["employee"] = _employee(first, email, company, department, designation, people[boss]["employee"] if boss else None)
        people[key] = p
    head = people["line_manager"]
    frappe.db.set_value("Department", department, "custom_head", head["employee"])
    for key, p in people.items():
        approver = head["user"] if PERSONAS[key][2] else p["user"]  # the line manager approves their own leave (self-approval spec)
        frappe.db.set_value("Employee", p["employee"], {"leave_approver": approver, "expense_approver": approver})
    return people


def _leave(people: dict[str, Any]) -> dict[str, Any] | None:
    import frappe

    today = date.today()
    period = frappe.db.get_value("Leave Period", {"from_date": ["<=", today], "to_date": [">=", today], "is_active": 1},
                                 ["name", "from_date", "to_date"], as_dict=True)
    if not period:
        raise ValueError("No active Leave Period on this site (H14): leave specs skip")
    leave_type = frappe.conf.get("eswasa_e2e_leave_type") or frappe.db.get_value("Leave Type", {"is_lwp": 0}, "name")
    if not leave_type:
        raise ValueError("No Leave Type on this site (H14): leave specs skip")
    for key in ("employee", "line_manager"):
        emp = people[key]["employee"]
        if not frappe.db.exists("Leave Allocation", {"employee": emp, "leave_type": leave_type, "docstatus": 1,
                                                     "from_date": period.from_date}):
            frappe.get_doc({"doctype": "Leave Allocation", "employee": emp, "leave_type": leave_type,
                            "from_date": period.from_date, "to_date": period.to_date,
                            "new_leaves_allocated": 20}).insert(ignore_permissions=True).submit()
    return {"leave_type": leave_type, "period": period.name}


def _scheme() -> dict[str, Any]:
    import frappe

    want = frappe.conf.get("eswasa_e2e_skill")
    row = frappe.db.get_value("Skill", want, ["name", "custom_scheme"], as_dict=True) if want else frappe.db.get_value(
        "Skill", {"custom_scheme": ["is", "set"]}, ["name", "custom_scheme"], as_dict=True)
    if not row or not row.get("custom_scheme"):
        raise ValueError("No Skill tagged to a certification scheme (Skill.custom_scheme): competence specs skip")
    return {"skill": row.name, "scheme": row.custom_scheme}


def _authorise(employee: str, skill: str, approver: str, valid_from: str, valid_to: str) -> str:
    import frappe

    existing = frappe.db.get_value("Staff Authorisation", {"employee": employee, "skill": skill, "docstatus": 1}, "name")
    if existing:
        doc = frappe.get_doc("Staff Authorisation", existing)
        doc.db_set("valid_to", valid_to)
        doc.reload()
        doc._recompute_status()
        doc.db_set("status", doc.status)
        return existing
    doc = frappe.get_doc({"doctype": "Staff Authorisation", "person_type": "Employee", "employee": employee, "skill": skill,
                          "valid_from": valid_from, "valid_to": valid_to, "approved_by": approver,
                          "evidence": [{"evidence_type": "Other", "reference": "E2E seed (staging only)"}]})
    doc.insert(ignore_permissions=True)
    doc.submit()
    return doc.name


def _declare(employee: str, first_name: str) -> str:
    import frappe

    from eswasa_hr.declarations import declaration_year

    year = declaration_year(date.today())
    name = frappe.db.get_value("Impartiality Declaration", {"employee": employee, "year": year, "docstatus": 1}, "name")
    if name:
        return name
    doc = frappe.get_doc({"doctype": "Impartiality Declaration", "person_type": "Employee", "employee": employee,
                          "year": year, "signed_on": date.today().isoformat(), "nothing_else": 1,
                          "confidentiality_accepted": 1, "signed_name": first_name})
    doc.insert(ignore_permissions=True)
    doc.submit()
    return doc.name


def _competence(people: dict[str, Any], d: dict[str, str]) -> dict[str, Any]:
    from eswasa_hr import tasks

    s = _scheme()
    head = people["line_manager"]["employee"]
    out = {**s, "visit_date": d["visit"], "alert_valid_to": d["alert_valid_to"]}
    # Spec 5: authorised and declared, but the authorisation ends before the visit.
    out["expiring"] = _authorise(people["auditor_expiring"]["employee"], s["skill"], head, d["valid_from"], d["expiring_valid_to"])
    _declare(people["auditor_expiring"]["employee"], PERSONAS["auditor_expiring"][0])
    # Spec 6: authorised well past the visit, but no declaration for the year.
    out["undeclared"] = _authorise(people["auditor_undeclared"]["employee"], s["skill"], head, d["valid_from"], d["far_valid_to"])
    # Spec 7: reaches R-H3's 60-day threshold today; run the nightly steps now.
    out["alerting"] = _authorise(people["expiring"]["employee"], s["skill"], head, d["valid_from"], d["alert_valid_to"])
    _declare(people["expiring"]["employee"], PERSONAS["expiring"][0])
    tasks.recompute_authorisation_statuses()
    tasks.rh3_authorisation_expiry_alerts()
    return out


def _leaver(people: dict[str, Any]) -> dict[str, Any]:
    import frappe

    from eswasa_hr import lifecycle

    p, today = people["leaver"], date.today().isoformat()
    todo = frappe.db.get_value("ToDo", {"allocated_to": p["user"], "description": ["like", "E2E leaver task%"]}, "name")
    if not todo:
        todo = frappe.get_doc({"doctype": "ToDo", "allocated_to": p["user"], "status": "Open",
                               "description": "E2E leaver task: hand over the test file"}).insert(ignore_permissions=True).name
    sep = frappe.db.get_value("Employee Separation", {"employee": p["employee"], "docstatus": 1}, "name")
    if not sep:
        doc = frappe.get_doc({"doctype": "Employee Separation", "employee": p["employee"], "company": _company(),
                              "boarding_begins_on": today, "custom_reason": "Resignation",
                              "custom_approved_by": people["hr_manager"]["user"]})
        doc.insert(ignore_permissions=True)
        doc.submit()
        sep = doc.name
    frappe.db.set_value("Employee", p["employee"], {"relieving_date": today, "reason_for_leaving": "Resignation"})
    lifecycle.process_last_days()
    return {"employee": p["employee"], "user": p["user"], "todo": todo, "separation": sep,
            "manager_user": people["line_manager"]["user"]}


def _establishment(out: dict[str, Any], people: dict[str, Any]) -> dict[str, Any]:
    """Spec 4: a Staffing Plan with one post, already offered, so a second offer is beyond the plan."""
    import frappe

    company, department, designation = out["company"], out["department"], out["designation"]
    today = date.today()
    plan = frappe.db.get_value("Staffing Plan", {"name": ["like", "E2E%"], "docstatus": 1}, "name")
    if not plan:
        doc = frappe.get_doc({"doctype": "Staffing Plan", "name": f"E2E Plan {today.year}", "company": company,
                              "department": department, "from_date": today.isoformat(),
                              "to_date": (today + timedelta(days=365)).isoformat(),
                              "staffing_details": [{"designation": designation, "vacancies": 1, "number_of_positions": 1,
                                                    "estimated_cost_per_position": 0}]})
        doc.insert(ignore_permissions=True)
        doc.submit()
        plan = doc.name

    def applicant(n: int) -> str:
        email = persona_email(frappe.conf.get(MAILBOX), f"applicant_{n}")
        name = frappe.db.get_value("Job Applicant", {"email_id": email}, "name")
        return name or frappe.get_doc({"doctype": "Job Applicant", "applicant_name": f"E2E Applicant {n}", "email_id": email,
                                       "designation": designation, "status": "Open"}).insert(ignore_permissions=True).name

    first, second = applicant(1), applicant(2)
    if not frappe.db.exists("Job Offer", {"job_applicant": first, "docstatus": ["<", 2]}):
        frappe.get_doc({"doctype": "Job Offer", "job_applicant": first, "applicant_name": "E2E Applicant 1",
                        "designation": designation, "company": company, "offer_date": today.isoformat(),
                        "status": "Awaiting Response"}).insert(ignore_permissions=True)
    return {"plan": plan, "offered": first, "beyond_plan": second}


def run(out_path: str | None = None) -> dict[str, Any]:
    import frappe

    reason = refusal(dict(frappe.conf))
    if reason:
        frappe.throw(reason)
    frappe.flags.in_e2e_seed = True
    out: dict[str, Any] = {"site": frappe.local.site, "seeded_on": date.today().isoformat(), "skipped": {}}
    people = block(out, "personas", lambda: _people(out, dict(frappe.conf)))
    if people:
        d = dates(date.today())
        block(out, "leave", lambda: _leave(people))
        block(out, "competence", lambda: _competence(people, d))
        block(out, "leaver", lambda: _leaver(people))
        block(out, "establishment", lambda: _establishment(out, people))
    frappe.db.commit()
    path = out_path or frappe.get_site_path("private", "hr_e2e_seed.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=2, default=str)
    summary = {"written": path, "skipped": out["skipped"], "personas": sorted((people or {}).keys())}
    print(json.dumps(summary, indent=2))
    return summary
