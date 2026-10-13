"""
Sensitive personal data and its access log (journey J12; brief §11).

Employee fields are split into levels with ``permlevel`` property setters, so Desk and the REST API hide them
from anyone without that level:

- level 1, personal: date of birth, marital status, personal contacts, addresses, emergency contact, passport.
  HR User and HR Manager can read (and write, so HR can still create employees).
- level 2, pay and bank: cost to company, salary mode and currency, bank and account. HR Manager only.
  This only gates the existing Employee fields; it reads no salary slips and runs no payroll.
- level 3, family and medical (HR additions plan 04): medical aid and the ``Employee Dependant`` table
  (dependants and death-benefit shares). HR Manager only, and the person may see their own (logged). Both are
  provisional until ESWASA's privacy officer answers A5 (with H17). A Table field's permlevel hides the whole table.

To see them in the portal you give a reason. Every view writes an ``HR Access Log`` row first (who, whose,
which level, which fields, why, when, from where); the person can see who looked at their record.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any

LOG = "HR Access Log"
MIN_REASON = 10

PERSONAL, PAY, FAMILY = 1, 2, 3
DEPENDANTS = "Employee Dependant"
DEPENDANT_COLUMNS = (
    ("full_name", "Name"),
    ("relationship", "Relationship"),
    ("date_of_birth", "Date of birth"),
    ("id_number", "ID number"),
    ("on_medical_aid", "On medical aid"),
    ("beneficiary_share", "Beneficiary share (%)"),
    ("phone", "Phone"),
)
RELATIONSHIPS = ("Spouse", "Child", "Parent", "Other")
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
    FAMILY: {
        "label": "Family and medical",
        "roles": ("HR Manager", "System Manager"),  # provisional until ESWASA answers A5 (with H17)
        "fields": (
            ("custom_medical_aid_scheme", "Medical aid scheme"),
            ("custom_medical_aid_number", "Medical aid number"),
            ("custom_medical_aid_plan", "Medical aid plan"),
            ("custom_medical_aid_main_member", "Main member"),
        ),
        "tables": (("custom_dependants", "Dependants", DEPENDANT_COLUMNS),),
    },
}
# Levels a person may open on their own record without HR (logged all the same). Provisional: A5.
OWN_LEVELS = (FAMILY,)


# ---------------------------------------------------------------- pure rules


def level_of(value: Any) -> int | None:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n in LEVELS else None


def protected_labels() -> dict[str, str]:
    """fieldname -> label for every protected Employee field, tables included. Nothing else may output these."""
    out = {f: label for spec in LEVELS.values() for f, label in spec["fields"]}
    out.update({f: label for spec in LEVELS.values() for f, label, _cols in spec.get("tables", ())})
    return out


def levels_for(roles: Any) -> list[int]:
    have = set(roles or ())
    return [n for n, spec in LEVELS.items() if have & set(spec["roles"])]


def view_error(level: int | None, roles: Any, reason: str | None, own: bool) -> str | None:
    if level is None:
        return "Choose personal, pay and bank, or family and medical."
    if level not in levels_for(roles):
        return f"You can't open {LEVELS[level]['label'].lower()} details." + (" Only HR Managers can." if level in (PAY, FAMILY) else "")
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
            if field.startswith("custom_"):
                continue  # our own custom fields carry their permlevel in the Custom Field fixture
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


def _text(field: str, value: Any) -> str | None:
    if value in (None, ""):
        return None
    if field in ("custom_medical_aid_main_member", "on_medical_aid"):
        return "Yes" if int(value or 0) else "No"
    return str(value)


def shown(row: dict[str, Any], level: int) -> list[dict[str, Any]]:
    return [{"field": f, "label": label, "value": _text(f, row.get(f))} for f, label in LEVELS[level]["fields"]]


def shown_tables(tables: dict[str, list[dict[str, Any]]], level: int) -> list[dict[str, Any]]:
    """``[{label, columns, rows}]`` for the level's tables; each row is keyed by the column label."""
    out = []
    for field, label, cols in LEVELS[level].get("tables", ()):
        rows = [{c_label: _text(c, r.get(c)) for c, c_label in cols} for r in tables.get(field) or []]
        out.append({"label": label, "columns": [c_label for _c, c_label in cols], "rows": rows})
    return out


def _num(v: Any) -> float | None:
    if v in (None, ""):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def shares_error(rows: list[dict[str, Any]]) -> str | None:
    """Death-benefit shares: empty for everyone, or they add up to exactly 100."""
    shares = [_num(r.get("beneficiary_share")) for r in rows or []]
    given = [s for s in shares if s]
    if not given:
        return None
    if any(s < 0 for s in given):
        return "A beneficiary share can't be negative."
    if round(sum(given), 2) != 100:
        return f"Beneficiary shares must add up to 100%. They add up to {sum(given):g}%."
    return None


def dependant_errors(row: dict[str, Any], today: Any) -> list[str]:
    from datetime import date

    errs = []
    if not str(row.get("full_name") or "").strip():
        errs.append("Give the dependant's full name.")
    if row.get("relationship") not in RELATIONSHIPS:
        errs.append("Choose the relationship: " + ", ".join(RELATIONSHIPS).lower() + ".")
    dob = row.get("date_of_birth")
    if dob not in (None, ""):
        try:
            born = dob if isinstance(dob, date) else date.fromisoformat(str(dob)[:10])
        except ValueError:
            errs.append("The date of birth isn't a date.")
        else:
            if born > (today if isinstance(today, date) else date.fromisoformat(str(today)[:10])):
                errs.append("The date of birth can't be in the future.")
    share = row.get("beneficiary_share")
    if share not in (None, "") and (_num(share) is None or not 0 <= float(share) <= 100):
        errs.append("A beneficiary share is a percentage from 0 to 100.")
    return errs


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


def _tables(employee: str, level: int) -> dict[str, list[dict[str, Any]]]:
    import frappe

    out: dict[str, list[dict[str, Any]]] = {}
    for field, _label, cols in LEVELS[level].get("tables", ()):
        if not frappe.get_meta("Employee").has_field(field):
            continue
        out[field] = frappe.get_all(DEPENDANTS, filters={"parent": employee, "parenttype": "Employee", "parentfield": field},
                                    fields=[c for c, _ in cols], order_by="idx asc", limit=0)
    return out


def _reveal(e: dict[str, Any], lv: int, reason: str) -> dict[str, Any]:
    import frappe
    from frappe.utils import now_datetime

    employee = e["name"]
    meta = frappe.get_meta("Employee")
    existing = [f for f, _ in LEVELS[lv]["fields"] if meta.has_field(f)]
    tables = [f for f, _l, _c in LEVELS[lv].get("tables", ()) if meta.has_field(f)]
    # The log row is written before anything is read, so a view is never unrecorded.
    log = frappe.get_doc(
        {
            "doctype": LOG,
            "employee": employee,
            "employee_name": e["employee_name"],
            "viewer": frappe.session.user,
            "level": LEVELS[lv]["label"],
            "fields": ", ".join(existing + tables),
            "reason": reason.strip(),
            "ip_address": _ip(),
            "viewed_on": now_datetime(),
        }
    )
    log.insert(ignore_permissions=True)
    row = frappe.db.get_value("Employee", employee, existing, as_dict=True) if existing else {}
    out = {
        "employee": employee,
        "employee_name": e["employee_name"],
        "level": lv,
        "level_label": LEVELS[lv]["label"],
        "fields": [f for f in shown(dict(row or {}), lv) if f["field"] in existing],
        "log": log.name,
    }
    if LEVELS[lv].get("tables"):
        out["tables"] = shown_tables(_tables(employee, lv), lv)
    return out


def view_impl(employee: str, level: Any, reason: str) -> dict[str, Any]:
    import frappe

    e = _employee(employee)
    lv = level_of(level)
    roles = _roles()
    own = e.get("user_id") == frappe.session.user
    err = view_error(lv, roles, reason, own)
    if err:
        denied = lv is not None and (lv not in levels_for(roles) or (own and lv == PAY))
        frappe.throw(err, frappe.PermissionError if denied else frappe.ValidationError)
    return _reveal(e, lv, reason)


OWN_REASON = "Viewed own record"


def my_view_impl(level: Any) -> dict[str, Any]:
    """The person's own family and medical details (no reason asked; the view is still logged)."""
    import frappe

    lv = level_of(level)
    if lv not in OWN_LEVELS:
        frappe.throw("You can open your own family and medical details here. Ask HR for anything else.", frappe.PermissionError)
    me = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, ["name", "employee_name", "user_id"], as_dict=True)
    if not me:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    return _reveal(dict(me), lv, OWN_REASON)


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
def my_view(level: Any = FAMILY) -> dict[str, Any]:
    return my_view_impl(level)


@_whitelist
def access_log(employee: str) -> dict[str, Any]:
    return access_log_impl(employee)


@_whitelist
def my_access_log() -> dict[str, Any]:
    return my_access_log_impl()
