"""
Certificate of service (plan 06): a factual letter for leavers (and staff who ask) from the print format
``Certificate of Service`` on Employee.

It prints the name, staff number, the posts held with their dates (from promotion and transfer history), the
date of joining and the last day. Never pay and never the reason for leaving. ESWASA supplies the wording (a
``Terms and Conditions`` record "Certificate of service"); until then the letter says the wording is awaited.
The signatory is the offer-letter signatory role (H3, provisional). HR only; every print is recorded on the
employee's timeline.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any

FORMAT = "Certificate of Service"
TERMS = "Certificate of service"  # Terms and Conditions record holding ESWASA HR's wording
WORDING_AWAITING = "Certificate wording: awaiting ESWASA HR."
FIELDS = ("employee_name", "employee_number", "designation", "date_of_joining", "relieving_date", "status")
NEVER = ("ctc", "salary_currency", "salary_mode", "bank_name", "bank_ac_no", "iban", "reason_for_leaving", "custom_reason")


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _iso(v: Any) -> str | None:
    d = _d(v)
    return d.isoformat() if d else None


def posts_held(joined: Any, last_day: Any, current: str | None, moves: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Posts with from/to dates. ``moves`` are submitted designation changes: {date, current, new}, any order.
    The first post is the oldest ``current`` (or today's designation if it never changed)."""
    moves = sorted((m for m in moves if _d(m.get("date")) and m.get("new")), key=lambda m: _d(m["date"]))
    start = _d(joined)
    first = moves[0].get("current") if moves and moves[0].get("current") else current
    posts: list[dict[str, Any]] = []
    title = first
    for m in moves:
        when = _d(m["date"])
        if title:
            posts.append({"designation": title, "from_date": start.isoformat() if start else None, "to_date": when.isoformat()})
        title, start = m["new"], when
    if title or not posts:
        end = _d(last_day)
        posts.append({"designation": title or current, "from_date": start.isoformat() if start else None, "to_date": end.isoformat() if end else None})
    return posts


def certificate_context(employee: dict[str, Any], posts: list[dict[str, Any]], wording: str | None, signatory: str, signatory_awaiting: bool) -> dict[str, Any]:
    """Everything the certificate prints. Pay and the reason for leaving are never passed through."""
    return {
        "employee_name": employee.get("employee_name"),
        "employee_number": employee.get("employee_number") or employee.get("name"),
        "date_of_joining": _iso(employee.get("date_of_joining")),
        "relieving_date": _iso(employee.get("relieving_date")),
        "still_employed": not employee.get("relieving_date") or employee.get("status") == "Active",
        "posts": posts,
        "wording": wording,
        "wording_awaiting": None if wording else WORDING_AWAITING,
        "signatory": signatory,
        "signatory_awaiting": signatory_awaiting,
    }


# ---------------------------------------------------------------- Frappe glue


def _moves(employee: str) -> list[dict[str, Any]]:
    import frappe

    out = []
    for dt, date_field in (("Employee Promotion", "promotion_date"), ("Employee Transfer", "transfer_date")):
        for r in frappe.get_all(dt, filters={"employee": employee, "docstatus": 1}, fields=["name", date_field], limit=0):
            for h in frappe.get_all("Employee Property History", filters={"parent": r["name"], "fieldname": "designation"}, fields=["current", "new"], limit=0):
                out.append({"date": r.get(date_field), "current": h.get("current"), "new": h.get("new")})
    return out


def certificate_context_for(name: str) -> dict[str, Any]:
    """Jinja method for the ``Certificate of Service`` print format (hooks ``jinja``)."""
    import frappe

    from eswasa_hr.hiring import _signatory, signatory_line

    e = frappe.db.get_value("Employee", name, ["name", *FIELDS], as_dict=True)
    if not e:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    e = dict(e)
    wording = frappe.db.get_value("Terms and Conditions", TERMS, "terms") if frappe.db.exists("Terms and Conditions", TERMS) else None
    role, holder = _signatory()
    posts = posts_held(e.get("date_of_joining"), e.get("relieving_date"), e.get("designation"), _moves(name))
    return certificate_context(e, posts, wording, signatory_line(role, holder), not role)


def certificate_impl(employee: str) -> dict[str, Any]:
    """HR only: the certificate as a PDF (base64 for Core to stream). Each print is recorded on the employee."""
    import base64

    import frappe

    from eswasa_hr.lifecycle import _require_hr

    _require_hr()
    if not frappe.db.exists("Employee", employee):
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    pdf = frappe.get_print("Employee", employee, print_format=FORMAT, as_pdf=True)
    frappe.get_doc("Employee", employee).add_comment("Comment", f"Certificate of service printed by {frappe.session.user}.")
    return {"file_name": f"Certificate of service {employee}.pdf", "content_type": "application/pdf", "content": base64.b64encode(pdf).decode()}


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def certificate(employee: str) -> dict[str, Any]:
    return certificate_impl(employee)
