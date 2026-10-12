"""
Employee documents (plan 06): required documents per Employment Type, upload, HR verification, expiry alerts.

The required list is a ``Required Document`` table on Employment Type (``custom_required_documents``). It stays
empty until ESWASA says which documents each type of employee must hold and how long they last; nothing here
invents one.

HR uploads for anyone and the row counts as verified by that HR person. A person uploading their own document
(HR included) lands as "To check"; another HR person verifies it. Files are stored by Core's media store (the
same private store as applicant CVs); ``file`` keeps the media key, and only HR or the person get it back.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable

DOCTYPE = "Employee Document"
REQUIRED = "Required Document"
REQUIRED_FIELD = "custom_required_documents"
HR_ROLES = ("HR Manager", "HR User", "System Manager")
VERIFIERS = ("HR Manager", "HR User")
TO_CHECK, VERIFIED = "To check", "Verified"
TYPES = ("ID", "Contract", "Qualification", "Impartiality declaration", "Work permit", "Professional registration", "Other")
RULE = "Document expiry"  # HR Alert rule


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _held(rows: Iterable[dict[str, Any]], today: date | None) -> set[str]:
    """Document types with at least one row that hasn't expired (any row when ``today`` is None)."""
    out = set()
    for r in rows:
        end = _d(r.get("expires_on"))
        if today is None or end is None or end >= today:
            out.add(r.get("document_type"))
    return out


def missing(required: Iterable[dict[str, Any]], held: Iterable[dict[str, Any]], today: date | None = None) -> list[str]:
    """Required document types the person doesn't hold (an expired one counts as missing when ``today`` is given)."""
    have = _held(list(held), today)
    out: list[str] = []
    for r in required:
        t = r.get("document_type")
        if t and t not in have and t not in out:
            out.append(t)
    return out


def expiring(rows: Iterable[dict[str, Any]], today: date, days: int) -> list[dict[str, Any]]:
    """Rows expiring within ``days`` (already expired included), soonest first, with ``days_left``."""
    out = []
    for r in rows:
        end = _d(r.get("expires_on"))
        if end is not None and end <= today + timedelta(days=days):
            out.append({**r, "days_left": (end - today).days})
    return sorted(out, key=lambda r: r["days_left"])


def thresholds(alert_days: Any) -> list[int]:
    """When to alert: at ``alert_days`` before expiry (if ESWASA set one) and on the day it expires."""
    try:
        n = int(alert_days or 0)
    except (TypeError, ValueError):
        n = 0
    return sorted({n, 0} if n > 0 else {0}, reverse=True)


def threshold_now(expires_on: Any, today: date, alert_days: Any) -> int | None:
    """The smallest threshold already reached, or None if it's too early. One alert per threshold (the key carries it)."""
    end = _d(expires_on)
    if end is None:
        return None
    left = (end - today).days
    reached = [t for t in thresholds(alert_days) if left <= t]
    return min(reached) if reached else None


def alert_title(employee_name: str, document_type: str, expires_on: Any, threshold: int) -> str:
    end = _d(expires_on)
    when = f"{end.day} {end.strftime('%b %Y')}" if end else "soon"
    if threshold == 0:
        return f"{document_type} for {employee_name} expired on {when}"
    return f"{document_type} for {employee_name} expires on {when}"


def initial_status(is_hr: bool, own: bool) -> str:
    """HR uploading for someone else has checked it; anyone uploading their own needs another person to verify."""
    return VERIFIED if is_hr and not own else TO_CHECK


def upload_error(is_hr: bool, own: bool, document_type: str | None, file: str | None, expires_on: Any, today: date) -> str | None:
    if not (is_hr or own):
        return "You can only add documents to your own record."
    if document_type not in TYPES:
        return "Choose what kind of document this is."
    if not (file or "").strip():
        return "Attach the file."
    try:
        end = _d(expires_on)
    except ValueError:
        return "The expiry date isn't a date."
    if end is not None and end < today:
        return "This document has already expired. Upload the current one."
    return None


def verify_error(user: str, roles: Iterable[str], uploader: str | None, status: str | None) -> str | None:
    if not set(roles or ()) & set(VERIFIERS):
        return "Only HR can verify documents."
    if (status or TO_CHECK) == VERIFIED:
        return "This document is already verified."
    if uploader and uploader == user:
        return "You uploaded this, so someone else in HR must verify it."
    return None


def doc_row(r: dict[str, Any], show_file: bool, today: date, required: Iterable[str] = ()) -> dict[str, Any]:
    end = _d(r.get("expires_on"))
    status = r.get("status") or TO_CHECK
    if end is not None and end < today:
        status = "Expired"
    return {
        "id": r.get("name"),
        "employee": r.get("employee"),
        "document_type": r.get("document_type"),
        "expires_on": end.isoformat() if end else None,
        "status": status,
        "required": r.get("document_type") in set(required),
        "uploaded_by": r.get("owner"),
        "uploaded_on": str(r.get("creation"))[:10] if r.get("creation") else None,
        "verified_by": r.get("verified_by"),
        "file": r.get("file") if show_file else None,
    }


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _employee(employee: str) -> dict[str, Any]:
    import frappe

    e = frappe.db.get_value("Employee", employee, ["name", "employee_name", "user_id", "employment_type", "status"], as_dict=True)
    if not e:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    return dict(e)


def _me() -> str | None:
    import frappe

    return frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name")


def _access(employee: str) -> str | None:
    """"hr", "self", "manager" or None for the signed-in user (eswasa_hr.scope)."""
    from eswasa_hr.scope import viewer_for

    v = viewer_for()
    if v.hr:
        return "hr"
    if v.employee and v.employee == employee:
        return "self"
    if employee in v.reports:
        return "manager"
    return None


def required_for(employment_type: str | None) -> list[dict[str, Any]]:
    import frappe

    if not employment_type or not frappe.db.exists("DocType", REQUIRED):
        return []
    return frappe.get_all(
        REQUIRED,
        filters={"parent": employment_type, "parenttype": "Employment Type", "parentfield": REQUIRED_FIELD},
        fields=["document_type", "expires", "alert_days"],
        limit=0,
    )


def required_count() -> int:
    """Employment Types with at least one required document (HR setup, H14)."""
    import frappe

    if not frappe.db.exists("DocType", REQUIRED):
        return 0
    rows = frappe.get_all(REQUIRED, filters={"parenttype": "Employment Type", "parentfield": REQUIRED_FIELD}, fields=["parent"], limit=0)
    return len({r.get("parent") for r in rows})


def _rows(employee: str) -> list[dict[str, Any]]:
    import frappe

    if not frappe.db.exists("DocType", DOCTYPE):
        return []
    return frappe.get_all(
        DOCTYPE,
        filters={"employee": employee},
        fields=["name", "employee", "document_type", "file", "expires_on", "status", "verified_by", "owner", "creation"],
        order_by="creation desc",
        limit=0,
    )


def rows_for(employee: str, show_file: bool) -> dict[str, Any]:
    """Documents and the required ones still missing. The file only for HR or the person."""
    e = _employee(employee)
    day = _today()
    required = required_for(e.get("employment_type"))
    held = _rows(employee)
    types = [r["document_type"] for r in required]
    return {
        "employee": employee,
        "employee_name": e["employee_name"],
        "items": [doc_row(r, show_file, day, types) for r in held],
        "missing": missing(required, held, day),
        "required_set": bool(required),
        "types": list(TYPES),
    }


def list_impl(employee: str) -> dict[str, Any]:
    import frappe

    kind = _access(employee)
    if not kind:
        frappe.throw("You can only see your own documents and your team's.", frappe.PermissionError)
    return rows_for(employee, show_file=kind in ("hr", "self"))


def mine_impl() -> dict[str, Any]:
    import frappe

    me = _me()
    if not me:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    return rows_for(me, show_file=True)


def upload_impl(employee: str, document_type: str, file: str, expires_on: str | None = None) -> dict[str, Any]:
    import frappe

    from eswasa_hr.scope import is_hr

    e = _employee(employee)
    hr = is_hr(frappe.get_roles())
    own = bool(e.get("user_id")) and e.get("user_id") == frappe.session.user
    err = upload_error(hr, own, document_type, file, expires_on, _today())
    if err:
        frappe.throw(err, frappe.PermissionError if not (hr or own) else frappe.ValidationError)
    status = initial_status(hr, own)
    doc = frappe.get_doc(
        {
            "doctype": DOCTYPE,
            "employee": employee,
            "document_type": document_type,
            "file": file.strip(),
            "expires_on": expires_on or None,
            "status": status,
            "verified_by": frappe.session.user if status == VERIFIED else None,
        }
    )
    doc.insert(ignore_permissions=True)
    return rows_for(employee, show_file=True)


def hr_people(exclude: str | None = None) -> list[str]:
    """Enabled users with HR Manager or HR User, by name (never a role pool), minus ``exclude``."""
    import frappe

    users = {r.get("parent") for r in frappe.get_all("Has Role", filters={"role": ["in", list(VERIFIERS)], "parenttype": "User"}, fields=["parent"], limit=0)}
    users -= {"Administrator", "Guest", exclude}
    if not users:
        return []
    return sorted(u.get("name") for u in frappe.get_all("User", filters={"name": ["in", sorted(users)], "enabled": 1}, fields=["name"], limit=0))


def verify_impl(name: str) -> dict[str, Any]:
    import frappe

    row = frappe.db.get_value(DOCTYPE, name, ["name", "employee", "owner", "status"], as_dict=True)
    if not row:
        frappe.throw("Document not found.", frappe.DoesNotExistError)
    err = verify_error(frappe.session.user, frappe.get_roles(), row.get("owner"), row.get("status"))
    if err:
        frappe.throw(err, frappe.ValidationError if "already" in err else frappe.PermissionError)
    frappe.db.set_value(DOCTYPE, name, {"status": VERIFIED, "verified_by": frappe.session.user})
    return rows_for(row["employee"], show_file=True)


def file_impl(name: str) -> dict[str, Any]:
    """The stored file key, for HR or the person only (Core streams it and audits the view)."""
    import frappe

    row = frappe.db.get_value(DOCTYPE, name, ["name", "employee", "file", "document_type"], as_dict=True)
    if not row:
        frappe.throw("Document not found.", frappe.DoesNotExistError)
    if _access(row["employee"]) not in ("hr", "self"):
        frappe.throw("Only HR and the person can open this document.", frappe.PermissionError)
    return {"id": name, "employee": row["employee"], "document_type": row["document_type"], "file": row.get("file")}


def expiry_alerts() -> int:
    """Daily: an HR Alert to the person and HR at the configured days before expiry, and on the day it expires.
    Each threshold is raised once (key ``doc:{name}:{threshold}``)."""
    import frappe

    from eswasa_hr.alerts import raise_alert, recipients

    if not frappe.db.exists("DocType", DOCTYPE) or not frappe.db.exists("DocType", "HR Alert"):
        return 0
    day = _today()
    staff = {e["name"]: e for e in frappe.get_all("Employee", filters={"status": "Active"}, fields=["name", "employee_name", "user_id", "employment_type"], limit=0)}
    days_by_type: dict[str, dict[str, Any]] = {}
    hr = hr_people()
    n = 0
    for r in frappe.get_all(DOCTYPE, filters={"expires_on": ["is", "set"]}, fields=["name", "employee", "document_type", "expires_on"], limit=0):
        e = staff.get(r.get("employee"))
        if not e:
            continue
        et = e.get("employment_type") or ""
        if et not in days_by_type:
            days_by_type[et] = {q["document_type"]: q.get("alert_days") for q in required_for(et)}
        t = threshold_now(r["expires_on"], day, days_by_type[et].get(r["document_type"]))
        if t is None:
            continue
        users = recipients(e.get("user_id"), *hr)
        n += raise_alert(f"doc:{r['name']}:{t}", RULE, alert_title(e["employee_name"], r["document_type"], r["expires_on"], t),
                         users, str(r["expires_on"])[:10], e["name"], (DOCTYPE, r["name"]))
    return n


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def documents(employee: str) -> dict[str, Any]:
    return list_impl(employee)


@_whitelist
def my_documents() -> dict[str, Any]:
    return mine_impl()


@_whitelist
def upload(employee: str, document_type: str, file: str, expires_on: str | None = None, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return upload_impl(employee, document_type, file, expires_on)


@_whitelist
def upload_mine(document_type: str, file: str, expires_on: str | None = None, confirm: Any = False) -> dict[str, Any]:
    import frappe

    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    me = _me()
    if not me:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    return upload_impl(me, document_type, file, expires_on)


@_whitelist
def verify(name: str, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return verify_impl(name)


@_whitelist
def file_link(name: str) -> dict[str, Any]:
    return file_impl(name)
