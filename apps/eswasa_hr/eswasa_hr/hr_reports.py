"""
HR reports and export (HR additions plan 07, screen H16).

One catalogue, ``REPORTS``: each report says who may run it, whether line managers may run it for their own
reports (``team_scoped``), its filters and columns, and a ``rows(filters, scope)`` function. The screen runs a
report as JSON; an export writes the same rows as CSV or XLSX.

- **Permission-checked here, never in Core.** HR roles run the reports listed for them; a line manager (anyone
  with reports) runs only the team-scoped ones, narrowed to their direct and indirect reports.
- **Every export is logged** as an ``HR Access Log`` row (level "Report export", ``fields`` = report id and
  filters) **before** the rows are read. An export that includes names needs a reason; a counts-only export
  (the disciplinary register) doesn't.
- **No protected field, ever.** ``no_sensitive`` runs over every report's columns at import time: a column keyed
  like a field in ``sensitive.LEVELS`` (personal, pay and bank, family and medical) stops the module loading.
  No report reads pay. The disciplinary register is counts only: no names, no allegation, no outcome text.
- **Never a fake report.** A report appears only when the plan that owns its data is built (01, 02, 05 and 08
  are). An empty result is an empty table, not sample rows.
- CSV is RFC 4180 (``\r\n``, quotes doubled), UTF-8 with a BOM so Excel opens it as UTF-8. Text that starts with
  ``=``, ``+``, ``-``, ``@``, tab or carriage return gets a leading ``'`` in CSV and XLSX alike, so a spreadsheet
  never runs it as a formula.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Callable, Iterable

from eswasa_hr import sensitive

HR_ROLES = ("HR Manager", "HR User", "System Manager")
MANAGER_ROLES = ("HR Manager", "System Manager")
LOG_LEVEL = "Report export"  # HR Access Log.level option
SCREEN_CAP = 5000  # rows the screen gets; the export has no cap
FORMATS = {
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
NAME_KEYS = ("employee", "employee_name")  # a report with either column names people, so its export needs a reason
FORMULA_START = ("=", "+", "-", "@", "\t", "\r")
GROUPS = ("People", "Time off", "Competence and training", "Movements", "Cases")


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def col(key: str, label: str, type_: str = "text") -> dict[str, str]:
    """A column: ``type`` is text, date, number or percent (the screen aligns and sorts by it)."""
    return {"key": key, "label": label, "type": type_}


def flt(key: str, label: str, type_: str, default: Any = None, options: Any = None) -> dict[str, Any]:
    """A filter: ``type`` is department, date, number or select. ``options`` is a list, or a name in ``OPTIONS``
    filled in from the site when the catalogue is read."""
    return {"key": key, "label": label, "type": type_, "default": default, "options": options}


def has_names(columns: Iterable[dict[str, Any]]) -> bool:
    return any(c["key"] in NAME_KEYS for c in columns)


def no_sensitive(columns: Iterable[dict[str, Any]]) -> None:
    """Raise if any column is keyed like a protected Employee field (any level, tables included)."""
    bad = sorted({c["key"] for c in columns} & set(sensitive.protected_labels()))
    if bad:
        raise ValueError(f"A report may not include protected fields: {', '.join(bad)}.")


def allowed(report: dict[str, Any], roles: Iterable[str], has_reports: bool = False) -> bool:
    """HR roles listed on the report run it in full; a line manager runs a team-scoped report for their reports."""
    return bool(set(roles or ()) & set(report["roles"])) or bool(report.get("team_scoped") and has_reports)


@dataclass
class Scope:
    """Whose rows a viewer may get: ``people is None`` means everyone (HR); otherwise these employees only."""

    people: list[str] | None = None
    label: str = "all"

    @property
    def team(self) -> bool:
        return self.people is not None


def apply_scope(rows: list[dict[str, Any]], scope: Scope | None) -> list[dict[str, Any]]:
    if scope is None or scope.people is None:
        return rows
    mine = set(scope.people)
    return [r for r in rows if r.get("employee") in mine]


def safe_cell(value: Any) -> Any:
    """Text a spreadsheet would run as a formula gets a leading apostrophe; numbers and dates pass through."""
    if isinstance(value, str) and value.startswith(FORMULA_START):
        return "'" + value
    return value


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def to_csv(columns: list[dict[str, Any]], rows: list[dict[str, Any]]) -> bytes:
    """RFC 4180 CSV with a header of column labels, UTF-8 with a BOM, formula-guarded."""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n", quoting=csv.QUOTE_MINIMAL)
    w.writerow([safe_cell(c["label"]) for c in columns])
    for r in rows:
        w.writerow([safe_cell(_text(r.get(c["key"]))) for c in columns])
    return ("﻿" + buf.getvalue()).encode("utf-8")


def to_xlsx(columns: list[dict[str, Any]], rows: list[dict[str, Any]], title: str = "Report") -> bytes:
    """One sheet, header row of labels, formula-guarded text (openpyxl would store "=..." as a formula)."""
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "".join(ch for ch in title if ch not in "[]:*?/\\")[:31] or "Report"
    ws.append([c["label"] for c in columns])
    for r in rows:
        out = []
        for c in columns:
            v = r.get(c["key"])
            if c["type"] == "date" and v:
                v = _d(v)
            elif isinstance(v, bool):
                v = "Yes" if v else "No"
            out.append(safe_cell(v))
        ws.append(out)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def parse_filters(raw: Any) -> dict[str, Any]:
    if raw in (None, ""):
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return {}
    return {k: v for k, v in dict(raw).items() if v not in (None, "")} if isinstance(raw, dict) else {}


def clean_filters(report: dict[str, Any], raw: Any, today: date) -> tuple[dict[str, Any], list[str]]:
    """The report's filters with defaults applied and types checked; unknown keys dropped. (values, errors)."""
    given = parse_filters(raw)
    out: dict[str, Any] = {}
    errs: list[str] = []
    for f in report["filters"]:
        k = f["key"]
        v = given.get(k, f["default"](today) if callable(f["default"]) else f["default"])
        if v in (None, ""):
            continue
        if f["type"] == "date":
            try:
                v = _d(v).isoformat()
            except ValueError:
                errs.append(f"{f['label']} isn't a date.")
                continue
        elif f["type"] == "number":
            try:
                v = int(v)
            except (TypeError, ValueError):
                errs.append(f"{f['label']} must be a whole number.")
                continue
            if v < 0:
                errs.append(f"{f['label']} can't be negative.")
                continue
        elif f["type"] == "select" and isinstance(f["options"], (list, tuple)) and v not in f["options"]:
            errs.append(f"Choose {f['label'].lower()} from the list.")
            continue
        out[k] = str(v) if f["type"] in ("department", "select") else v
    if out.get("from_date") and out.get("to_date") and out["from_date"] > out["to_date"]:
        errs.append("The start date is after the end date.")
    return out, errs


def export_error(report: dict[str, Any], reason: str | None, fmt: str) -> str | None:
    if fmt not in FORMATS:
        return "Choose CSV or Excel."
    if has_names(report["columns"]) and len((reason or "").strip()) < sensitive.MIN_REASON:
        return "This export names people. Say why you need it (at least 10 characters). It is recorded."
    return None


def file_name(report_id: str, fmt: str, day: date) -> str:
    return f"eswasa-hr-{report_id}-{day.isoformat()}.{fmt}"


def log_fields(report_id: str, filters: dict[str, Any], scope: Scope | None) -> str:
    """The access-log ``fields`` text: report id, filters, and "team" when narrowed to a manager's reports."""
    extra = " (team)" if scope is not None and scope.team else ""
    return f"{report_id}{extra} {json.dumps(filters, sort_keys=True, default=str)}"


def years_between(start: Any, day: date) -> float | None:
    s = _d(start)
    if s is None or s > day:
        return None
    return round((day - s).days / 365.25, 1)


BANDS = ((1, "Under 1 year"), (3, "1 to 2 years"), (6, "3 to 5 years"), (11, "6 to 10 years"), (21, "11 to 20 years"))


def service_band(years: float | None) -> str | None:
    """Reporting bands (a grouping for the table, not an ESWASA rule)."""
    if years is None:
        return None
    for below, label in BANDS:
        if years < below:
            return label
    return "21 years or more"


def month_of(v: Any) -> str | None:
    d = _d(v)
    return d.strftime("%Y-%m") if d else None


def count_by(rows: Iterable[dict[str, Any]], keys: tuple[str, ...]) -> list[dict[str, Any]]:
    """Group rows by ``keys`` and count them: ``[{**keys, "cases": n}]``, sorted by the keys."""
    out: dict[tuple, int] = {}
    for r in rows:
        k = tuple(r.get(x) or "" for x in keys)
        out[k] = out.get(k, 0) + 1
    return [{**dict(zip(keys, k)), "cases": n} for k, n in sorted(out.items())]


def pct(part: Any, whole: Any) -> float | None:
    return round(float(part) / float(whole) * 100, 1) if whole else None


def summary_item(label: str, value: Any) -> dict[str, Any]:
    return {"label": label, "value": value}


# ---------------------------------------------------------------- Frappe glue: report rows


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _has(dt: str) -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", dt))


def _employees(filters: dict[str, Any], fields: list[str]) -> list[dict[str, Any]]:
    import frappe

    from eswasa_hr import settings

    return [dict(r) for r in frappe.get_all("Employee", filters=settings.live(filters), fields=fields, order_by="employee_name asc", limit=0)]


def _names(employees: Iterable[str]) -> dict[str, dict[str, Any]]:
    import frappe

    names = sorted({e for e in employees if e})
    if not names:
        return {}
    return {r["name"]: dict(r) for r in frappe.get_all("Employee", filters={"name": ["in", names]}, fields=["name", "employee_name", "department"], limit=0)}


def _dept(f: dict[str, Any]) -> dict[str, Any]:
    return {"department": f["department"]} if f.get("department") else {}


def staff_list_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    rows = _employees({"status": f.get("status") or "Active", **_dept(f)},
                      ["name", "employee_name", "department", "designation", "grade", "employment_type", "branch", "date_of_joining", "reports_to", "status"])
    managers = _names(r.get("reports_to") for r in rows)
    out = [{"employee": r["name"], "employee_name": r.get("employee_name"), "department": r.get("department"), "designation": r.get("designation"),
            "grade": r.get("grade"), "employment_type": r.get("employment_type"), "branch": r.get("branch"),
            "date_of_joining": str(r["date_of_joining"]) if r.get("date_of_joining") else None,
            "reports_to_name": (managers.get(r.get("reports_to")) or {}).get("employee_name"), "status": r.get("status")} for r in rows]
    return {"rows": out}


def leave_taken_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    import frappe

    if not _has("Leave Application"):
        return {"rows": []}
    filters: dict[str, Any] = {"docstatus": 1, "status": "Approved", "from_date": ["between", [f["from_date"], f["to_date"]]], **_dept(f)}
    if f.get("leave_type"):
        filters["leave_type"] = f["leave_type"]
    apps = frappe.get_all("Leave Application", filters=filters, fields=["employee", "employee_name", "department", "leave_type", "total_leave_days"], limit=0)
    by: dict[tuple, dict[str, Any]] = {}
    for a in apps:
        r = by.setdefault((a.get("employee_name") or "", a.get("employee"), a.get("leave_type")), {
            "employee": a.get("employee"), "employee_name": a.get("employee_name"), "department": a.get("department"),
            "leave_type": a.get("leave_type"), "requests": 0, "days": 0.0})
        r["requests"] += 1
        r["days"] += float(a.get("total_leave_days") or 0)
    rows = [by[k] for k in sorted(by)]
    days = sum(r["days"] for r in apply_scope(rows, scope))
    return {"rows": rows, "summary": [summary_item("Days taken", days)],
            "note": "Approved leave that starts in the date range, in working days as HRMS counted them."}


def leave_owed_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    """Days left per person and leave type from the Leave Ledger. Days only: no encashment value, no pay."""
    import frappe

    from eswasa_hr.leave import balance_rows

    try:
        from hrms.hr.doctype.leave_application.leave_application import get_leave_details
    except ImportError:
        return {"rows": [], "note": "HRMS isn't installed, so there are no leave balances."}
    day = _today().isoformat()
    people = _employees({"status": "Active", **_dept(f)}, ["name", "employee_name", "department"])
    types = {t["name"]: t for t in frappe.get_all("Leave Type", fields=["name", "allow_encashment", "is_carry_forward", "maximum_carry_forwarded_leaves"], limit=0)}
    rows = []
    for p in people:
        allocation = (get_leave_details(p["name"], day) or {}).get("leave_allocation") or {}
        for b in balance_rows(allocation, types):
            if f.get("leave_type") and b["leave_type"] != f["leave_type"]:
                continue
            rows.append({"employee": p["name"], "employee_name": p.get("employee_name"), "department": p.get("department"), "leave_type": b["leave_type"],
                         "allocated": b["allocated"], "used": b["used"], "pending": b["pending"], "balance": b["balance"]})
    return {"rows": rows, "note": f"Balances on {day}, in days."}


def length_of_service_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    from eswasa_hr.milestones import next_milestone, years_set

    day = _today()
    years = years_set()
    rows = []
    for p in _employees({"status": "Active", **_dept(f)}, ["name", "employee_name", "department", "designation", "date_of_joining"]):
        served = years_between(p.get("date_of_joining"), day)
        band = service_band(served)
        if f.get("band") and band != f["band"]:
            continue
        nxt = next_milestone(p.get("date_of_joining"), years, day) if years else None
        rows.append({"employee": p["name"], "employee_name": p.get("employee_name"), "department": p.get("department"), "designation": p.get("designation"),
                     "date_of_joining": str(p["date_of_joining"]) if p.get("date_of_joining") else None, "years": served, "band": band,
                     "next_milestone": nxt["years"] if nxt else None, "next_milestone_on": nxt["date"] if nxt else None})
    shown = [r["years"] for r in rows if r["years"] is not None]
    out: dict[str, Any] = {"rows": rows, "summary": [summary_item("Average years of service", round(sum(shown) / len(shown), 1) if shown else None)]}
    if not years:
        out["note"] = "Milestone years not set (awaiting ESWASA A8), so no next milestone is shown."
    return out


def movements_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    import frappe

    from eswasa_hr import settings
    from eswasa_hr.overview import turnover_pct

    a, b = f["from_date"], f["to_date"]
    rows: list[dict[str, Any]] = []
    fields = ["name", "employee_name", "department", "designation", "date_of_joining", "relieving_date"]
    for p in _employees({"date_of_joining": ["between", [a, b]], **_dept(f)}, fields):
        rows.append({"movement": "Joiner", "on": str(p["date_of_joining"]), "employee": p["name"], "employee_name": p.get("employee_name"),
                     "department": p.get("department"), "detail": p.get("designation")})
    for p in _employees({"relieving_date": ["between", [a, b]], **_dept(f)}, fields):
        rows.append({"movement": "Leaver", "on": str(p["relieving_date"]), "employee": p["name"], "employee_name": p.get("employee_name"),
                     "department": p.get("department"), "detail": p.get("designation")})
    child = "Employee Property History"
    for dt, kind, when in (("Employee Promotion", "Promotion", "promotion_date"), ("Employee Transfer", "Transfer", "transfer_date")):
        if not _has(dt):
            continue
        docs = frappe.get_all(dt, filters={"docstatus": 1, when: ["between", [a, b]], **_dept(f)}, fields=["name", "employee", "employee_name", "department", when], limit=0)
        details: dict[str, list[str]] = {}
        if docs and _has(child):
            for h in frappe.get_all(child, filters={"parenttype": dt, "parent": ["in", [d["name"] for d in docs]]},
                                    fields=["parent", "fieldname", "property", "current", "new"], limit=0):
                if (h.get("fieldname") or "") in MOVEMENT_FIELDS:  # job fields only: never a pay figure
                    details.setdefault(h["parent"], []).append(f"{h['property']}: {h.get('current') or '-'} to {h.get('new') or '-'}")
        for d in docs:
            rows.append({"movement": kind, "on": str(d[when]), "employee": d.get("employee"), "employee_name": d.get("employee_name"),
                         "department": d.get("department"), "detail": "; ".join(details.get(d["name"], []))})
    rows.sort(key=lambda r: (r["on"], r["movement"], r.get("employee_name") or ""))
    headcount = frappe.db.count("Employee", settings.live({"status": "Active", **_dept(f)}))
    n = {k: sum(1 for r in rows if r["movement"] == k) for k in ("Joiner", "Leaver", "Promotion", "Transfer")}
    return {"rows": rows, "summary": [summary_item("Joiners", n["Joiner"]), summary_item("Leavers", n["Leaver"]), summary_item("Promotions", n["Promotion"]),
                                      summary_item("Transfers", n["Transfer"]), summary_item("Turnover %", turnover_pct(n["Leaver"], headcount, n["Joiner"]))],
            "note": "Turnover is leavers in the range over the average of headcount at its start and today."}


MOVEMENT_FIELDS = ("designation", "department", "grade", "branch", "reports_to", "employment_type")  # Employee Property History


def expiring_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    import frappe

    day = _today()
    end = day + timedelta(days=int(f.get("days") or 0))
    kinds = [f["kind"]] if f.get("kind") else list(EXPIRY_KINDS)
    rows: list[dict[str, Any]] = []

    def add(kind: str, employee: str | None, what: str | None, on: Any, name_of: dict[str, dict[str, Any]]) -> None:
        p = name_of.get(employee) or {}
        if f.get("department") and p.get("department") != f["department"]:
            return
        rows.append({"kind": kind, "employee": employee, "employee_name": p.get("employee_name"), "department": p.get("department"),
                     "what": what, "expires_on": str(_d(on)), "days_left": (_d(on) - day).days})

    window = ["between", [day.isoformat(), end.isoformat()]]
    if "Contract" in kinds:
        for p in _employees({"status": "Active", "contract_end_date": window, **_dept(f)}, ["name", "employee_name", "department", "employment_type", "contract_end_date"]):
            add("Contract", p["name"], p.get("employment_type") or "Contract", p["contract_end_date"], {p["name"]: p})
    if "Authorisation" in kinds and _has("Staff Authorisation"):
        auths = frappe.get_all("Staff Authorisation", filters={"docstatus": 1, "employee": ["is", "set"], "status": ["!=", "Withdrawn"], "valid_to": window},
                               fields=["employee", "skill", "valid_to"], limit=0)
        who = _names(a["employee"] for a in auths)
        for a in auths:
            add("Authorisation", a["employee"], a.get("skill"), a["valid_to"], who)
    if "Document" in kinds and _has("Employee Document"):
        docs = frappe.get_all("Employee Document", filters={"expires_on": window}, fields=["employee", "document_type", "expires_on"], limit=0)
        who = _names(d.get("employee") for d in docs)
        for d in docs:
            if d.get("employee") in who:
                add("Document", d["employee"], d.get("document_type"), d["expires_on"], who)
    rows.sort(key=lambda r: (r["expires_on"], r["kind"], r.get("employee_name") or ""))
    return {"rows": rows, "note": f"Expiring from {day.isoformat()} to {end.isoformat()}. External people's authorisations are on the competence register."}


EXPIRY_KINDS = ("Contract", "Authorisation", "Document")


def training_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    """Per training event: nominees, attended, and direct and indirect cost (plan 05). No names."""
    import frappe

    from eswasa_hr import training_plan as tp

    if not _has(tp.EVENT):
        return {"rows": []}
    filters = {"start_time": ["between", [f["from_date"], f["to_date"] + " 23:59:59"]]}
    events = frappe.get_all(tp.EVENT, filters=filters, fields=["name"], order_by="start_time asc", limit=0)
    full = tp._events(e["name"] for e in events)
    rows = []
    for e in events:
        ev = full.get(e["name"]) or {}
        nominees = tp._nominees(e["name"])
        direct, indirect = tp._num(ev.get("custom_direct_cost")), tp._num(ev.get("custom_indirect_cost"))
        rows.append({"event": e["name"], "event_name": ev.get("event_name"), "status": ev.get("event_status"),
                     "start": str(ev.get("start_time") or "")[:10] or None, "nominees": len(nominees),
                     "attended": sum(1 for n in nominees if n.get("present")), "direct_cost": direct, "indirect_cost": indirect, "total_cost": direct + indirect})
    return {"rows": rows, "summary": [summary_item("Attended", sum(r["attended"] for r in rows)), summary_item("Direct cost", sum(r["direct_cost"] for r in rows)),
                                      summary_item("Indirect cost", sum(r["indirect_cost"] for r in rows))],
            "note": "Cost is recorded only; nothing posts to accounts (ESWASA A6, provisional)."}


def items_out_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    from eswasa_hr.issued_items import register_impl

    reg = register_impl("out", f.get("item_type"), f.get("department"), "1" if f.get("overdue") == "Overdue only" else None)
    rows = [{"employee": r.get("employee"), "employee_name": r.get("employee_name"), "department": r.get("department"), "item_type": r.get("item_type"),
             "tag": r.get("tag"), "issued_on": r.get("issued_on"), "return_due": r.get("return_due"), "status": r.get("status"), "overdue": bool(r.get("overdue"))}
            for r in reg["items"]]
    return {"rows": rows, "summary": [summary_item("Out", len(rows)), summary_item("Overdue", sum(1 for r in rows if r["overdue"]))]}


def disciplinary_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    """Counts by month, offence level and sanction. Never a name, an allegation or an outcome text (plan 01)."""
    import frappe

    if not _has("Disciplinary Case"):
        return {"rows": []}
    cases = frappe.get_all("Disciplinary Case", filters={"opened_on": ["between", [f["from_date"], f["to_date"]]]},
                           fields=["opened_on", "offence", "sanction"], limit=0)
    levels = {}
    offences = sorted({c.get("offence") for c in cases if c.get("offence")})
    if offences and _has("Disciplinary Offence"):
        levels = {o["name"]: o.get("level") for o in frappe.get_all("Disciplinary Offence", filters={"name": ["in", offences]}, fields=["name", "level"], limit=0)}
    rows = count_by(({"month": month_of(c.get("opened_on")), "level": levels.get(c.get("offence")) or "No offence recorded",
                      "sanction": c.get("sanction") or "No outcome yet"} for c in cases), ("month", "level", "sanction"))
    return {"rows": rows, "summary": [summary_item("Cases", len(cases))]}


def declarations_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    import frappe

    from eswasa_hr import declarations as dec

    if not _has(dec.DOCTYPE):
        return {"rows": []}
    y = int(f.get("year") or dec.declaration_year(_today()))
    staff = _employees({"status": "Active", **_dept(f)}, ["name", "employee_name", "department"]) + \
        [x for x in dec._externals() if not f.get("department") or x.get("department") == f["department"]]
    signed = {(r.get("employee") or r.get("external_person")): r.get("signed_on")
              for r in frappe.get_all(dec.DOCTYPE, filters={"year": y, "docstatus": 1}, fields=["employee", "external_person", "signed_on"], limit=0)}
    rows = [{"employee": s["name"], "employee_name": s.get("employee_name"), "department": s.get("department"),
             "status": "Signed" if s["name"] in signed else "Outstanding", "signed_on": str(signed[s["name"]]) if signed.get(s["name"]) else None,
             "external": bool(s.get("external"))} for s in staff]
    if f.get("status"):
        rows = [r for r in rows if r["status"] == f["status"]]
    done = sum(1 for s in staff if s["name"] in signed)
    return {"rows": rows, "summary": [summary_item("Signed", done), summary_item("Outstanding", len(staff) - done), summary_item("Signed %", pct(done, len(staff)))],
            "note": f"Declaration year {dec.year_label(y)}."}


def appraisal_rows(f: dict[str, Any], scope: Scope | None) -> dict[str, Any]:
    from eswasa_hr import performance

    if not f.get("cycle") or not _has(performance.CYCLE):
        return {"rows": [], "note": "No appraisal cycle yet."}
    depts = performance.completion(performance._rows(f["cycle"], f.get("department")))
    rows = [{**d, "complete_pct": pct(d["manager_done"], d["people"])} for d in depts]
    people = sum(d["people"] for d in depts)
    return {"rows": rows, "summary": [summary_item("People", people), summary_item("Complete %", pct(sum(d["manager_done"] for d in depts), people))]}


# ---------------------------------------------------------------- the catalogue


def _year_start(day: date) -> str:
    return date(day.year, 1, 1).isoformat()


def _iso(day: date) -> str:
    return day.isoformat()


def _movement_start(day: date) -> str:
    from eswasa_hr import settings

    return (day - timedelta(days=settings.get("movement_days"))).isoformat()


def _year_end(day: date) -> str:
    return date(day.year, 12, 31).isoformat()


DEPT = flt("department", "Department", "department")
FROM_YEAR = flt("from_date", "From", "date", _year_start)
TO_TODAY = flt("to_date", "To", "date", _iso)

REPORTS: dict[str, dict[str, Any]] = {r["id"]: r for r in (
    {"id": "staff-list", "title": "Staff list", "group": "People", "roles": HR_ROLES, "team_scoped": True,
     "description": "Everyone with their job details: department, designation, grade, employment type and line manager.",
     "filters": [DEPT, flt("status", "Status", "select", "Active", ["Active", "Inactive", "Suspended", "Left"])],
     "columns": [col("employee", "Employee ID"), col("employee_name", "Name"), col("department", "Department"), col("designation", "Designation"),
                 col("grade", "Grade"), col("employment_type", "Employment type"), col("branch", "Branch"), col("date_of_joining", "Joined", "date"),
                 col("reports_to_name", "Line manager"), col("status", "Status")],
     "rows": staff_list_rows},
    {"id": "leave-taken", "title": "Leave taken by type", "group": "Time off", "roles": HR_ROLES, "team_scoped": True,
     "description": "Approved leave per person and leave type in a date range.",
     "filters": [FROM_YEAR, TO_TODAY, DEPT, flt("leave_type", "Leave type", "select", None, "leave_types")],
     "columns": [col("employee", "Employee ID"), col("employee_name", "Name"), col("department", "Department"), col("leave_type", "Leave type"),
                 col("requests", "Requests", "number"), col("days", "Days", "number")],
     "rows": leave_taken_rows},
    {"id": "leave-owed", "title": "Leave owed", "group": "Time off", "roles": HR_ROLES, "team_scoped": False,
     "description": "Days allocated, used, pending and left per person and leave type. Days only, never money.",
     "filters": [DEPT, flt("leave_type", "Leave type", "select", None, "leave_types")],
     "columns": [col("employee", "Employee ID"), col("employee_name", "Name"), col("department", "Department"), col("leave_type", "Leave type"),
                 col("allocated", "Allocated", "number"), col("used", "Used", "number"), col("pending", "Pending", "number"), col("balance", "Days left", "number")],
     "rows": leave_owed_rows},
    {"id": "length-of-service", "title": "Length of service", "group": "People", "roles": HR_ROLES, "team_scoped": False,
     "description": "Years of service in bands, with each person's next long-service milestone.",
     "filters": [DEPT, flt("band", "Band", "select", None, [label for _b, label in BANDS] + ["21 years or more"])],
     "columns": [col("employee", "Employee ID"), col("employee_name", "Name"), col("department", "Department"), col("designation", "Designation"),
                 col("date_of_joining", "Joined", "date"), col("years", "Years", "number"), col("band", "Band"),
                 col("next_milestone", "Next milestone (years)", "number"), col("next_milestone_on", "Milestone date", "date")],
     "rows": length_of_service_rows},
    {"id": "movements", "title": "Joiners, leavers, promotions and transfers", "group": "Movements", "roles": HR_ROLES, "team_scoped": False,
     "description": "Every movement in a date range, with turnover.",
     "filters": [flt("from_date", "From", "date", _movement_start), TO_TODAY, DEPT],
     "columns": [col("movement", "Movement"), col("on", "Date", "date"), col("employee", "Employee ID"), col("employee_name", "Name"),
                 col("department", "Department"), col("detail", "Detail")],
     "rows": movements_rows},
    {"id": "expiring", "title": "Contracts, authorisations and documents expiring", "group": "Competence and training", "roles": HR_ROLES, "team_scoped": True,
     "description": "What runs out in the next days: fixed-term contracts, staff authorisations and employee documents.",
     "filters": [flt("days", "Within (days)", "number", 60), flt("kind", "Kind", "select", None, list(EXPIRY_KINDS)), DEPT],
     "columns": [col("kind", "Kind"), col("employee", "Employee ID"), col("employee_name", "Name"), col("department", "Department"), col("what", "What"),
                 col("expires_on", "Expires", "date"), col("days_left", "Days left", "number")],
     "rows": expiring_rows},
    {"id": "training", "title": "Training attended and cost", "group": "Competence and training", "roles": HR_ROLES, "team_scoped": False,
     "description": "Each training event with nominees, attendance and direct and indirect cost.",
     "filters": [FROM_YEAR, flt("to_date", "To", "date", _year_end)],
     "columns": [col("event", "Event"), col("event_name", "Title"), col("status", "Status"), col("start", "Starts", "date"), col("nominees", "Nominees", "number"),
                 col("attended", "Attended", "number"), col("direct_cost", "Direct cost", "number"), col("indirect_cost", "Indirect cost", "number"),
                 col("total_cost", "Total cost", "number")],
     "rows": training_rows},
    {"id": "items-out", "title": "Issued items still out", "group": "People", "roles": HR_ROLES, "team_scoped": False,
     "description": "Items issued to staff that haven't come back, with what is overdue.",
     "filters": [flt("item_type", "Item type", "select", None, "item_types"), DEPT, flt("overdue", "Show", "select", None, ["Overdue only"])],
     "columns": [col("employee", "Employee ID"), col("employee_name", "Name"), col("department", "Department"), col("item_type", "Item"), col("tag", "Tag"),
                 col("issued_on", "Issued", "date"), col("return_due", "Return due", "date"), col("status", "Status"), col("overdue", "Overdue")],
     "rows": items_out_rows},
    {"id": "disciplinary", "title": "Disciplinary register", "group": "Cases", "roles": MANAGER_ROLES, "team_scoped": False,
     "description": "Counts of disciplinary cases by month, offence level and sanction. No names.",
     "filters": [FROM_YEAR, TO_TODAY],
     "columns": [col("month", "Month"), col("level", "Offence level"), col("sanction", "Sanction"), col("cases", "Cases", "number")],
     "rows": disciplinary_rows},
    {"id": "declarations", "title": "Declarations signed and outstanding", "group": "Competence and training", "roles": HR_ROLES, "team_scoped": False,
     "description": "Who has signed this year's impartiality and confidentiality declaration, and who hasn't.",
     "filters": [flt("year", "Year", "number", None), DEPT, flt("status", "Status", "select", None, ["Signed", "Outstanding"])],
     "columns": [col("employee", "ID"), col("employee_name", "Name"), col("department", "Department or organisation"), col("status", "Status"),
                 col("signed_on", "Signed", "date"), col("external", "External")],
     "rows": declarations_rows},
    {"id": "appraisal-completion", "title": "Appraisal completion by department", "group": "People", "roles": HR_ROLES, "team_scoped": False,
     "description": "Objectives set, self-assessments and manager reviews done in a cycle, per department.",
     "filters": [flt("cycle", "Cycle", "select", None, "cycles"), DEPT],
     "columns": [col("department", "Department"), col("people", "People", "number"), col("objectives_set", "Objectives set", "number"),
                 col("self_done", "Self-assessments", "number"), col("manager_done", "Manager reviews", "number"), col("complete_pct", "Complete", "percent")],
     "rows": appraisal_rows},
)}

for _r in REPORTS.values():  # import-time guard: a protected field in any report stops the module loading
    no_sensitive(_r["columns"])
    assert _r["group"] in GROUPS, _r["id"]


# ---------------------------------------------------------------- Frappe glue: catalogue, run, export


def _leave_types() -> list[str]:
    import frappe

    return [t["name"] for t in frappe.get_all("Leave Type", fields=["name"], order_by="name asc", limit=0)] if _has("Leave Type") else []


def _item_types() -> list[str]:
    from eswasa_hr.issued_items import types

    return types()


def _cycles() -> list[str]:
    import frappe

    from eswasa_hr.performance import CYCLE

    return [c["name"] for c in frappe.get_all(CYCLE, fields=["name"], order_by="start_date desc", limit=20)] if _has(CYCLE) else []


def _departments() -> list[str]:
    import frappe

    return [d["name"] for d in frappe.get_all("Department", filters={"is_group": 0, "disabled": 0}, fields=["name"], order_by="name asc", limit=0)] if _has("Department") else []


OPTIONS: dict[str, Callable[[], list[str]]] = {"leave_types": _leave_types, "item_types": _item_types, "cycles": _cycles}


def _report(report_id: str) -> dict[str, Any]:
    import frappe

    r = REPORTS.get(report_id or "")
    if not r:
        frappe.throw("There is no such report.", frappe.DoesNotExistError)
    return r


def _scope(report: dict[str, Any]) -> Scope:
    """Everyone for an HR role the report lists; a line manager's reports for a team-scoped report; else refused."""
    import frappe

    from eswasa_hr.scope import viewer_for

    v = viewer_for()
    if set(v.roles) & set(report["roles"]):
        return Scope()
    if report.get("team_scoped") and not v.hr and v.reports:
        return Scope(people=list(v.reports), label="team")
    frappe.throw("You can't run this report.", frappe.PermissionError)
    raise AssertionError  # pragma: no cover


def _filters(report: dict[str, Any], raw: Any) -> dict[str, Any]:
    import frappe

    values, errs = clean_filters(report, raw, _today())
    if report["id"] == "appraisal-completion" and not values.get("cycle"):
        cycles = _cycles()
        if cycles:
            values["cycle"] = cycles[0]
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    return values


def _resolved_filters(report: dict[str, Any], day: date) -> list[dict[str, Any]]:
    out = []
    for f in report["filters"]:
        options = f["options"]
        if f["type"] == "department":
            options = _departments()
        elif isinstance(options, str):
            options = OPTIONS[options]()
        default = f["default"](day) if callable(f["default"]) else f["default"]
        out.append({"key": f["key"], "label": f["label"], "type": f["type"], "default": default, "options": list(options) if options is not None else None})
    return out


def meta(report: dict[str, Any], scope: Scope | None = None, with_options: bool = False) -> dict[str, Any]:
    out = {k: report[k] for k in ("id", "title", "description", "group", "team_scoped")}
    out["names"] = has_names(report["columns"])
    out["scope"] = scope.label if scope else "all"
    out["columns"] = report["columns"]
    out["filters"] = _resolved_filters(report, _today()) if with_options else [
        {"key": f["key"], "label": f["label"], "type": f["type"], "default": None, "options": None} for f in report["filters"]]
    return out


def catalogue_impl(team: Any = None) -> dict[str, Any]:
    """The reports the caller may run. ``team`` lists only the team-scoped ones (the line manager's view)."""
    import frappe

    from eswasa_hr.scope import viewer_for

    v = viewer_for()
    want_team = str(team or "").lower() in ("1", "true", "yes")
    items = []
    for r in REPORTS.values():
        if want_team and not r["team_scoped"]:
            continue
        if not allowed(r, v.roles, bool(v.reports) and not v.hr):
            continue
        full = bool(set(v.roles) & set(r["roles"]))
        items.append(meta(r, Scope() if full else Scope(people=list(v.reports), label="team")))
    if not items and not want_team:
        frappe.throw("You can't see HR reports.", frappe.PermissionError)
    return {"items": items, "groups": [g for g in GROUPS if any(i["group"] == g for i in items)]}


def _build(report: dict[str, Any], values: dict[str, Any], scope: Scope) -> dict[str, Any]:
    out = report["rows"](values, scope)
    rows = apply_scope(out["rows"], scope)
    return {"rows": rows, "summary": out.get("summary") or [], "note": out.get("note")}


def run_impl(report: str, filters: Any = None) -> dict[str, Any]:
    """The report as JSON for the screen: columns, up to 5,000 rows, the total and the applied filters."""
    r = _report(report)
    scope = _scope(r)
    values = _filters(r, filters)
    built = _build(r, values, scope)
    rows = built["rows"]
    return {**meta(r, scope, with_options=True), "applied": values, "rows": rows[:SCREEN_CAP], "total": len(rows),
            "truncated": len(rows) > SCREEN_CAP, "summary": built["summary"], "note": built["note"]}


def _log(report: dict[str, Any], values: dict[str, Any], scope: Scope, reason: str | None) -> str:
    import frappe
    from frappe.utils import now_datetime

    log = frappe.get_doc({
        "doctype": sensitive.LOG,
        "employee": None,
        "employee_name": None,
        "viewer": frappe.session.user,
        "level": LOG_LEVEL,
        "fields": log_fields(report["id"], values, scope),
        "reason": (reason or "").strip() or "Counts only, no names",
        "ip_address": sensitive._ip(),
        "viewed_on": now_datetime(),
    })
    log.insert(ignore_permissions=True)
    return log.name


def export_impl(report: str, filters: Any = None, fmt: str = "csv", reason: str | None = None) -> dict[str, Any]:
    """CSV or XLSX, base64. The access-log row is written before any row is read, so no export goes unrecorded."""
    import base64

    import frappe

    r = _report(report)
    scope = _scope(r)
    fmt = (fmt or "").lower()
    err = export_error(r, reason, fmt)
    if err:
        frappe.throw(err, frappe.ValidationError)
    values = _filters(r, filters)
    log = _log(r, values, scope, reason)
    rows = _build(r, values, scope)["rows"]
    data = to_csv(r["columns"], rows) if fmt == "csv" else to_xlsx(r["columns"], rows, r["title"])
    return {"file_name": file_name(r["id"], fmt, _today()), "content_type": FORMATS[fmt], "content": base64.b64encode(data).decode(),
            "rows": len(rows), "log": log}


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def catalogue(team: Any = None) -> dict[str, Any]:
    return catalogue_impl(team)


@_whitelist
def run(report: str, filters: Any = None) -> dict[str, Any]:
    return run_impl(report, filters)


@_whitelist
def export(report: str, filters: Any = None, format: str = "csv", reason: str | None = None, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return export_impl(report, filters, format, reason)
