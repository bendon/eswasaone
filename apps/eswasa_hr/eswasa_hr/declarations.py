"""
Yearly impartiality and confidentiality declaration (brief §6.3, §0.6; journey J5).

One submitted Impartiality Declaration per employee per declaration year. Until it is signed,
``can_act`` (through ``competence.assignment_error``) refuses every audit, visit, decision and calibration
assignment for that person, as it does for a declared interest in the client.
R-H5 opens a "do" ToDo per active employee at the start of each declaration year; signing closes it.

Pure rules sit at the top and are tested without Frappe. Whitelisted methods are what Core calls.
"""

from __future__ import annotations

from datetime import date
from typing import Any

DOCTYPE = "Impartiality Declaration"
# ESWASA's financial year is assumed to start on 1 April (2026/27 = Apr 2026 to Mar 2027).
# Provisional until the Confirmation Pack answer H8 is signed.
YEAR_START_MONTH = 4
LOOK_BACK_YEARS = 2
HR_ROLES = ("HR Manager", "HR User", "System Manager")
RELATIONSHIPS = (
    "Former employer",
    "Consultancy client",
    "Shareholding or ownership",
    "Close family member works there",
    "Board or committee member",
    "Other",
)
# Sample wording until ESWASA confirms it (Confirmation Pack H9). The API says so with wording_confirmed.
CONFIDENTIALITY_TEXT = (
    "I will keep confidential all information about clients, applicants and certification, testing "
    "and calibration work that I obtain through my work for ESWASA, except where the law requires "
    "me to disclose it or the client has agreed in writing. This continues after my work for "
    "ESWASA ends."
)
WORDING_CONFIRMED = False


# ---------------------------------------------------------------- pure rules


def declaration_year(day: date) -> int:
    """Start year of the declaration year containing ``day`` (2026 for 2026/27)."""
    return day.year if day.month >= YEAR_START_MONTH else day.year - 1


def year_label(year: int) -> str:
    return f"{year}/{str(year + 1)[-2:]}"


def year_starts(year: int) -> date:
    return date(year, YEAR_START_MONTH, 1)


def look_back_from(day: date) -> date:
    try:
        return day.replace(year=day.year - LOOK_BACK_YEARS)
    except ValueError:  # 29 Feb
        return day.replace(year=day.year - LOOK_BACK_YEARS, day=28)


def clean_interests(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Drop blank rows; raise ValueError with a plain message for incomplete ones."""
    out: list[dict[str, Any]] = []
    for i, row in enumerate(rows or [], start=1):
        org = str(row.get("organisation") or "").strip()
        rel = str(row.get("relationship") or "").strip()
        start = str(row.get("from_date") or "")[:10] or None
        end = str(row.get("to_date") or "")[:10] or None
        if not org and not rel and not start and not end:
            continue
        if not org:
            raise ValueError(f"Row {i}: add the organisation's name.")
        if not rel:
            raise ValueError(f"Row {i}: say what your relationship with {org} is.")
        if start and end and end < start:
            raise ValueError(f"Row {i}: the end date for {org} is before the start date.")
        out.append({"organisation": org, "relationship": rel, "from_date": start, "to_date": end})
    return out


def signing_error(interests: list[dict[str, Any]], nothing_else: bool, accepted: bool, signed_name: str) -> str | None:
    if not interests and not nothing_else:
        return "List at least one organisation, or tick that you have nothing else to declare."
    if not accepted:
        return "Accept the confidentiality undertaking to sign."
    if len((signed_name or "").strip()) < 3:
        return "Type your full name to sign."
    return None


HANDOFF_DAYS = 10  # R-H5 (brief §12.1, provisional): then the line manager is told
LATE_RULE = "Late declaration"


def handoff_due(todo_date: Any, day: date) -> bool:
    """R-H5: the employee's ToDo was due ``HANDOFF_DAYS`` after it opened; past that date, hand it on."""
    if todo_date in (None, ""):
        return False
    d = todo_date if isinstance(todo_date, date) else date.fromisoformat(str(todo_date)[:10])
    return d < day


def late_title(employee_name: str, year: int) -> str:
    return f"{employee_name} hasn't signed their {year_label(year)} impartiality declaration after {HANDOFF_DAYS} days. Remind them"


def _day(v: Any) -> date | None:
    return None if v in (None, "") else v if type(v) is date else date.fromisoformat(str(v)[:10])


def _same_party(a: Any, b: Any) -> bool:
    return " ".join(str(a or "").split()).casefold() == " ".join(str(b or "").split()).casefold()


def act_reason(
    name: str, day: date, today: date, signed_years: set[int], interests: list[dict[str, Any]], party: str | None = None
) -> str | None:
    """Plan 07 step 2: refusal text for assigning ``name`` to work on ``day``, or None.

    The declaration year is the work date's, except while that year hasn't started yet (its declaration
    can't be signed before 1 April), when this year's signed declaration is enough.
    An interest counts when it overlaps the look-back window ending on the work date."""
    year = declaration_year(min(day, today))
    if year not in signed_years:
        return f"{name} has no signed impartiality declaration for {year_label(year)}."
    if party and str(party).strip():
        start = look_back_from(day)
        for i in interests:
            if not _same_party(i.get("organisation"), party):
                continue
            if (_day(i.get("to_date")) or day) >= start and (_day(i.get("from_date")) or start) <= day:
                return f"{name} has declared an interest in {str(party).strip()}, so can't act on its work."
    return None


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _my_employee() -> dict[str, Any] | None:
    import frappe

    rows = frappe.get_all(
        "Employee",
        filters={"user_id": frappe.session.user, "status": "Active"},
        fields=["name", "employee_name", "department", "designation"],
        limit=1,
    )
    if rows:
        return rows[0]
    from eswasa_hr import external

    ext = external.for_user(frappe.session.user)  # plan 07 step 7: an external person signs the same way
    return {"name": ext["name"], "employee_name": ext.get("full_name"), "_field": "external_person"} if ext else None


def _person_user(employee: str | None, external_person: str | None = None) -> str | None:
    """The login of an employee, or of an external person (plan 07 step 7)."""
    import frappe

    if employee:
        return frappe.db.get_value("Employee", employee, "user_id")
    if external_person:
        return frappe.db.get_value("External Person", external_person, "user")
    return None


def _externals() -> list[dict[str, Any]]:
    """Active external people, shaped like the register's staff rows, while the H10 register is on."""
    import frappe

    from eswasa_hr import external

    if not external.enabled():
        return []
    rows = frappe.get_all(external.DOCTYPE, filters={"status": "Active"}, fields=["name", "full_name", "organisation", "role", "user"],
                          limit=0, order_by="full_name asc")
    return [{"name": r["name"], "employee_name": r.get("full_name"), "department": r.get("organisation"), "designation": r.get("role"),
             "user_id": r.get("user"), "external": True} for r in rows]


def _is_hr() -> bool:
    import frappe

    return bool(set(frappe.get_roles()) & set(HR_ROLES))


def _doc_name(employee: str, year: int) -> str:
    return f"IMP-{employee}-{year}"


def _as_dict(doc: Any, year: int) -> dict[str, Any]:
    ds = int(getattr(doc, "docstatus", 0) or 0) if doc else None
    return {
        "year": year,
        "year_label": year_label(year),
        "status": "signed" if ds == 1 else "draft" if ds == 0 else "outstanding",
        "signed_on": str(doc.signed_on) if doc is not None and getattr(doc, "signed_on", None) else None,
        "nothing_else": bool(getattr(doc, "nothing_else", 0)) if doc is not None else False,
        "interests": [
            {
                "organisation": r.organisation,
                "relationship": r.relationship,
                "from_date": str(r.from_date) if r.from_date else None,
                "to_date": str(r.to_date) if r.to_date else None,
            }
            for r in (getattr(doc, "interests", None) or [])
        ]
        if doc is not None
        else [],
        "look_back_from": look_back_from(_today()).isoformat(),
        "relationships": list(RELATIONSHIPS),
        "confidentiality_text": CONFIDENTIALITY_TEXT,
        "wording_confirmed": WORDING_CONFIRMED,
    }


def _load(employee: str, year: int) -> Any:
    import frappe

    name = _doc_name(employee, year)
    return frappe.get_doc(DOCTYPE, name) if frappe.db.exists(DOCTYPE, name) else None


def _close_todos(name: str | None, employee_user: str | None) -> None:
    import frappe

    filters: dict[str, Any] = {"reference_type": DOCTYPE, "status": "Open"}
    if name:
        filters["reference_name"] = name
    if employee_user:
        filters["allocated_to"] = employee_user
    for row in frappe.get_all("ToDo", filters=filters, fields=["name"]):
        frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")


def my_declaration_impl() -> dict[str, Any]:
    import frappe

    emp = _my_employee()
    if not emp:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    year = declaration_year(_today())
    return {"employee": emp.get("name"), "employee_name": emp.get("employee_name"), **_as_dict(_load(emp["name"], year), year)}


def sign_impl(
    interests: list[dict[str, Any]] | None,
    nothing_else: bool,
    confidentiality_accepted: bool,
    signed_name: str,
) -> dict[str, Any]:
    import frappe

    emp = _my_employee()
    if not emp:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    year = declaration_year(_today())
    doc = _load(emp["name"], year)
    if doc is not None and int(doc.docstatus or 0) == 1:
        frappe.throw(f"You already signed your {year_label(year)} declaration.", frappe.ValidationError)
    try:
        rows = clean_interests(interests)
    except ValueError as exc:
        frappe.throw(str(exc), frappe.ValidationError)
    err = signing_error(rows, bool(nothing_else), bool(confidentiality_accepted), signed_name)
    if err:
        frappe.throw(err, frappe.ValidationError)

    if doc is None:
        field = emp.get("_field") or "employee"
        doc = frappe.get_doc(
            {"doctype": DOCTYPE, field: emp["name"], "person_type": "External" if field == "external_person" else "Employee", "year": year}
        )
    doc.set("interests", [])
    for r in rows:
        doc.append("interests", r)
    doc.nothing_else = 1 if nothing_else else 0
    doc.confidentiality_accepted = 1
    doc.signed_name = signed_name.strip()
    doc.save() if doc.get("name") else doc.insert()
    doc.submit()
    return {"employee": emp.get("name"), "employee_name": emp.get("employee_name"), **_as_dict(doc, year)}


def register_impl(year: int | None = None) -> dict[str, Any]:
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can see the declarations register.", frappe.PermissionError)
    y = int(year) if year else declaration_year(_today())
    staff = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "employee_name", "department", "designation", "user_id"],
        limit=0,
        order_by="employee_name asc",
    )
    staff = list(staff) + _externals()  # external people sign too (plan 07 step 7, behind H10)
    signed_rows = frappe.get_all(
        DOCTYPE, filters={"year": y, "docstatus": 1}, fields=["employee", "external_person", "signed_on"], limit=0
    )
    signed = {r.get("employee") or r.get("external_person"): r.get("signed_on") for r in signed_rows}
    outstanding = [
        {
            "employee": s.get("name"),
            "employee_name": s.get("employee_name"),
            "department": s.get("department"),
            "designation": s.get("designation"),
            "has_login": bool(s.get("user_id")),
            **({"external": True} if s.get("external") else {}),
        }
        for s in staff
        if s.get("name") not in signed
    ]
    return {
        "year": y,
        "year_label": year_label(y),
        "total": len(staff),
        "signed": len(staff) - len(outstanding),
        "outstanding": outstanding,
    }


def remind_impl(year: int | None = None) -> dict[str, Any]:
    """R-H5 and the HR "Remind" button: one open ToDo per unsigned active employee with a login."""
    import frappe
    from frappe.utils import add_days

    reg = register_impl(year)
    title = f"Sign your {reg['year_label']} impartiality and confidentiality declaration"
    created = skipped = 0
    for row in reg["outstanding"]:
        user = _person_user(None, row["employee"]) if row.get("external") else _person_user(row["employee"])
        if not user:
            skipped += 1
            continue
        name = _doc_name(row["employee"], reg["year"])
        if frappe.db.exists("ToDo", {"reference_type": DOCTYPE, "allocated_to": user, "status": "Open"}):
            continue
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": user,
                "description": title,
                "reference_type": DOCTYPE,
                # The declaration may not exist yet; the name is deterministic, so the link resolves once drafted.
                "reference_name": name,
                "status": "Open",
                "priority": "Medium",
                "date": add_days(_today(), 10),  # R-H5: 10 days, then the line manager (brief §12.1)
            }
        ).insert(ignore_permissions=True)
        created += 1
        from eswasa_hr import notify

        notify.queue(f"decl-open:{row['employee']}:{reg['year']}", [user], "declaration_open", {"year_label": reg["year_label"]})
    return {"created": created, "without_login": skipped, "outstanding": len(reg["outstanding"])}


# ---------------------------------------------------------------- controller hooks


def validate(doc: Any, method: str | None = None) -> None:
    """Only the employee signs their own declaration; HR may read and amend."""
    import frappe

    if not _is_hr():
        if doc.get("employee"):
            mine = frappe.db.get_value("Employee", doc.employee, "user_id")
        else:
            mine = frappe.db.get_value("External Person", doc.get("external_person"), "user") if doc.get("external_person") else None
        if mine != frappe.session.user:
            frappe.throw("You can only complete your own declaration.", frappe.PermissionError)
    try:
        clean_interests(
            [
                {k: getattr(r, k, None) for k in ("organisation", "relationship", "from_date", "to_date")}
                for r in (doc.get("interests") or [])
            ]
        )
    except ValueError as exc:
        frappe.throw(str(exc), frappe.ValidationError)


def before_submit(doc: Any, method: str | None = None) -> None:
    import frappe

    rows = [r for r in (doc.get("interests") or [])]
    err = signing_error(rows, bool(doc.nothing_else), bool(doc.confidentiality_accepted), doc.signed_name or "")
    if err:
        frappe.throw(err, frappe.ValidationError)
    doc.signed_on = _today().isoformat()


def on_submit(doc: Any, method: str | None = None) -> None:
    import frappe

    external_person = None if doc.employee else doc.get("external_person")
    user = _person_user(doc.employee, external_person)
    # Only this person's declaration ToDos. With no login, only this declaration's: never every open one.
    _close_todos(None, user) if user else _close_todos(doc.name, None)
    if frappe.db.exists("DocType", "HR Alert"):
        if doc.employee:
            from eswasa_hr.alerts import close_for

            close_for(doc.employee, LATE_RULE)
        elif external_person:
            _close_late(external_person)
    if doc.employee:
        from eswasa_hr.onboarding import on_declaration_signed

        on_declaration_signed(doc.employee)


def _close_late(person: str) -> None:
    """Close the R-H5 hand-off for an external person (their alerts carry no employee)."""
    import frappe

    for a in frappe.get_all("HR Alert", filters={"rule": LATE_RULE, "key": ["like", f"decl-late:{person}:%"]}, fields=["name"], limit=0):
        for t in frappe.get_all("ToDo", filters={"reference_type": "HR Alert", "reference_name": a["name"], "status": "Open"}, fields=["name"], limit=0):
            frappe.db.set_value("ToDo", t["name"], "status", "Closed")


def can_act(user_or_employee: str | None, on: Any = None, party: str | None = None) -> tuple[bool, str | None]:
    """Assignment guard for Certification and Metrology: (ok, reason). Someone with no Employee record isn't
    tracked by HR, so they pass here (as ``authorisations.authorised_reason`` returns None for them)."""
    import frappe

    if not user_or_employee or not frappe.db.exists("DocType", DOCTYPE):
        return True, None
    fields = ["name", "employee_name"]
    emp = frappe.db.get_value("Employee", user_or_employee, fields, as_dict=True) or frappe.db.get_value(
        "Employee", {"user_id": user_or_employee}, fields, as_dict=True
    )
    who = {"employee": emp.get("name")} if emp else None
    if not emp:
        from eswasa_hr import external

        ext = external.for_user(user_or_employee)  # plan 07 step 7: an external person is checked like staff
        if not ext:
            return True, None
        emp, who = {"name": ext["name"], "employee_name": ext.get("full_name")}, {"external_person": ext["name"]}
    today = _today()
    day = _day(on) or today
    decls = frappe.get_all(
        DOCTYPE,
        filters={**who, "docstatus": 1, "year": [">=", declaration_year(look_back_from(day))]},
        fields=["name", "year"],
        limit=0,
    )
    names = [d.get("name") for d in decls]
    interests = (
        frappe.get_all(
            "Impartiality Interest",
            filters={"parent": ["in", names]},
            fields=["organisation", "from_date", "to_date"],
            limit=0,
        )
        if names and party
        else []
    )
    reason = act_reason(
        emp.get("employee_name") or emp.get("name"), day, today, {int(d.get("year")) for d in decls}, interests, party
    )
    return reason is None, reason


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def my_declaration() -> dict[str, Any]:
    return my_declaration_impl()


@_whitelist
def sign(
    interests: Any = None,
    nothing_else: Any = False,
    confidentiality_accepted: Any = False,
    signed_name: str = "",
    confirm: Any = False,
) -> dict[str, Any]:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)
    rows = frappe.parse_json(interests) if isinstance(interests, str) else (interests or [])
    return sign_impl(rows, bool(cint(nothing_else)), bool(cint(confidentiality_accepted)), signed_name or "")


@_whitelist
def register(year: Any = None) -> dict[str, Any]:
    return register_impl(int(year) if year else None)


@_whitelist
def remind(confirm: Any = False) -> dict[str, Any]:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)
    if not _is_hr():
        frappe.throw("Only HR can send reminders.", frappe.PermissionError)
    return remind_impl()


def rh5_escalate() -> int:
    """Daily (R-H5): an unsigned declaration whose ToDo is past its 10 days reaches the line manager, once.

    The employee's own ToDo stays open. Without a line manager, the HR Managers are told instead.
    """
    import frappe

    from eswasa_hr.alerts import raise_alert, recipients
    from eswasa_hr.recruitment import _hr_manager_users

    if not frappe.db.exists("DocType", "HR Alert"):
        return 0
    day = _today()
    year = declaration_year(day)
    prefix = f"IMP-%-{year}"
    n = 0
    for t in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "status": "Open", "reference_name": ["like", prefix]},
                            fields=["name", "allocated_to", "reference_name", "date"], limit=0):
        if not handoff_due(t.get("date"), day):
            continue
        emp = frappe.db.get_value("Employee", {"user_id": t.get("allocated_to"), "status": "Active"}, ["name", "employee_name", "reports_to"], as_dict=True)
        field, subject_type = "employee", "Employee"
        if not emp:
            from eswasa_hr import external

            ext = external.for_user(t.get("allocated_to"))  # plan 07 step 7: no line manager, so HR is told
            emp = {"name": ext["name"], "employee_name": ext.get("full_name"), "reports_to": None} if ext else None
            field, subject_type = "external_person", external.DOCTYPE
        if not emp or t.get("reference_name") != _doc_name(emp["name"], year):
            continue
        if frappe.db.exists(DOCTYPE, {field: emp["name"], "year": year, "docstatus": 1}):
            continue
        manager = frappe.db.get_value("Employee", emp.get("reports_to"), "user_id") if emp.get("reports_to") else None
        users = recipients(manager) or recipients(_hr_manager_users())
        n += raise_alert(f"decl-late:{emp['name']}:{year}", LATE_RULE, late_title(emp.get("employee_name") or emp["name"], year), users,
                         day.isoformat(), emp["name"] if field == "employee" else None, (subject_type, emp["name"]))
    return n


def rh5_open_year() -> int:
    """Daily cron: on the first day of a declaration year, open a ToDo for everyone unsigned."""
    today = _today()
    if today != year_starts(declaration_year(today)):
        return 0
    return int(remind_impl()["created"])
