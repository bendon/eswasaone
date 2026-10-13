"""Plan 10: confirm a site has everything the HR backend needs after ``bench migrate``.

Run on the site: ``bench --site <site> execute eswasa_hr.install_check.run`` (or ``scripts/hr_check_install.py``).

What is expected is read from the app itself, so the check never drifts from the code:
- every DocType under ``eswasa_hr/doctype/`` and each of its fields (so new Select options and fields count too)
- every Custom Field, Property Setter, Role and Print Format named in ``hooks.fixtures``
- a Scheduled Job Type for every ``hooks.scheduler_events`` method
- a Patch Log row for every line of ``patches.txt``
- the Single ``HR Integrity Snapshot`` has been written by the nightly check (a warning, not a failure, on a new site)
Nothing is written. The result lists what is missing; ``ok`` is true when nothing is.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

APP_DIR = Path(__file__).resolve().parent
DOCTYPE_DIR = APP_DIR / "eswasa_hr" / "doctype"
PATCHES = APP_DIR / "patches.txt"
LAYOUT = {"Section Break", "Column Break", "Tab Break", "HTML", "Fold", "Heading", "Button"}
FIXTURE_KINDS = ("Custom Field", "Property Setter", "Role", "Print Format")


# ---------------------------------------------------------------- pure (tested without Frappe)

def fixture_names(fixtures: Iterable[dict[str, Any]]) -> dict[str, list[str]]:
    """``{"Custom Field": [...], ...}`` from the ``name in [...]`` filters in hooks.fixtures."""
    out: dict[str, list[str]] = {k: [] for k in FIXTURE_KINDS}
    for f in fixtures:
        dt = f.get("dt") if isinstance(f, dict) else f
        if dt not in out:
            continue
        for flt in (f.get("filters") or []) if isinstance(f, dict) else []:
            if len(flt) == 3 and flt[0] == "name" and flt[1] == "in":
                out[dt].extend(str(n) for n in flt[2])
    return out


def doctype_fields(doc: dict[str, Any]) -> list[str]:
    return [f["fieldname"] for f in doc.get("fields") or [] if f.get("fieldname") and f.get("fieldtype") not in LAYOUT]


def patch_lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith(("#", "["))]


def scheduler_methods(events: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for value in (events or {}).values():
        if isinstance(value, dict):  # "cron": {"0 2 * * *": [...]}
            for methods in value.values():
                out.extend(methods)
        else:
            out.extend(value)
    return sorted(set(out))


def expected(hooks: Any, doctypes: dict[str, list[str]], patches: str) -> dict[str, Any]:
    names = fixture_names(getattr(hooks, "fixtures", []) or [])
    return {
        "doctypes": doctypes,
        "custom_fields": names["Custom Field"],
        "property_setters": names["Property Setter"],
        "roles": names["Role"],
        "print_formats": names["Print Format"],
        "scheduler": scheduler_methods(getattr(hooks, "scheduler_events", {}) or {}),
        "patches": patch_lines(patches),
    }


def compare(want: dict[str, Any], have: dict[str, Any]) -> dict[str, Any]:
    """What ``want`` lists and ``have`` lacks. ``have`` uses the same keys; doctypes map name → field list."""
    missing: dict[str, Any] = {}
    have_dt = have.get("doctypes") or {}
    dts = [d for d in want["doctypes"] if d not in have_dt]
    fields = {d: sorted(set(f) - set(have_dt[d])) for d, f in want["doctypes"].items() if d in have_dt}
    fields = {d: f for d, f in fields.items() if f}
    if dts:
        missing["doctypes"] = sorted(dts)
    if fields:
        missing["fields"] = fields
    for key in ("custom_fields", "property_setters", "roles", "print_formats", "scheduler", "patches"):
        gone = sorted(set(want[key]) - set(have.get(key) or []))
        if gone:
            missing[key] = gone
    return missing


# ---------------------------------------------------------------- glue

def app_doctypes() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for path in sorted(DOCTYPE_DIR.glob("*/*.json")):
        doc = json.loads(path.read_text())
        if doc.get("doctype") == "DocType" and doc.get("name"):
            out[doc["name"]] = doctype_fields(doc)
    return out


def site_state(want: dict[str, Any]) -> dict[str, Any]:
    import frappe

    have: dict[str, Any] = {"doctypes": {}}
    for dt in want["doctypes"]:
        if frappe.db.exists("DocType", dt):
            have["doctypes"][dt] = [f.fieldname for f in frappe.get_meta(dt).fields]
    for key, doctype in (("custom_fields", "Custom Field"), ("property_setters", "Property Setter"), ("roles", "Role"),
                         ("print_formats", "Print Format")):
        have[key] = [n for n in want[key] if frappe.db.exists(doctype, n)]
    have["scheduler"] = [m for m in want["scheduler"] if frappe.db.exists("Scheduled Job Type", {"method": m})]
    have["patches"] = [p for p in want["patches"] if frappe.db.exists("Patch Log", {"patch": p})]
    return have


def warnings() -> list[str]:
    import frappe

    out = []
    if frappe.db.exists("DocType", "HR Integrity Snapshot") and not frappe.db.get_single_value("HR Integrity Snapshot", "ran_on"):
        out.append("HR Integrity Snapshot has never run: run eswasa_hr.tasks.rh7_integrity once (runbook step 6).")
    if not frappe.db.exists("Has Role", {"role": "Eswasa Executive Director", "parenttype": "User"}):
        out.append("Nobody holds Eswasa Executive Director (runbook step 4).")
    return out


def select_gaps(want: dict[str, dict[str, list[str]]], have: dict[str, dict[str, list[str]]]) -> dict[str, list[str]]:
    """Select options the app needs that the site's meta lacks, as ``{"DocType.field": [options]}``."""
    out = {}
    for dt, fields in want.items():
        for field, options in fields.items():
            gone = sorted(set(options) - set((have.get(dt) or {}).get(field) or []))
            if gone:
                out[f"{dt}.{field}"] = gone
    return out


def _site_options(want: dict[str, dict[str, list[str]]]) -> dict[str, dict[str, list[str]]]:
    import frappe

    have: dict[str, dict[str, list[str]]] = {}
    for dt, fields in want.items():
        if not frappe.db.exists("DocType", dt):
            continue
        meta = frappe.get_meta(dt)
        have[dt] = {f: [o for o in (meta.get_field(f).options or "").split("\n") if o] for f in fields if meta.get_field(f)}
    return have


def _check_plan_01() -> dict[str, Any]:
    """HR additions plan 01: the ``Warning expired`` alert rule (DocType fields and HR Settings fields are covered above)."""
    want = {"HR Alert": {"rule": ["Warning expired"]}, "Disciplinary Case": {"warning_status": ["Active", "Expired", "Withdrawn"]}}
    gaps = select_gaps(want, _site_options(want))
    return {"select_options": gaps} if gaps else {}


def _check_plan_02() -> dict[str, Any]:
    """HR additions plan 02: the ``Items not returned`` alert rule (the DocType and HR Settings field are covered above)."""
    import frappe

    if not frappe.db.exists("DocType", "HR Alert"):
        return {}
    field = frappe.get_meta("HR Alert").get_field("rule")
    if field and "Items not returned" in (field.options or "").split("\n"):
        return {}
    return {"plan_02": ["HR Alert.rule option Items not returned"]}


def run() -> dict[str, Any]:
    from eswasa_hr import hooks

    want = expected(hooks, app_doctypes(), PATCHES.read_text())
    missing = compare(want, site_state(want))
    missing.update(_check_plan_01())
    missing.update(_check_plan_02())
    result = {
        "ok": not missing,
        "missing": missing,
        "warnings": warnings(),
        "checked": {k: len(v) for k, v in want.items()},
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return result
