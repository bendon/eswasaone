"""
The full person record (plan 06, H1b and E5; brief §12.2): job, leave, authorisations, documents, history,
contract and open items for one employee, in one call.

Scoped by ``eswasa_hr.scope``: HR sees anyone, a person themselves, a line manager their reports. Only job
fields are read. Protected fields (``sensitive.LEVELS``, levels 1 and 2) never appear here; they open only
through ``sensitive.view`` with a reason. Document files are returned to HR and the person only.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any

JOB_FIELDS = (
    "name",
    "employee_name",
    "employee_number",
    "department",
    "designation",
    "grade",
    "branch",
    "employment_type",
    "date_of_joining",
    "scheduled_confirmation_date",
    "final_confirmation_date",
    "contract_end_date",
    "relieving_date",
    "reports_to",
    "status",
    "user_id",
    "company_email",
)


# ---------------------------------------------------------------- pure rules


def protected() -> set[str]:
    from eswasa_hr.sensitive import LEVELS

    return {f for spec in LEVELS.values() for f, _ in spec["fields"]}


def _s(v: Any) -> str | None:
    if v in (None, ""):
        return None
    return v.isoformat() if isinstance(v, date) else str(v)


def job_view(row: dict[str, Any]) -> dict[str, Any]:
    """Job fields only; anything protected is dropped even if a caller passed it in."""
    hidden = protected()
    return {k: _s(row.get(k)) for k in JOB_FIELDS if k not in hidden}


def viewer_kind(is_hr: bool, viewer_employee: str | None, subject: str, reports: list[str]) -> str | None:
    if is_hr:
        return "hr"
    if viewer_employee and viewer_employee == subject:
        return "self"
    if subject in (reports or []):
        return "manager"
    return None


def next_leave(rows: list[dict[str, Any]], today: date) -> dict[str, Any] | None:
    """The approved leave that is current or starts soonest."""
    ahead = [r for r in rows if r.get("to_date") and str(r["to_date"])[:10] >= today.isoformat()]
    if not ahead:
        return None
    r = min(ahead, key=lambda r: str(r.get("from_date")))
    return {"leave_type": r.get("leave_type"), "from_date": _s(r.get("from_date")), "to_date": _s(r.get("to_date"))}


def open_items(probation_due: date | None, declaration: str | None, year_label: str | None, appraisal_step: str | None,
               appraisal: str | None, pending_changes: int = 0) -> list[dict[str, Any]]:
    items = []
    if probation_due:
        items.append({"kind": "probation", "title": "Probation review due", "due": probation_due.isoformat(), "reference": None})
    if declaration in ("outstanding", "draft"):
        items.append({"kind": "declaration", "title": f"Impartiality declaration {year_label or ''} not signed".replace("  ", " "), "due": None, "reference": None})
    if appraisal and appraisal_step in ("self", "manager"):
        who = "Self-assessment" if appraisal_step == "self" else "Manager review"
        items.append({"kind": "appraisal", "title": f"{who} not done", "due": None, "reference": appraisal})
    if pending_changes:
        items.append({"kind": "change", "title": f"{pending_changes} change{'s' if pending_changes != 1 else ''} waiting for approval", "due": None, "reference": None})
    return items


def manager_history(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """A line manager sees what changed, not why someone is leaving."""
    return [{**i, "changes": []} if i.get("kind") == "separation" else i for i in items]


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _job(employee: str) -> dict[str, Any]:
    import frappe

    meta = frappe.get_meta("Employee")
    fields = [f for f in JOB_FIELDS if f == "name" or meta.has_field(f)]
    row = frappe.db.get_value("Employee", employee, fields, as_dict=True)
    if not row:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    return dict(row)


def _leave(employee: str, day: date) -> dict[str, Any]:
    import frappe

    from eswasa_hr.leave import balances_impl

    try:
        balances = balances_impl(employee)
    except frappe.PermissionError:
        balances = {"items": [], "awaiting": "H14"}
    rows = frappe.get_all(
        "Leave Application",
        filters={"employee": employee, "status": "Approved", "docstatus": 1, "to_date": [">=", day]},
        fields=["leave_type", "from_date", "to_date"],
        order_by="from_date asc",
        limit=5,
    )
    return {"balances": balances.get("items") or [], "awaiting": balances.get("awaiting"), "next": next_leave(rows, day)}


def _authorisations(employee: str) -> list[dict[str, Any]]:
    import frappe

    from eswasa_hr.authorisations import DOCTYPE, _all_rows

    if not frappe.db.exists("DocType", DOCTYPE):
        return []
    return [r for r in _all_rows({"employee": employee}) if r["status"] != "Withdrawn"]


def _declaration(employee: str, day: date) -> tuple[str | None, str | None]:
    import frappe

    from eswasa_hr import declarations as dec

    if not frappe.db.exists("DocType", dec.DOCTYPE):
        return None, None
    year = dec.declaration_year(day)
    ds = frappe.db.get_value(dec.DOCTYPE, dec._doc_name(employee, year), "docstatus")
    status = "outstanding" if ds is None else "signed" if int(ds) == 1 else "draft"
    return status, dec.year_label(year)


def _appraisal(employee: str, reports_to: str | None) -> tuple[str | None, str | None]:
    import frappe

    from eswasa_hr import performance as perf

    if not frappe.db.exists("DocType", perf.APPRAISAL):
        return None, None
    name = perf._current(employee)
    if not name:
        return None, None
    self_done = bool(float(frappe.db.get_value(perf.APPRAISAL, name, "self_score") or 0))
    return name, perf.step_of(self_done, perf._manager_done(name, reports_to))


def _contract(employee: str, job: dict[str, Any]) -> dict[str, Any]:
    import frappe

    from eswasa_hr.contracts import DOCTYPE, WAITING

    pending = frappe.db.get_value(DOCTYPE, {"employee": employee, "state": WAITING}, "name") if frappe.db.exists("DocType", DOCTYPE) else None
    return {"employment_type": job.get("employment_type"), "contract_end_date": job.get("contract_end_date"), "pending": pending or None}


def record_impl(employee: str) -> dict[str, Any]:
    import frappe

    from eswasa_hr.documents import rows_for
    from eswasa_hr.lifecycle import history
    from eswasa_hr.scope import viewer_for
    from eswasa_hr.team import probation_due

    v = viewer_for()
    kind = viewer_kind(v.hr, v.employee, employee, v.reports)
    if not kind:
        frappe.throw("You can only see your own record and your team's.", frappe.PermissionError)
    job = job_view(_job(employee))
    day = _today()
    if job.get("reports_to"):
        job["reports_to_name"] = frappe.db.get_value("Employee", job["reports_to"], "employee_name")
    hist = history(employee)["items"]
    if kind == "manager":
        hist = manager_history(hist)
    declaration, year = _declaration(employee, day)
    appraisal, step = _appraisal(employee, job.get("reports_to"))
    pending = sum(1 for i in hist if i.get("state") == "Waiting for approval")
    due = probation_due(job.get("scheduled_confirmation_date"), job.get("final_confirmation_date"), day) if job.get("status") == "Active" else None
    docs = rows_for(employee, show_file=kind in ("hr", "self"))
    return {
        **job,
        "id": job["name"],
        "viewer": kind,
        "job": job,
        "leave": _leave(employee, day),
        "authorisations": _authorisations(employee),
        "documents": {"items": docs["items"], "missing": docs["missing"], "required_set": docs["required_set"]},
        "history": hist,
        "contract": _contract(employee, job),
        "open_items": open_items(due, declaration, year, step, appraisal, pending),
    }


def my_record_impl() -> dict[str, Any]:
    import frappe

    me = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not me:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    return record_impl(me)


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def record(employee: str) -> dict[str, Any]:
    return record_impl(employee)


@_whitelist
def my_record() -> dict[str, Any]:
    return my_record_impl()
