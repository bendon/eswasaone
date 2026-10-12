"""
Sensitive personal data and its access log (journey J12; brief §11).

Employee fields are split into levels with ``permlevel`` property setters, so Desk and the REST API hide them
from anyone without that level:

- level 1, personal: date of birth, marital status, personal contacts, addresses, emergency contact, passport.
  HR User and HR Manager can read (and write, so HR can still create employees).
- level 2, pay and bank: cost to company, salary mode and currency, bank and account. HR Manager only.
  This only gates the existing Employee fields; it reads no salary slips and runs no payroll.

To see them in the portal you give a reason. Every view writes an ``HR Access Log`` row first (who, whose,
which level, which fields, why, when, from where); the person can see who looked at their record.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any

LOG = "HR Access Log"
MIN_REASON = 10

PERSONAL, PAY = 1, 2
LEVELS: dict[int, dict[str, Any]] = {
    PERSONAL: {
        "label": "Personal",
        "roles": ("HR User", "HR Manager", "System Manager"),
        "fields": (
            ("date_of_birth", "Date of birth"),
            ("marital_status", "Marital status"),
            ("personal_email", "Personal email"),
            ("cell_number", "Mobile"),
            ("current_address", "Current address"),
            ("permanent_address", "Permanent address"),
            ("person_to_be_contacted", "Emergency contact"),
            ("relation", "Relationship"),
            ("emergency_phone_number", "Emergency phone"),
            ("passport_number", "Passport number"),
        ),
    },
    PAY: {
        "label": "Pay and bank",
        "roles": ("HR Manager", "System Manager"),
        "fields": (
            ("ctc", "Cost to company"),
            ("salary_currency", "Salary currency"),
            ("salary_mode", "Salary mode"),
            ("bank_name", "Bank"),
            ("bank_ac_no", "Account number"),
            ("iban", "IBAN"),
        ),
    },
}


# ---------------------------------------------------------------- pure rules


def level_of(value: Any) -> int | None:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n in LEVELS else None


def levels_for(roles: Any) -> list[int]:
    have = set(roles or ())
    return [n for n, spec in LEVELS.items() if have & set(spec["roles"])]


def view_error(level: int | None, roles: Any, reason: str | None, own: bool) -> str | None:
    if level is None:
        return "Choose personal, or pay and bank."
    if level not in levels_for(roles):
        return f"You can't open {LEVELS[level]['label'].lower()} details." + (" Only HR Managers can." if level == PAY else "")
    if own and level == PAY:
        return "This is your own record. Your pay and bank details are on your payslip; ask another HR Manager to check them."
    if len((reason or "").strip()) < MIN_REASON:
        return "Say why you need to see these details (at least 10 characters). It is recorded."
    return None


def property_setters() -> list[dict[str, Any]]:
    """``permlevel`` property setters for every protected Employee field (shipped as fixtures)."""
    out = []
    for level, spec in LEVELS.items():
        for field, _label in spec["fields"]:
            out.append(
                {
                    "doctype": "Property Setter",
                    "name": f"Employee-{field}-permlevel",
                    "doc_type": "Employee",
                    "doctype_or_field": "DocField",
                    "field_name": field,
                    "property": "permlevel",
                    "property_type": "Int",
                    "value": str(level),
                }
            )
    return out


def shown(row: dict[str, Any], level: int) -> list[dict[str, Any]]:
    return [{"field": f, "label": label, "value": None if row.get(f) in (None, "") else str(row.get(f))} for f, label in LEVELS[level]["fields"]]


# ---------------------------------------------------------------- Frappe glue


def _roles() -> list[str]:
    import frappe

    return frappe.get_roles()


def _employee(employee: str) -> dict[str, Any]:
    import frappe

    e = frappe.db.get_value("Employee", employee, ["name", "employee_name", "user_id"], as_dict=True)
    if not e:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    return dict(e)


def _ip() -> str | None:
    import frappe

    return getattr(getattr(frappe, "local", None), "request_ip", None)


def view_impl(employee: str, level: Any, reason: str) -> dict[str, Any]:
    import frappe
    from frappe.utils import now_datetime

    e = _employee(employee)
    lv = level_of(level)
    roles = _roles()
    own = e.get("user_id") == frappe.session.user
    err = view_error(lv, roles, reason, own)
    if err:
        denied = lv is not None and (lv not in levels_for(roles) or (own and lv == PAY))
        frappe.throw(err, frappe.PermissionError if denied else frappe.ValidationError)
    fields = [f for f, _ in LEVELS[lv]["fields"]]
    existing = [f for f in fields if frappe.get_meta("Employee").has_field(f)]
    # The log row is written before anything is read, so a view is never unrecorded.
    log = frappe.get_doc(
        {
            "doctype": LOG,
            "employee": employee,
            "employee_name": e["employee_name"],
            "viewer": frappe.session.user,
            "level": LEVELS[lv]["label"],
            "fields": ", ".join(existing),
            "reason": reason.strip(),
            "ip_address": _ip(),
            "viewed_on": now_datetime(),
        }
    )
    log.insert(ignore_permissions=True)
    row = frappe.db.get_value("Employee", employee, existing, as_dict=True) if existing else {}
    return {
        "employee": employee,
        "employee_name": e["employee_name"],
        "level": lv,
        "level_label": LEVELS[lv]["label"],
        "fields": [f for f in shown(dict(row or {}), lv) if f["field"] in existing],
        "log": log.name,
    }


def _log_rows(employee: str, with_reason: bool) -> list[dict[str, Any]]:
    import frappe

    if not frappe.db.exists("DocType", LOG):
        return []
    rows = frappe.get_all(LOG, filters={"employee": employee}, fields=["name", "viewer", "level", "reason", "viewed_on"], order_by="viewed_on desc", limit=200)
    users = sorted({r.get("viewer") for r in rows} - {None})
    names = {u.get("name"): u.get("full_name") for u in frappe.get_all("User", filters={"name": ["in", users]}, fields=["name", "full_name"], limit=0)} if users else {}
    return [
        {
            "id": r.get("name"),
            "viewer": r.get("viewer"),
            "viewer_name": names.get(r.get("viewer")) or r.get("viewer"),
            "level": r.get("level"),
            "reason": r.get("reason") if with_reason else None,
            "viewed_on": str(r.get("viewed_on")) if r.get("viewed_on") else None,
        }
        for r in rows
    ]


def access_log_impl(employee: str) -> dict[str, Any]:
    """Who opened this person's protected details: HR Managers, or the person themselves."""
    import frappe

    e = _employee(employee)
    own = e.get("user_id") == frappe.session.user
    if not (own or set(_roles()) & {"HR Manager", "System Manager"}):
        frappe.throw("Only HR Managers and the person can see who opened these details.", frappe.PermissionError)
    return {"employee": employee, "employee_name": e["employee_name"], "items": _log_rows(employee, with_reason=True), "can_open": levels_for(_roles())}


def my_access_log_impl() -> dict[str, Any]:
    import frappe

    me = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not me:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    return access_log_impl(me)


def apply_field_levels() -> None:
    """Desk permissions to match the levels (run on migrate). Property setters come from fixtures."""
    import frappe
    from frappe.permissions import add_permission, update_permission_property

    for level, spec in LEVELS.items():
        for role in spec["roles"]:
            if role == "System Manager" or not frappe.db.exists("Role", role):
                continue
            if not frappe.db.exists("Custom DocPerm", {"parent": "Employee", "role": role, "permlevel": level}):
                add_permission("Employee", role, level)
            update_permission_property("Employee", role, level, "read", 1)
            update_permission_property("Employee", role, level, "write", 1)


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def view(employee: str, level: Any, reason: str, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return view_impl(employee, level, reason)


@_whitelist
def access_log(employee: str) -> dict[str, Any]:
    return access_log_impl(employee)


@_whitelist
def my_access_log() -> dict[str, Any]:
    return my_access_log_impl()
