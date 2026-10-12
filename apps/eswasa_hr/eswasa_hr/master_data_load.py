"""
Load ESWASA's master data from one signed-off JSON file (brief §1, H1, H2, H12–H14).

Nothing here holds ESWASA values. The file comes from ESWASA (``eswasa_core/fixtures/hr/eswasa_master_data.json``,
git-ignored until sign-off) and follows ``eswasa_master_data.schema.json``; the committed example is marked
``"example": true`` and is always refused. The loader:
- upserts Branch, Employment Type, Employee Grade, the Department tree (parents first, ``custom_head`` left for
  later), Designation (``custom_grade`` and the ``skills`` table) and the Holiday List (the Eswatini list that
  drives SLAs, L9), then makes that list the Company default;
- is idempotent and reports created, updated and unchanged per type;
- never deletes or disables: a department missing from the file is reported, and a skill or holiday not in the
  file is kept.
A dry run checks and counts without writing. System Manager only.

Once ESWASA signs off, export the loaded records as fixtures so staging and production match.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable

ROLES = ("System Manager",)
ROOT_DEPARTMENT = "All Departments"
SECTIONS = ("branches", "employment_types", "grades", "departments", "designations", "holiday_list")
TYPES = {
    "branches": "Branch",
    "employment_types": "Employment Type",
    "grades": "Employee Grade",
    "departments": "Department",
    "designations": "Designation",
    "holiday_list": "Holiday List",
}


def _s(v: Any) -> str:
    return str(v if v is not None else "").strip()


def _date(v: Any) -> date | None:
    try:
        return date.fromisoformat(_s(v)[:10])
    except ValueError:
        return None


def _names(rows: Iterable[dict[str, Any]]) -> list[str]:
    return [_s(r.get("name")) for r in rows if isinstance(r, dict)]


def department_order(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    """Parents before children. A parent not in the file must already exist (checked by the caller)."""
    by_name = {_s(r.get("name")).lower(): r for r in rows}
    out: list[dict[str, Any]] = []
    placed: set[str] = set()
    errs: list[str] = []

    def place(r: dict[str, Any], trail: tuple[str, ...]) -> None:
        key = _s(r.get("name")).lower()
        if key in placed:
            return
        if key in trail:
            errs.append(f"Departments go round in a loop: {' → '.join(by_name[k]['name'] for k in (*trail, key))}.")
            return
        parent = _s(r.get("parent")).lower()
        if parent and parent in by_name:
            place(by_name[parent], (*trail, key))
        if key not in placed:
            placed.add(key)
            out.append(r)

    for r in rows:
        place(r, ())
    return out, list(dict.fromkeys(errs))


def file_errors(data: Any, existing: dict[str, set[str]] | None = None) -> list[str]:
    """Plain-language problems with a master-data file. ``existing``: lower-cased names already in the system,
    keyed ``departments``, ``grades``, ``skills``."""
    existing = existing or {}
    if not isinstance(data, dict):
        return ["The master-data file must be a JSON object. See eswasa_master_data.schema.json."]
    if data.get("example"):
        return ["This is the example file. It never loads; ESWASA supplies the real one (H1, H2)."]
    errs = [f"Unknown section \"{k}\"." for k in data if k not in (*SECTIONS, "example", "version", "signed_off_by", "signed_off_on")]
    for section in SECTIONS[:-1]:
        rows = data.get(section) or []
        if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
            errs.append(f"\"{section}\" must be a list of objects.")
            continue
        names = _names(rows)
        if any(not n for n in names):
            errs.append(f"Every entry in \"{section}\" needs a name.")
        seen: set[str] = set()
        for n in names:
            if n and n.lower() in seen:
                errs.append(f"\"{n}\" appears twice in \"{section}\".")
            seen.add(n.lower())
    depts = data.get("departments") or []
    if isinstance(depts, list):
        in_file = {n.lower() for n in _names(depts)}
        for r in depts:
            parent = _s(r.get("parent")) if isinstance(r, dict) else ""
            if parent and parent.lower() not in in_file and parent.lower() not in existing.get("departments", set()) and parent != ROOT_DEPARTMENT:
                errs.append(f"Department \"{r.get('name')}\" has parent \"{parent}\", which isn't in the file or the system.")
        errs += department_order([r for r in depts if isinstance(r, dict)])[1]
    grades = {n.lower() for n in _names(data.get("grades") or [])} | existing.get("grades", set())
    skills = existing.get("skills", set())
    for r in data.get("designations") or []:
        if not isinstance(r, dict):
            continue
        if _s(r.get("grade")) and _s(r["grade"]).lower() not in grades:
            errs.append(f"Designation \"{r.get('name')}\" has grade \"{r['grade']}\", which isn't in the file or the system.")
        unknown = [s for s in r.get("skills") or [] if _s(s).lower() not in skills]
        if unknown:
            errs.append(f"Designation \"{r.get('name')}\" needs competences not in the catalogue: {', '.join(map(str, unknown))}.")
    hl = data.get("holiday_list")
    if hl is not None:
        if not isinstance(hl, dict) or not _s(hl.get("name")):
            errs.append("\"holiday_list\" must be an object with a name.")
        else:
            start, end = _date(hl.get("from_date")), _date(hl.get("to_date"))
            if hl.get("holidays") and (not start or not end or end < start):
                errs.append("The holiday list needs from_date and to_date (YYYY-MM-DD), in order.")
            for h in hl.get("holidays") or []:
                d = _date(h.get("date")) if isinstance(h, dict) else None
                if d is None:
                    errs.append(f"Holiday {h!r} needs a date (YYYY-MM-DD).")
                elif start and end and not start <= d <= end:
                    errs.append(f"Holiday {d} is outside the list's dates.")
    return errs


def changes(existing: dict[str, Any], wanted: dict[str, Any]) -> dict[str, Any]:
    """Fields to set. A value left out (None) never clears what's there."""
    return {k: v for k, v in wanted.items() if v is not None and _s(existing.get(k)) != _s(v)}


def empty_report(dry_run: bool) -> dict[str, Any]:
    return {
        "dry_run": dry_run,
        "counts": {s: {"created": 0, "updated": 0, "unchanged": 0} for s in SECTIONS},
        "missing_departments": [],
        "kept": [],
        "errors": [],
        "ok": True,
    }


# ---------------------------------------------------------------- Frappe glue


def _existing() -> dict[str, set[str]]:
    import frappe

    def lower(dt: str, *fields: str) -> set[str]:
        if not frappe.db.exists("DocType", dt):
            return set()
        return {_s(r.get(f)).lower() for r in frappe.get_all(dt, fields=["name", *fields], limit=0) for f in ("name", *fields) if r.get(f)}

    return {"departments": lower("Department", "department_name"), "grades": lower("Employee Grade"), "skills": lower("Skill", "skill_name")}


def _upsert(report: dict[str, Any], section: str, filters: dict[str, Any], values: dict[str, Any], dry_run: bool, name: str | None = None) -> str | None:
    """Create or update one record; returns its name (None for a dry-run create)."""
    import frappe

    doctype = TYPES[section]
    row = frappe.db.get_value(doctype, filters, ["name", *values], as_dict=True)
    count = report["counts"][section]
    if row is None:
        count["created"] += 1
        if dry_run:
            return None
        doc = frappe.get_doc({"doctype": doctype, **({"name": name} if name else {}), **{k: v for k, v in values.items() if v is not None}})
        doc.insert()
        return doc.name
    diff = changes(dict(row), values)
    if diff:
        count["updated"] += 1
        if not dry_run:
            doc = frappe.get_doc(doctype, row["name"])  # save, not set_value: Department is a tree (lft/rgt)
            doc.update(diff)
            doc.save()
    else:
        count["unchanged"] += 1
    return row["name"]


def _add_children(report: dict[str, Any], section: str, doctype: str, name: str | None, table: str, key: str, wanted: list[dict[str, Any]], dry_run: bool) -> bool:
    """Add child rows the record lacks; keep the ones the file doesn't list. True when something was added."""
    import frappe

    if not name:
        return False
    doc = frappe.get_doc(doctype, name)
    have = {_s(c.get(key)) for c in doc.get(table) or []}
    new = [w for w in wanted if _s(w[key]) not in have]
    extra = sorted(have - {_s(w[key]) for w in wanted})
    if extra:
        report["kept"].append(f"{doctype} {name} keeps {', '.join(extra)} (not in the file; nothing is removed).")
    if new and not dry_run:
        for w in new:
            doc.append(table, w)
        doc.save()
    return bool(new)


def _bump(report: dict[str, Any], section: str) -> None:
    """A record whose only change was new child rows counts as updated, not unchanged."""
    c = report["counts"][section]
    if c["unchanged"]:
        c["unchanged"] -= 1
        c["updated"] += 1


def load(data: Any, dry_run: bool = False) -> dict[str, Any]:
    import frappe

    from eswasa_hr.recruitment import _company

    if not set(frappe.get_roles()) & set(ROLES):
        frappe.throw("Only a System Manager can load master data.", frappe.PermissionError)
    report = empty_report(dry_run)
    errs = file_errors(data, _existing())
    company = _company()
    if not company:
        errs.append("Set up the organisation (Company) first; departments belong to it.")
    if errs:
        return {**report, "errors": errs, "ok": False}

    for r in data.get("branches") or []:
        _upsert(report, "branches", {"branch": r["name"]}, {"branch": r["name"]}, dry_run)
    for r in data.get("employment_types") or []:
        _upsert(report, "employment_types", {"employee_type_name": r["name"]}, {"employee_type_name": r["name"]}, dry_run)
    for r in data.get("grades") or []:
        _upsert(report, "grades", {"name": r["name"]}, {"default_salary_structure": r.get("default_salary_structure")}, dry_run, name=r["name"])

    depts, _ = department_order(list(data.get("departments") or []))
    parents = {_s(d.get("parent")).lower() for d in depts if d.get("parent")}
    names: dict[str, str] = {}
    for r in depts:
        parent = _s(r.get("parent"))
        parent_name = names.get(parent.lower()) or (frappe.db.get_value("Department", {"department_name": parent, "company": company}, "name") if parent else None)
        values = {
            "department_name": r["name"],
            "company": company,
            "parent_department": parent_name or (parent if parent == ROOT_DEPARTMENT else None) or ROOT_DEPARTMENT,
            "is_group": 1 if r.get("is_group") or r["name"].lower() in parents else 0,
        }
        got = _upsert(report, "departments", {"department_name": r["name"], "company": company}, values, dry_run)
        names[r["name"].lower()] = got or r["name"]
    in_file = {d["name"].lower() for d in depts}
    for d in frappe.get_all("Department", filters={"company": company, "disabled": 0}, fields=["name", "department_name"], limit=0):
        if _s(d.get("department_name") or d.get("name")).lower() not in in_file and d.get("name") != ROOT_DEPARTMENT:
            report["missing_departments"].append(d.get("name"))

    for r in data.get("designations") or []:
        values = {"designation_name": r["name"], "custom_grade": r.get("grade"), "description": r.get("description")}
        got = _upsert(report, "designations", {"designation_name": r["name"]}, values, dry_run)
        wanted = [{"skill": s} for s in r.get("skills") or []]
        if wanted and _add_children(report, "designations", "Designation", got, "skills", "skill", wanted, dry_run):
            _bump(report, "designations")

    hl = data.get("holiday_list")
    if hl:
        values = {"holiday_list_name": hl["name"], "from_date": hl.get("from_date"), "to_date": hl.get("to_date")}
        if frappe.db.exists("Holiday List", hl["name"]) or hl.get("holidays"):
            got = _upsert(report, "holiday_list", {"holiday_list_name": hl["name"]}, values, dry_run)
            wanted = [{"holiday_date": h["date"], "description": h.get("description") or "", "weekly_off": int(bool(h.get("weekly_off")))}
                      for h in hl.get("holidays") or []]
            if wanted and _add_children(report, "holiday_list", "Holiday List", got, "holidays", "holiday_date", wanted, dry_run):
                _bump(report, "holiday_list")
        else:
            report["errors"].append(f"Holiday list \"{hl['name']}\" doesn't exist; give its dates and holidays in the file.")
        if hl.get("company_default", True) and not report["errors"] and not dry_run:
            frappe.db.set_value("Company", company, "default_holiday_list", hl["name"])
    report["ok"] = not report["errors"]
    return report


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def load_file(data: Any = None, dry_run: Any = True, confirm: Any = False) -> dict[str, Any]:
    """``POST /hr/setup/master-data``. A real load needs confirm; a dry run doesn't write."""
    import json

    from frappe.utils import cint

    dry = bool(cint(dry_run))
    if not dry:
        from eswasa_hr.lifecycle import _confirm

        _confirm(confirm)
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except ValueError:
            data = None
    return load(data, dry_run=dry)
