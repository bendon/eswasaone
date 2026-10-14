"""
Provisional Eswatini baseline: makes every HR & People screen usable on a staging or demo site before ESWASA's
signed values arrive. STAGING AND DEMO SITES ONLY.

Runs after every ``bench migrate`` (``setup.after_migrate``) on a site whose ``site_config.json`` has
``"eswasa_hr_baseline": 1`` (or ``"eswasa_demo_seed": 1``, whose journey needs it); on any other site it does nothing.
By hand:

    bench --site <site> execute eswasa_hr.baseline.run

The values live in ``data/baseline/`` (see its README), never in code. Each step goes through the mechanism HR
itself uses, so every rule still applies:
- ``master_data.json`` through ``master_data_load`` (branches, employment types, Paterson grades, the department
  tree, posts, the Eswatini holiday list for 2026-2027);
- ``policy.json``: the open ESWASA answers (A1 disciplinary code and warning months, A2 item types, A3 letter
  wording, A8 milestone years), leave types, the leave period and policy, the competence catalogue, required
  documents and expense claim types;
- the ``staff_*.csv`` files through the two-pass employee import (``employee_import``), recorded as HR Import Runs;
- ``organisation.json``: the approved establishment (Staffing Plans), department heads and extra roles.

Nothing is overwritten: a setting, record or head HR has already set stays as it is, and a step already done is
skipped, so running it again only finishes what's missing. A step this site can't support is recorded under
``skipped`` with the reason. What happened is written to ``sites/<site>/private/hr_baseline.json``.
Never set the flag on production: ESWASA's real data goes in through HR setup.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

import base64
import csv
import io
import json
from datetime import date
from pathlib import Path
from typing import Any, Callable

FLAG = "eswasa_hr_baseline"
DEMO_FLAG = "eswasa_demo_seed"
PASSWORD = "eswasa_demo_password"
MAIL_DOMAIN = "eswasa_demo_mail_domain"
FILE_DOMAIN = "eswasa.demo"  # the domain the staff files are written with
DATA = Path(__file__).parent / "data" / "baseline"
RUN = "HR Import Run"
PLAN = "Staffing Plan"
TERMS = "Terms and Conditions"
OFFENCE = "Disciplinary Offence"
FILE_PREFIX = "baseline_"  # HR Import Run file names, so a finished file isn't loaded twice


# ---------------------------------------------------------------- pure (tested without Frappe)


def refusal(conf: dict[str, Any]) -> str | None:
    if not (conf.get(FLAG) or conf.get(DEMO_FLAG)):
        return f"Staging and demo sites only: set \"{FLAG}\": 1 in this site's site_config.json to load the baseline."
    domain = conf.get(MAIL_DOMAIN)
    if domain and ("@" in domain or "." not in domain):
        return f"\"{MAIL_DOMAIN}\" must be a bare domain such as {FILE_DOMAIN}."
    return None


def read(name: str, folder: Path | None = None) -> Any:
    path = (folder or DATA) / name
    with open(path, encoding="utf-8") as fh:
        return json.load(fh) if name.endswith(".json") else fh.read()


def with_domain(text: str, domain: str | None) -> str:
    """The staff files use ``@eswasa.demo``; a site with its own demo mail domain gets that instead."""
    return text.replace(f"@{FILE_DOMAIN}", f"@{domain.lower()}") if domain and domain.lower() != FILE_DOMAIN else text


def csv_rows(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def period_for(today: date, starts_month: int, starts_day: int) -> tuple[date, date]:
    """The yearly leave period that contains ``today``."""
    start = date(today.year, starts_month, starts_day)
    if start > today:
        start = date(today.year - 1, starts_month, starts_day)
    try:
        nxt = date(start.year + 1, starts_month, starts_day)
    except ValueError:  # 29 February
        nxt = date(start.year + 1, starts_month, 28)
    return start, date.fromordinal(nxt.toordinal() - 1)


def _empty(v: Any) -> bool:
    return v is None or (isinstance(v, str) and not v.strip()) or (isinstance(v, (int, float)) and v == 0)


def fill_empty(current: dict[str, Any], wanted: dict[str, Any]) -> dict[str, Any]:
    """The values to write: only where the site has none. A list becomes one entry per line."""
    out = {}
    for k, v in wanted.items():
        if _empty(current.get(k)):
            out[k] = "\n".join(map(str, v)) if isinstance(v, list) else v
    return out


def staffing_rows(posts: list[dict[str, Any]], filled: dict[str, int]) -> list[dict[str, Any]]:
    """Staffing Plan rows. HRMS sets number_of_positions = vacancies + current_count on validate."""
    rows = []
    for p in posts:
        cur = int(filled.get(p["designation"], 0))
        n = int(p["positions"])
        rows.append({"designation": p["designation"], "vacancies": max(0, n - cur), "current_count": cur, "number_of_positions": max(n, cur)})
    return rows


def block(out: dict[str, Any], name: str, fn: Callable[[], Any]) -> Any:
    """Run one step; record its result, or why it was skipped."""
    try:
        value = fn()
    except Exception as exc:  # noqa: BLE001 - every failure becomes a skip reason
        out["skipped"][name] = f"{type(exc).__name__}: {exc}"[:400]
        return None
    if value is None:
        out["skipped"].setdefault(name, "not available on this site")
    else:
        out[name] = value
    return value


# ---------------------------------------------------------------- Frappe glue


def _guarded(name: str, fn: Callable[[], Any]) -> Callable[[], Any]:
    """Run ``fn`` in a savepoint (no half-made records), then commit so a later failure can't undo it."""
    def run() -> Any:
        import frappe

        frappe.db.savepoint(name)
        try:
            value = fn()
        except Exception:
            try:
                frappe.db.rollback(save_point=name)
            except Exception:  # noqa: BLE001
                pass
            raise
        frappe.db.commit()
        return value
    return run


def _has(doctype: str) -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", doctype))


def _fields(doctype: str, values: dict[str, Any]) -> dict[str, Any]:
    """Only the fields this site has."""
    import frappe

    meta = frappe.get_meta(doctype)
    return {k: v for k, v in values.items() if meta.has_field(k)}


def _competences(policy: dict[str, Any]) -> dict[str, Any]:
    import frappe

    made = []
    for c in policy.get("competences") or []:
        if not frappe.db.exists("Skill", c["skill_name"]):
            frappe.get_doc({"doctype": "Skill", **_fields("Skill", c), "skill_name": c["skill_name"]}).insert(ignore_permissions=True)
            made.append(c["skill_name"])
    return {"created": made}


def _master_data() -> dict[str, Any]:
    import frappe

    from eswasa_hr.master_data_load import load
    from eswasa_hr.recruitment import _company

    data = read("master_data.json")
    out = load(data)
    if not out["ok"]:
        raise ValueError("; ".join(out["errors"])[:380])
    # ERPNext's own departments of the same name may have been disabled on a fresh site (setup.py): bring back ours.
    company = _company()
    names = [d["name"] for d in data.get("departments") or []]
    for d in frappe.get_all("Department", filters={"department_name": ["in", names], "company": company, "disabled": 1}, fields=["name"], limit=0):
        frappe.db.set_value("Department", d["name"], "disabled", 0)
    return {k: v for k, v in out["counts"].items()}


def _hr_settings(policy: dict[str, Any]) -> dict[str, Any]:
    import frappe

    wanted = _fields("HR Settings", policy.get("hr_settings") or {})
    doc = frappe.get_single("HR Settings")
    todo = fill_empty({k: doc.get(k) for k in wanted}, wanted)
    if todo:
        doc.update(todo)
        doc.flags.ignore_mandatory = True
        doc.save(ignore_permissions=True)
    return {"set": sorted(todo), "kept": sorted(set(wanted) - set(todo))}


def _offences(policy: dict[str, Any]) -> dict[str, Any] | None:
    import frappe

    if not _has(OFFENCE):
        return None
    made = []
    for o in policy.get("disciplinary_offences") or []:
        if not frappe.db.exists(OFFENCE, o["code"]):
            frappe.get_doc({"doctype": OFFENCE, "active": 1, **o}).insert(ignore_permissions=True)
            made.append(o["code"])
    return {"created": made}


def _wording(policy: dict[str, Any]) -> dict[str, Any] | None:
    import frappe

    if not _has(TERMS):
        return None
    made = []
    for title, text in (policy.get("letter_wording") or {}).items():
        if not frappe.db.exists(TERMS, title):
            frappe.get_doc({"doctype": TERMS, "title": title, "terms": text, **_fields(TERMS, {"hr": 1})}).insert(ignore_permissions=True)
            made.append(title)
    return {"created": made}


def _leave_types(policy: dict[str, Any]) -> dict[str, Any]:
    import frappe

    made, filled = [], []
    for t in policy.get("leave_types") or []:
        name = t["leave_type_name"]
        values = _fields("Leave Type", t)
        if not frappe.db.exists("Leave Type", name):
            frappe.get_doc({"doctype": "Leave Type", **values}).insert(ignore_permissions=True)
            made.append(name)
            continue
        doc = frappe.get_doc("Leave Type", name)
        todo = fill_empty({k: doc.get(k) for k in values}, {k: v for k, v in values.items() if k != "leave_type_name"})
        if todo:
            doc.update(todo)
            doc.save(ignore_permissions=True)
            filled.append(name)
    return {"created": made, "filled": filled}


def _leave_period(policy: dict[str, Any], today: date) -> dict[str, Any]:
    import frappe

    from eswasa_hr.recruitment import _company

    company = _company()
    have = frappe.db.get_value("Leave Period", {"from_date": ["<=", today], "to_date": [">=", today], "is_active": 1, "company": company}, "name")
    if have:
        return {"kept": have}
    p = policy.get("leave_period") or {}
    start, end = period_for(today, int(p.get("starts_month") or 1), int(p.get("starts_day") or 1))
    doc = frappe.get_doc({"doctype": "Leave Period", "from_date": start, "to_date": end, "is_active": 1, "company": company})
    doc.insert(ignore_permissions=True)
    return {"created": doc.name, "from": str(start), "to": str(end)}


def _leave_policy(policy: dict[str, Any]) -> dict[str, Any] | None:
    import frappe

    lp = policy.get("leave_policy")
    if not lp:
        return None
    name = frappe.db.get_value("Leave Policy", {"title": lp["title"], "docstatus": 1}, "name")
    if name:
        return {"kept": name}
    doc = frappe.get_doc({"doctype": "Leave Policy", "title": lp["title"],
                          "leave_policy_details": [{"leave_type": t, "annual_allocation": n} for t, n in lp["allocations"].items()]})
    doc.insert(ignore_permissions=True)
    doc.submit()
    return {"created": doc.name}


def _required_documents(policy: dict[str, Any]) -> dict[str, Any] | None:
    import frappe

    if not frappe.get_meta("Employment Type").has_field("custom_required_documents"):
        return None
    filled = []
    for etype, docs in (policy.get("required_documents") or {}).items():
        if not frappe.db.exists("Employment Type", etype):
            continue
        doc = frappe.get_doc("Employment Type", etype)
        if doc.get("custom_required_documents"):
            continue
        for d in docs:
            doc.append("custom_required_documents", d)
        doc.save(ignore_permissions=True)
        filled.append(etype)
    return {"filled": filled}


def _expense_types(policy: dict[str, Any]) -> dict[str, Any] | None:
    import frappe

    from eswasa_hr.recruitment import _company

    if not _has("Expense Claim Type"):
        return None
    company = _company()
    made, no_account = [], []
    for t in policy.get("expense_claim_types") or []:
        if frappe.db.exists("Expense Claim Type", t["expense_type"]):
            continue
        account = frappe.db.get_value("Account", {"account_name": t.get("account"), "company": company, "is_group": 0}, "name") if t.get("account") else None
        doc = frappe.get_doc({"doctype": "Expense Claim Type", "expense_type": t["expense_type"], "description": t.get("description"),
                              "accounts": [{"company": company, "default_account": account}] if account else []})
        doc.insert(ignore_permissions=True)
        made.append(t["expense_type"])
        if not account:
            no_account.append(t["expense_type"])
    return {"created": made, "no_account": no_account}


def _import(pass_no: int, file: str, domain: str | None) -> dict[str, Any]:
    """One staff file through the employee import, recorded as an HR Import Run like an upload from HR setup."""
    import frappe
    from frappe.utils import now_datetime

    from eswasa_hr import employee_import as imp

    name = f"{FILE_PREFIX}{file}"
    done = frappe.db.get_value(RUN, {"file_name": name, "status": "Done"}, "name")
    if done:
        return {"kept": done}
    content = with_domain(read(file), domain).encode("utf-8")
    run = frappe.get_doc({"doctype": RUN, "pass_no": str(pass_no), "status": "Queued", "file_name": name, "rows": len(csv_rows(content.decode())),
                          "run_by": frappe.session.user, "started_on": now_datetime()})
    run.insert(ignore_permissions=True)
    imp._keep_file(run.name, name, content)
    frappe.db.commit()  # process_run rolls back on failure; nothing before this point may go with it
    out = imp.process_run(run.name, base64.b64encode(content).decode(), name)
    if not out.get("ok"):
        first = (out.get("errors") or [{}])[:3]
        raise ValueError(f"{name}: " + "; ".join(f"{e.get('employee_number') or ''} {e.get('message')}".strip() for e in first))
    return {"run": run.name, "created": out.get("create"), "updated": out.get("update"), "unchanged": out.get("unchanged")}


def _by_number() -> dict[str, dict[str, Any]]:
    import frappe

    return {e["employee_number"]: e for e in frappe.get_all("Employee", filters={"employee_number": ["is", "set"]},
                                                           fields=["name", "employee_number", "user_id", "department", "designation"], limit=0)}


def _establishment(org: dict[str, Any], today: date) -> dict[str, Any]:
    import frappe
    from frappe.utils import add_days, add_years

    from eswasa_hr.recruitment import _company

    company = _company()
    made, kept = [], []
    for e in org.get("establishment") or []:
        dept = frappe.db.get_value("Department", {"department_name": e["department"], "company": company}, "name")
        if not dept:
            raise ValueError(f"Department {e['department']} is missing (load the master data first)")
        if frappe.db.exists(PLAN, {"department": dept, "docstatus": 1}):
            kept.append(dept)
            continue
        filled: dict[str, int] = {}
        for r in frappe.get_all("Employee", filters={"department": dept, "status": "Active"}, fields=["designation"], limit=0):
            filled[r["designation"]] = filled.get(r["designation"], 0) + 1
        title = f"{e['department']} establishment {today.year}"
        doc = frappe.get_doc({"doctype": PLAN, "name": title, "__newname": title, "company": company, "department": dept,
                              "from_date": today, "to_date": add_days(add_years(today, 1), -1),
                              "staffing_details": staffing_rows(e["posts"], filled)})
        doc.insert(ignore_permissions=True)
        doc.submit()
        made.append(doc.name)
    return {"created": made, "kept": kept}


def _heads(org: dict[str, Any]) -> dict[str, Any]:
    import frappe

    from eswasa_hr import scope
    from eswasa_hr.recruitment import _company

    company, people = _company(), _by_number()
    made, kept = [], []
    for dept_name, number in (org.get("heads") or {}).items():
        dept = frappe.db.get_value("Department", {"department_name": dept_name, "company": company}, "name")
        emp = people.get(number)
        if not dept or not emp:
            continue
        if frappe.db.get_value("Department", dept, "custom_head"):
            kept.append(dept)
            continue
        frappe.db.set_value("Department", dept, "custom_head", emp["name"])
        made.append(dept)
    scope.release_deciders()  # set_value skips hooks: heads must still see what they decide
    return {"set": made, "kept": kept}


def _roles(org: dict[str, Any]) -> dict[str, Any]:
    import frappe

    people, given = _by_number(), {}
    for number, roles in (org.get("roles") or {}).items():
        user = (people.get(number) or {}).get("user_id")
        if not user:
            continue
        doc = frappe.get_doc("User", user)
        have = {r.role for r in doc.roles}
        new = [r for r in roles if r not in have and frappe.db.exists("Role", r)]
        if new:
            doc.add_roles(*new)
            given[user] = new
    return {"given": given}


def _passwords(conf: dict[str, Any]) -> dict[str, Any] | None:
    """Demo sites only: every baseline login can sign in with the demo password, without the emailed code."""
    import frappe
    from frappe.utils.password import update_password

    if not (conf.get(DEMO_FLAG) and conf.get(PASSWORD)):
        return None
    otp = frappe.get_meta("User").has_field("custom_otp_enabled")
    users = [e["user_id"] for e in _by_number().values() if e.get("user_id")]
    for u in users:
        update_password(u, conf[PASSWORD])
        if otp:
            frappe.db.set_value("User", u, "custom_otp_enabled", 0)
    return {"logins": len(users)}


def run(out_path: str | None = None) -> dict[str, Any]:
    import frappe

    conf = dict(frappe.conf)
    reason = refusal(conf)
    if reason:
        frappe.throw(reason)
    today = date.today()
    policy, org = read("policy.json"), read("organisation.json")
    domain = conf.get(MAIL_DOMAIN)
    out: dict[str, Any] = {"site": frappe.local.site, "loaded_on": today.isoformat(), "skipped": {}}
    muted = frappe.flags.mute_emails
    frappe.flags.mute_emails = True  # invitations and alerts stay on the site while loading
    try:
        steps: list[tuple[str, Callable[[], Any]]] = [
            ("competences", lambda: _competences(policy)),
            ("master_data", _master_data),
            ("hr_settings", lambda: _hr_settings(policy)),
            ("disciplinary_code", lambda: _offences(policy)),
            ("letter_wording", lambda: _wording(policy)),
            ("leave_types", lambda: _leave_types(policy)),
            ("leave_period", lambda: _leave_period(policy, today)),
            ("leave_policy", lambda: _leave_policy(policy)),
            ("required_documents", lambda: _required_documents(policy)),
            ("expense_types", lambda: _expense_types(policy)),
        ]
        for name, fn in steps:
            block(out, name, _guarded(name, fn))
        for i, f in enumerate(org.get("staff_import") or []):
            key = f"import_{i + 1}_{f['file'].rsplit('.', 1)[0]}"
            if not block(out, key, lambda f=f: _import(int(f["pass"]), f["file"], domain)):
                break  # later passes need this one
            if int(f["pass"]) == 1:
                block(out, "establishment", _guarded("establishment", lambda: _establishment(org, today)))
        block(out, "heads", _guarded("heads", lambda: _heads(org)))
        block(out, "roles", _guarded("roles", lambda: _roles(org)))
        block(out, "passwords", _guarded("passwords", lambda: _passwords(conf)))
        frappe.db.commit()
    finally:
        frappe.flags.mute_emails = muted
    path = out_path or frappe.get_site_path("private", "hr_baseline.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=2, default=str)
    summary = {"written": path, "skipped": out["skipped"]}
    print(json.dumps(summary, indent=2))
    return summary


def after_migrate() -> None:
    """Load on migrate, only where the site asks for it. Never fails the migrate."""
    import frappe

    if refusal(dict(frappe.conf)):
        return
    try:
        run()
    except Exception:  # noqa: BLE001
        frappe.db.rollback()
        frappe.log_error(title="HR baseline failed")
