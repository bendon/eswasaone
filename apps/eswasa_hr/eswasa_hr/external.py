"""
External personnel (plan 07 step 7, brief §6.5, H10): contract auditors and technical experts who aren't employees.

A light register, ``External Person``. Staff Authorisation and Impartiality Declaration can name one instead of
an Employee (``person_type`` = External), and every competence guard treats them as a staff member, except
leave (they have none). The head of the department set on the authorisation itself approves it.

Off until ESWASA answers H10: HR Settings ``custom_external_personnel_enabled``. While it's off, nothing can
be created or named, and the guards ignore the register.
Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any

DOCTYPE = "External Person"
FLAG = "custom_external_personnel_enabled"
EMPLOYEE, EXTERNAL = "Employee", "External"
PERSON_TYPES = (EMPLOYEE, EXTERNAL)
ROLES = ("Contract auditor", "Technical expert", "TC expert")
STATUSES = ("Active", "Inactive")
ORGANISATION_TYPES = ("Supplier", "Contact")
HR_ROLES = ("HR Manager", "HR User", "System Manager")
DISABLED = "External personnel aren't turned on. ESWASA hasn't confirmed they're used (H10)."


# ---------------------------------------------------------------- pure rules


def person_type(row: dict[str, Any]) -> str:
    """Older rows have no person_type: they're employees."""
    return EXTERNAL if (row.get("person_type") or EMPLOYEE) == EXTERNAL else EMPLOYEE


def person_error(kind: str | None, employee: str | None, external_person: str | None, enabled: bool) -> str | None:
    """Exactly one of employee / external person, and External only while the flag is on."""
    kind = kind or EMPLOYEE
    if kind not in PERSON_TYPES:
        return "Choose whether this is an employee or an external person."
    if kind == EXTERNAL:
        if not enabled:
            return DISABLED
        if employee:
            return "Name the external person or the employee, not both."
        if not external_person:
            return "Choose the external person."
        return None
    if external_person:
        return "Name the employee or the external person, not both."
    if not employee:
        return "Choose the employee."
    return None


def create_errors(data: dict[str, Any]) -> list[str]:
    errors = []
    if not str(data.get("full_name") or "").strip():
        errors.append("Give the person's full name.")
    email = str(data.get("email") or "").strip()
    if email and ("@" not in email or " " in email):
        errors.append("Give a valid email address.")
    if data.get("role") not in ROLES:
        errors.append(f"Choose the role: {', '.join(ROLES)}.")
    if data.get("status") and data["status"] not in STATUSES:
        errors.append("Status is Active or Inactive.")
    if data.get("organisation") and data.get("organisation_type") not in ORGANISATION_TYPES:
        errors.append("Say whether the organisation is a Supplier or a Contact.")
    return errors


def to_api(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("name"),
        "full_name": row.get("full_name"),
        "email": row.get("email") or None,
        "user": row.get("user") or None,
        "organisation_type": row.get("organisation_type") or None,
        "organisation": row.get("organisation") or None,
        "role": row.get("role"),
        "status": row.get("status") or "Active",
        "notes": row.get("notes") or None,
    }


# ---------------------------------------------------------------- Frappe glue


def enabled() -> bool:
    import frappe

    try:
        return bool(int(frappe.db.get_single_value("HR Settings", FLAG) or 0))
    except Exception:  # field not migrated yet: treat as off
        return False


def _require_hr() -> None:
    import frappe

    if not set(frappe.get_roles()) & set(HR_ROLES):
        frappe.throw("Only HR can do this.", frappe.PermissionError)


def get(name: str | None) -> dict[str, Any] | None:
    import frappe

    if not name:
        return None
    row = frappe.db.get_value(DOCTYPE, name, ["name", "full_name", "user", "status"], as_dict=True)
    return dict(row) if row else None


def for_user(user: str | None) -> dict[str, Any] | None:
    """The active External Person with this portal login, while the register is on."""
    import frappe

    if not user or not enabled() or not frappe.db.exists("DocType", DOCTYPE):
        return None
    row = frappe.db.get_value(DOCTYPE, {"user": user, "status": "Active"}, ["name", "full_name", "user"], as_dict=True)
    return dict(row) if row else None


def validate_person(doc: Any, method: str | None = None) -> None:
    """Staff Authorisation / Impartiality Declaration validate: exactly one person, External behind the flag."""
    import frappe

    kind = doc.get("person_type") or EMPLOYEE
    if not doc.get("person_type"):
        doc.person_type = EMPLOYEE
    err = person_error(kind, doc.get("employee"), doc.get("external_person"), enabled() if kind == EXTERNAL else False)
    if err:
        frappe.throw(err, frappe.ValidationError)


def list_impl() -> dict[str, Any]:
    import frappe

    _require_hr()
    if not enabled():
        return {"enabled": False, "items": []}
    rows = frappe.get_all(
        DOCTYPE,
        fields=["name", "full_name", "email", "user", "organisation_type", "organisation", "role", "status", "notes"],
        order_by="full_name asc",
        limit=0,
    )
    return {"enabled": True, "items": [to_api(r) for r in rows]}


def create_impl(data: dict[str, Any]) -> dict[str, Any]:
    """{"disabled": True} while the flag is off, so Core can answer 404 with reason "disabled"."""
    import frappe

    _require_hr()
    if not enabled():
        return {"disabled": True, "message": DISABLED}
    errors = create_errors(data)
    if errors:
        frappe.throw(" ".join(errors), frappe.ValidationError)
    user = (data.get("user") or "").strip() or None
    if user and frappe.db.exists("Employee", {"user_id": user}):
        frappe.throw("That login belongs to an employee. Authorise them as an employee instead.", frappe.ValidationError)
    doc = frappe.get_doc(
        {
            "doctype": DOCTYPE,
            "full_name": data["full_name"].strip(),
            "email": (data.get("email") or "").strip() or None,
            "user": user,
            "organisation_type": data.get("organisation_type") if data.get("organisation") else None,
            "organisation": data.get("organisation") or None,
            "role": data["role"],
            "status": data.get("status") or "Active",
            "notes": (data.get("notes") or "").strip() or None,
        }
    )
    doc.insert()
    return to_api({k: doc.get(k) for k in ("name", "full_name", "email", "user", "organisation_type", "organisation", "role", "status", "notes")})


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def list_people() -> dict[str, Any]:
    return list_impl()


@_whitelist
def create(
    full_name: str = "",
    role: str = "",
    email: str | None = None,
    user: str | None = None,
    organisation_type: str | None = None,
    organisation: str | None = None,
    status: str | None = None,
    notes: str | None = None,
    confirm: Any = False,
) -> dict[str, Any]:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)
    return create_impl(
        {
            "full_name": full_name,
            "role": role,
            "email": email,
            "user": user,
            "organisation_type": organisation_type,
            "organisation": organisation,
            "status": status,
            "notes": notes,
        }
    )
