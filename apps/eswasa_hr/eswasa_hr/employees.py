"""
Add a person and correct their job fields (screen H1 "People", Add person).

Core used to insert Employees with ``frappe.client`` and link ``user_id`` by hand, skipping the HRMS
mandatory fields, the leaf-department rule and the User Permission. Creating and editing now happen here:
- HRMS needs gender, date of birth and date of joining. Each missing one is reported; none is defaulted.
- A department must be a leaf, enabled and in the ESWASA company.
- The invitation creates the login only for someone who doesn't already have one, gives only the allowed
  roles, and links ``user_id`` with ``create_user_permission`` so the person sees only their own record.
- An edit changes job fields only. Moves on an active record go through promotion or transfer (lifecycle.py),
  leaving goes through separation, and protected personal and pay fields (sensitive.LEVELS) aren't editable here.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any

from eswasa_hr.sensitive import LEVELS

DOCTYPE = "Employee"
HR_ROLES = ("HR Manager", "HR User", "System Manager")

# Roles an invitation may give (was _HR_INVITE_ALLOWED_ROLES in Core's router).
INVITE_DEFAULT_ROLES = ("ESWASA Staff", "Desk User", "Employee", "Employee Self Service")
INVITE_ALLOWED_ROLES = frozenset(
    {
        "ESWASA Staff",
        "Desk User",
        "Employee",
        "Employee Self Service",
        "HR User",
        "HR Manager",
        "Leave Approver",
        "Accounts User",
        "Accounts Manager",
        "Sales User",
        "Sales Manager",
    }
)
# Only an HR Manager (or System Manager) can make someone an HR Manager.
MANAGER_ONLY_ROLES = frozenset({"HR Manager"})

REQUIRED = (
    ("employee_name", "Name"),
    ("gender", "Gender"),
    ("date_of_birth", "Date of birth"),
    ("date_of_joining", "Date of joining"),
)
# Job fields an edit may touch; everything else is refused.
EDITABLE = ("employee_name", "company_email", "status", "department", "designation", "grade", "reports_to", "branch")
# On an Active record these go through promotion or transfer so they're approved and kept in the history.
MOVE_FIELDS = {"department": "Department", "designation": "Designation", "grade": "Grade", "reports_to": "Reports to"}
STATUSES = ("Active", "Inactive", "Suspended", "Left")
# Optional fields a new record may carry (the employee import, plan 09, sends them; Add person doesn't).
IMPORT_FIELDS = (
    "employee_number",
    "middle_name",
    "grade",
    "branch",
    "employment_type",
    "holiday_list",
    "scheduled_confirmation_date",
    "final_confirmation_date",
    "contract_end_date",
    "notice_number_of_days",
    "payroll_cost_center",
    "status",
)


def _s(v: Any) -> str:
    return str(v or "").strip()


def protected_fields() -> dict[str, str]:
    """fieldname -> label for every permlevel 1 and 2 Employee field."""
    return {f: label for spec in LEVELS.values() for f, label in spec["fields"]}


def split_name(employee_name: str, first: str | None = None, last: str | None = None) -> tuple[str, str]:
    parts = _s(employee_name).split(None, 1)
    return _s(first) or (parts[0] if parts else ""), _s(last) or (parts[1] if len(parts) > 1 else "")


def department_error(dept: dict[str, Any] | None, company: str | None) -> str | None:
    """``dept`` is the Department row (is_group, disabled, company), or None when it doesn't exist."""
    if dept is None:
        return "That department doesn't exist."
    if int(dept.get("is_group") or 0):
        return "Choose a department, not a group of departments."
    if int(dept.get("disabled") or 0):
        return "That department is disabled."
    if company and dept.get("company") and dept["company"] != company:
        return "That department belongs to another company."
    return None


def create_errors(row: dict[str, Any], dept: dict[str, Any] | None = None, designation_exists: bool = True, company: str | None = None) -> list[str]:
    """Plain-language problems with a new person. HRMS-mandatory fields are reported, never defaulted."""
    errs = [f"{label} is required." for field, label in REQUIRED if not _s(row.get(field))]
    if _s(row.get("department")):
        err = department_error(dept, company)
        if err:
            errs.append(err)
    if _s(row.get("designation")) and not designation_exists:
        errs.append("That designation doesn't exist.")
    if row.get("invite") and not _s(row.get("email") or row.get("company_email")):
        errs.append("Give an email address to send the invitation to.")
    if _s(row.get("status")) and row["status"] not in STATUSES[:3]:
        errs.append("A new record is Active, Inactive or Suspended.")
    return errs


def invite_roles(requested: list[str] | None, caller_roles: list[str]) -> list[str]:
    """The roles an invitation gives: only allowed ones, and HR Manager only from an HR Manager."""
    can_grant_manager = bool(set(caller_roles) & {"HR Manager", "System Manager"})
    roles = [r for r in (requested or []) if r in INVITE_ALLOWED_ROLES and (can_grant_manager or r not in MANAGER_ONLY_ROLES)]
    return list(dict.fromkeys(roles)) or list(INVITE_DEFAULT_ROLES)


def link_error(email: str, user_exists: bool, linked_employee: str | None) -> str | None:
    """Never a second login for someone who already logs in."""
    if user_exists and linked_employee:
        return f"{email} already logs in as {linked_employee}. Use that record rather than adding the person again."
    return None


def update_errors(changes: dict[str, Any], status: str | None) -> list[str]:
    if not changes:
        return ["Nothing to change."]
    errs = []
    protected = protected_fields()
    for field in changes:
        if field in protected:
            errs.append(f"{protected[field]} is a protected detail and can't be changed here.")
        elif field not in EDITABLE:
            errs.append(f"{field} can't be changed here.")
    new_status = changes.get("status")
    if new_status == "Left":
        errs.append("Record a leaver through separation, so the exit checklist and approval happen.")
    elif new_status is not None and new_status not in STATUSES:
        errs.append("Choose Active, Inactive or Suspended.")
    if (status or "Active") == "Active":
        moved = [label for f, label in MOVE_FIELDS.items() if f in changes]
        if moved:
            errs.append(f"{', '.join(moved)} on an active record change through a promotion or transfer, so they're approved and kept in the history.")
    return errs


# ---------------------------------------------------------------- Frappe glue

SUMMARY_FIELDS = ["name", "employee_name", "department", "designation", "status", "date_of_joining", "user_id", "company_email", "prefered_email", "reports_to"]


def _require_hr() -> None:
    import frappe

    if not set(frappe.get_roles()) & set(HR_ROLES):
        frappe.throw("Only HR can add or change people.", frappe.PermissionError)


def _summary(name: str) -> dict[str, Any]:
    import frappe

    return dict(frappe.db.get_value(DOCTYPE, name, SUMMARY_FIELDS, as_dict=True) or {})


def _invite(email: str, full_name: str, roles: list[str]) -> str:
    """Create the login (welcome email with a set-password link), or reuse an unlinked one. Returns the user."""
    import frappe

    existing = frappe.db.get_value("User", {"name": email}, "name") or frappe.db.get_value("User", {"email": email}, "name")
    linked = frappe.db.get_value(DOCTYPE, {"user_id": existing}, "name") if existing else None
    err = link_error(email, bool(existing), linked)
    if err:
        frappe.throw(err, frappe.ValidationError)
    if existing:
        return existing
    first, last = split_name(full_name)
    user = frappe.get_doc(
        {
            "doctype": "User",
            "email": email,
            "first_name": first or email,
            "last_name": last,
            "user_type": "System User",
            "send_welcome_email": 1,
            "roles": [{"role": r} for r in roles],
        }
    )
    # The caller is HR (checked above) and the roles are limited to INVITE_ALLOWED_ROLES.
    user.insert(ignore_permissions=True)
    return user.name


def create_impl(row: dict[str, Any]) -> dict[str, Any]:
    import frappe

    from eswasa_hr.recruitment import _company

    _require_hr()
    company = _company()
    dept_name, desig = _s(row.get("department")), _s(row.get("designation"))
    dept = frappe.db.get_value("Department", dept_name, ["is_group", "disabled", "company"], as_dict=True) if dept_name else None
    errs = create_errors(row, dict(dept) if dept else None, bool(frappe.db.exists("Designation", desig)) if desig else True, company)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)

    first, last = split_name(row["employee_name"], row.get("first_name"), row.get("last_name"))
    doc: dict[str, Any] = {
        "doctype": DOCTYPE,
        "first_name": first,
        "last_name": last,
        "employee_name": _s(row["employee_name"]),
        "gender": row["gender"],
        "date_of_birth": row["date_of_birth"],
        "date_of_joining": row["date_of_joining"],
        "company": company,
        "status": "Active",
    }
    email = _s(row.get("email") or row.get("company_email")).lower()
    for key, val in (("department", dept_name), ("designation", desig), ("company_email", _s(row.get("company_email") or row.get("email")).lower()), ("reports_to", _s(row.get("reports_to")))):
        if val:
            doc[key] = val
    for key in IMPORT_FIELDS:
        if _s(row.get(key)):
            doc[key] = row[key]
    if row.get("invite"):
        doc["user_id"] = _invite(email, doc["employee_name"], invite_roles(row.get("roles"), frappe.get_roles()))
        doc["create_user_permission"] = 1
    emp = frappe.get_doc(doc)
    emp.insert()
    return _summary(emp.name)


def update_impl(employee: str, changes: dict[str, Any]) -> dict[str, Any]:
    import frappe

    _require_hr()
    status = frappe.db.get_value(DOCTYPE, employee, "status")
    if status is None:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    changes = {k: v for k, v in (changes or {}).items() if v is not None}
    errs = update_errors(changes, status)
    if "department" in changes and not errs:
        dept = frappe.db.get_value("Department", changes["department"], ["is_group", "disabled", "company"], as_dict=True)
        from eswasa_hr.recruitment import _company

        err = department_error(dict(dept) if dept else None, _company())
        if err:
            errs.append(err)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    doc = frappe.get_doc(DOCTYPE, employee)
    doc.update(changes)
    doc.save()
    return _summary(employee)


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


def form_options_impl() -> dict[str, Any]:
    """Add person (H2) choices from HRMS itself, never a hard-coded list."""
    import frappe

    genders = [r["name"] for r in frappe.get_all("Gender", fields=["name"], order_by="name asc", limit=0)] if frappe.db.exists("DocType", "Gender") else []
    return {"genders": genders}


@_whitelist
def form_options() -> dict[str, Any]:
    return form_options_impl()


@_whitelist
def create(
    employee_name: str,
    gender: str | None = None,
    date_of_birth: str | None = None,
    date_of_joining: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    department: str | None = None,
    designation: str | None = None,
    company_email: str | None = None,
    email: str | None = None,
    reports_to: str | None = None,
    invite: Any = False,
    roles: Any = None,
    confirm: Any = False,
) -> dict[str, Any]:
    import json

    from frappe.utils import cint

    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    if isinstance(roles, str):
        roles = json.loads(roles) if roles.strip().startswith("[") else [roles]
    return create_impl(
        {
            "employee_name": employee_name,
            "gender": gender,
            "date_of_birth": date_of_birth,
            "date_of_joining": date_of_joining,
            "first_name": first_name,
            "last_name": last_name,
            "department": department,
            "designation": designation,
            "company_email": company_email,
            "email": email,
            "reports_to": reports_to,
            "invite": bool(cint(invite)),
            "roles": roles,
        }
    )


@_whitelist
def update(employee: str, changes: Any = None, confirm: Any = False) -> dict[str, Any]:
    import json

    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    if isinstance(changes, str):
        changes = json.loads(changes or "{}")
    return update_impl(employee, changes or {})
