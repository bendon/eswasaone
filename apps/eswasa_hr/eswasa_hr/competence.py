"""
Shared competence / impartiality guards.

Field Visit assignment and Calibration Job assignment must call these —
never a second source of truth. Brief §6.2 / §6.3. ``assignment_error`` (plan 07) is the one entry point:
authorisation on the work date, the yearly declaration, then approved leave.

Certification's auditor_competence_valid asks authorisations.authorised_for_scheme first and falls
back to Auditor Competence only for schemes HR has no competences for yet.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import frappe
from frappe.utils import getdate

from eswasa_hr.declarations import declaration_year


def _as_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return getdate(value)


def is_authorised(employee: str | None, skill: str | None, on_date: date | str | None = None) -> bool:
    """True when a submitted Staff Authorisation covers employee+skill on the date."""
    if not employee or not skill:
        return False
    day = _as_date(on_date) or date.today()
    if not frappe.db.exists("DocType", "Staff Authorisation"):
        return False
    rows = frappe.get_all(
        "Staff Authorisation",
        filters={
            "employee": employee,
            "skill": skill,
            "docstatus": 1,
            "status": ["in", ["Current", "Expiring"]],
        },
        fields=["valid_from", "valid_to", "status"],
        limit=20,
    )
    for row in rows:
        start = _as_date(row.get("valid_from"))
        end = _as_date(row.get("valid_to"))
        if start and day < start:
            continue
        if end and day > end:
            continue
        return True
    return False


def authorisation_block_reason(
    employee: str | None, skill: str | None, on_date: date | str | None = None
) -> str | None:
    """Plain-language reason when is_authorised is False, else None."""
    if not employee or not skill:
        return "Employee and competence are required."
    if is_authorised(employee, skill, on_date):
        return None
    day = _as_date(on_date) or date.today()
    if not frappe.db.exists("DocType", "Staff Authorisation"):
        return "Staff Authorisation is not installed yet."
    rows = frappe.get_all(
        "Staff Authorisation",
        filters={"employee": employee, "skill": skill},
        fields=["docstatus", "status", "valid_from", "valid_to"],
        order_by="modified desc",
        limit=5,
    )
    if not rows:
        return f"{employee} is not authorised for {skill}."
    row = rows[0]
    if int(row.get("docstatus") or 0) == 0:
        return f"{employee}'s authorisation for {skill} is still in training (not approved)."
    end = _as_date(row.get("valid_to"))
    if end and day > end:
        return (
            f"{employee}'s authorisation for {skill} expired on {end.isoformat()}. "
            "Renew it before assigning this work."
        )
    if end and day <= end:
        return (
            f"{employee}'s authorisation for {skill} expires on {end.isoformat()}, "
            "before or on the work date."
        )
    return f"{employee} is not authorised for {skill} on {day.isoformat()}."


def has_conflict(employee: str | None, customer: str | None, on_date: date | str | None = None) -> bool:
    """True when the employee has an interest in the customer within two years, or no signed declaration."""
    if not employee:
        return True
    day = _as_date(on_date) or date.today()
    year = declaration_year(day)
    if not frappe.db.exists("DocType", "Impartiality Declaration"):
        return True
    decl = frappe.db.get_value(
        "Impartiality Declaration",
        {"employee": employee, "year": year, "docstatus": 1},
        ["name", "signed_on"],
        as_dict=True,
    )
    if not decl:
        return True
    if not customer:
        return False
    # Child table interests — look back two years
    if not frappe.db.exists("DocType", "Impartiality Interest"):
        return False
    interests = frappe.get_all(
        "Impartiality Interest",
        filters={"parent": decl.name, "organisation": customer},
        fields=["from_date", "to_date"],
        limit=20,
    )
    cutoff = date(day.year - 2, day.month, day.day)
    for interest in interests:
        to_d = _as_date(interest.get("to_date")) or day
        from_d = _as_date(interest.get("from_date")) or cutoff
        if to_d >= cutoff and from_d <= day:
            return True
    return False


# ---------------------------------------------------------------- assignment guards (plan 07 steps 1–4, plan 03 step 5)

CALIBRATION_KIND = "Calibration"


def assignment_error(
    user: str | None,
    on: date | str | None = None,
    until: date | str | None = None,
    scheme: str | None = None,
    party: str | None = None,
    kind: str | None = None,
    work: str = "audit",
) -> str | None:
    """The first refusal for assigning ``user`` to work from ``on`` to ``until``, as a full sentence, or None:
    authorisation on the work dates (when HR has competences for ``scheme``), the signed declaration and any
    declared interest in ``party``, then approved leave."""
    from eswasa_hr.authorisations import authorised_reason
    from eswasa_hr.declarations import can_act
    from eswasa_hr.leave import on_leave_error

    if not user:
        return None
    day = _as_date(on) or getdate(frappe.utils.nowdate())
    if scheme:
        ok, reason = authorised_reason(user, scheme, on=day, until=until, kind=kind, work=work)
        if ok is False:
            return reason
    ok, reason = can_act(user, on=day, party=party)
    if not ok:
        return reason
    leave = on_leave_error(user, day, until or day)
    return f"{leave}, so can't take this {work}." if leave else None


def _changed(doc: Any, fields: tuple[str, ...]) -> bool:
    """New, or one of ``fields`` changed since the last save (later status saves aren't re-checked)."""
    is_new = getattr(doc, "is_new", None)
    if callable(is_new) and is_new():
        return True
    check = getattr(doc, "has_value_changed", None)
    return True if not callable(check) else any(check(f) for f in fields)


def _calibration_client(doc: Any) -> str | None:
    if doc.get("instrument"):
        owner = frappe.db.get_value("Instrument", doc.get("instrument"), "owner_customer")
        if owner:
            return owner
    if doc.get("sample"):
        customer = frappe.db.get_value("Sample", doc.get("sample"), "customer")
        if customer:
            return customer
    return doc.get("client_email")


def validate_calibration_job(doc: Any, method: str | None = None) -> None:
    """doc_events Calibration Job validate (plan 07 step 4), so eswasa_metrology needs no HR import.

    The discipline is the job's Test Method, matched against Skill.custom_scheme on Calibration skills.
    PROVISIONAL until ESWASA's competence catalogue (H7): a method with no HR competence isn't blocked."""
    user = doc.get("assigned_to")
    if not user or not _changed(doc, ("assigned_to", "test_method", "received_on", "due_on")):
        return
    today = getdate(frappe.utils.nowdate())
    start = max(_as_date(doc.get("received_on")) or today, today)
    end = max(_as_date(doc.get("due_on")) or start, start)
    reason = assignment_error(
        user, start, end, scheme=doc.get("test_method"), party=_calibration_client(doc), kind=CALIBRATION_KIND, work="calibration job"
    )
    if reason:
        frappe.throw(reason, frappe.ValidationError)
