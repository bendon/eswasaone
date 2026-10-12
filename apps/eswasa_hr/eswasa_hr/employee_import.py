"""
The employee load (brief §2, H14): a two-pass import, then opening leave balances.

Desk Data Import inserts Employees without the guards ``employees.create_impl`` applies, can't resolve a line manager
by staff number, and half-applies a file that has a bad row. This module does the load instead:
- **Pass 1** creates or updates the records (``employee_number``, name, job and contract fields) through
  ``employees.create_impl``/``update_impl``, so the leaf-department, mandatory-field and protected-field rules apply.
- **Pass 2** sets the links that need pass 1: ``reports_to`` by staff number, ``leave_approver`` and
  ``expense_approver`` by login email, and ``user_id`` with ``create_user_permission`` (a login is created only for
  someone who doesn't have one). Everyone linked gets ``Employee`` and ``Employee Self Service``.
- **Pass 3** creates the opening Leave Allocations, dated at go-live inside the active Leave Period.

Every pass has a dry run that writes nothing. A run (HR Manager or System Manager) happens in a background job,
writes nothing if any row has an error, and is recorded in ``HR Import Run``. The template's columns come from
``FIELDS``, the same list the validators read, so they can't drift. Imported records are never demo records.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

import base64
import csv
import io
from datetime import date, datetime
from typing import Any, Iterable, NamedTuple

RUN = "HR Import Run"
RUN_ROLES = ("HR Manager", "System Manager")
DRY_RUN_ROLES = ("HR Manager", "HR User", "System Manager")
PASSES = (1, 2, 3)
STATUSES = ("Active", "Inactive", "Suspended")
MAX_ROWS = 5000


class Field(NamedTuple):
    name: str
    label: str
    required: bool = False
    kind: str = "text"  # text | date | int | number | email
    lookup: str | None = None  # key of ``lookups`` the value must be in


# Brief §2.1. Order is the template's column order.
FIELDS: dict[int, tuple[Field, ...]] = {
    1: (
        Field("employee_number", "Staff number", True),
        Field("first_name", "First name", True),
        Field("middle_name", "Middle name"),
        Field("last_name", "Last name"),
        Field("gender", "Gender", True, lookup="genders"),
        Field("date_of_birth", "Date of birth", True, "date"),
        Field("date_of_joining", "Date of joining", True, "date"),
        Field("status", "Status"),
        Field("department", "Department", True, lookup="departments"),
        Field("designation", "Designation", True, lookup="designations"),
        Field("grade", "Grade", lookup="grades"),
        Field("branch", "Branch", lookup="branches"),
        Field("employment_type", "Employment type", lookup="employment_types"),
        Field("holiday_list", "Holiday list", lookup="holiday_lists"),
        Field("scheduled_confirmation_date", "Probation ends", kind="date"),
        Field("final_confirmation_date", "Confirmed on", kind="date"),
        Field("contract_end_date", "Contract ends", kind="date"),
        Field("notice_number_of_days", "Notice (days)", kind="int"),
        Field("payroll_cost_center", "Payroll cost centre", lookup="cost_centers"),
    ),
    2: (
        Field("employee_number", "Staff number", True),
        Field("reports_to", "Line manager's staff number"),
        Field("leave_approver", "Leave approver email", kind="email"),
        Field("expense_approver", "Expense approver email", kind="email"),
        Field("user_id", "Login email", kind="email"),
    ),
    3: (
        Field("employee_number", "Staff number", True),
        Field("leave_type", "Leave type", True, lookup="leave_types"),
        Field("balance", "Opening balance (days)", True, "number"),
    ),
}
PASS_TITLES = {1: "Records", 2: "Line managers, approvers and logins", 3: "Opening leave balances"}
LOOKUP_LABELS = {
    "genders": "gender",
    "departments": "department",
    "designations": "designation",
    "grades": "grade",
    "branches": "branch",
    "employment_types": "employment type",
    "holiday_lists": "holiday list",
    "cost_centers": "cost centre",
    "leave_types": "leave type",
}
# Pass-1 fields an update may set directly: setup fields with no approval of their own. Job fields go through
# ``employees.update_impl`` (moves on an active record need a promotion or transfer); the rest are refused there.
SETUP_FIELDS = (
    "employment_type",
    "holiday_list",
    "scheduled_confirmation_date",
    "final_confirmation_date",
    "contract_end_date",
    "notice_number_of_days",
    "payroll_cost_center",
    "middle_name",
)
LINK_FIELDS = ("reports_to", "leave_approver", "expense_approver", "user_id")


def _s(v: Any) -> str:
    if isinstance(v, float) and v.is_integer():
        v = int(v)  # an XLSX staff number 1042 arrives as 1042.0
    return str(v if v is not None else "").strip()


def pass_no_error(pass_no: Any) -> str | None:
    return None if _int(pass_no) in PASSES else "Choose pass 1, 2 or 3."


def _int(v: Any) -> int | None:
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def parse_date(v: Any) -> date | None:
    """ISO ``2026-01-31``, day-first ``31/01/2026``, or an XLSX date cell. None when it isn't a date."""
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = _s(v)[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def template_columns(pass_no: int) -> list[str]:
    return [f.label for f in FIELDS[pass_no]]


def read_table(table: list[list[Any]], pass_no: int) -> tuple[list[dict[str, Any]], list[str]]:
    """Header row + data rows → row dicts keyed by field name. Columns match by label or field name, any case."""
    if not table:
        return [], ["The file is empty."]
    by_key = {k: f.name for f in FIELDS[pass_no] for k in (f.label.lower(), f.name.lower())}
    header = [by_key.get(_s(h).lower()) for h in table[0]]
    present = set(h for h in header if h)
    missing = [f.label for f in FIELDS[pass_no] if f.required and f.name not in present]
    errs = [f"Missing column: {', '.join(missing)}. Download the pass {pass_no} template."] if missing else []
    rows = []
    for cells in table[1:]:
        if not any(_s(c) for c in cells):
            continue
        rows.append({name: cells[i] if i < len(cells) else None for i, name in enumerate(header) if name})
    if len(rows) > MAX_ROWS:
        errs.append(f"The file has {len(rows)} rows; split it into files of {MAX_ROWS} or fewer.")
    if not rows and not errs:
        errs.append("The file has a header but no rows.")
    return rows, errs


def _err(field: str, message: str) -> dict[str, str]:
    return {"field": field, "message": message}


def _resolve(value: str, table: dict[str, str]) -> str | None:
    """``table`` maps a lower-cased name or title → the record name."""
    return table.get(value.lower())


def duplicates(rows: Iterable[dict[str, Any]], *fields: str) -> set[tuple[str, ...]]:
    seen: set[tuple[str, ...]] = set()
    dup: set[tuple[str, ...]] = set()
    for r in rows:
        key = tuple(_s(r.get(f)).lower() for f in fields)
        if not all(key):
            continue
        (dup if key in seen else seen).add(key)
    return dup


def validate_row(row: dict[str, Any], lookups: dict[str, Any], duplicate_numbers: Iterable[str] = ()) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Pass 1. Returns the cleaned values (names resolved, dates as ``date``) and per-cell errors.

    ``lookups`` maps each ``Field.lookup`` to {lower-cased name or title: record name}, plus ``leaf_departments``
    (the set of department names that are enabled leaves in the company).
    """
    clean: dict[str, Any] = {}
    errs: list[dict[str, str]] = []
    for f in FIELDS[1]:
        raw = _s(row.get(f.name))
        if not raw:
            if f.required:
                errs.append(_err(f.name, f"{f.label} is required."))
            continue
        if f.kind == "date":
            d = parse_date(row.get(f.name))
            if d is None:
                errs.append(_err(f.name, f"{f.label} isn't a date. Use YYYY-MM-DD or DD/MM/YYYY."))
            else:
                clean[f.name] = d
        elif f.kind == "int":
            n = _int(raw)
            if n is None or n < 0:
                errs.append(_err(f.name, f"{f.label} must be a whole number of days."))
            else:
                clean[f.name] = n
        elif f.lookup:
            found = _resolve(raw, lookups.get(f.lookup) or {})
            if found is None:
                errs.append(_err(f.name, f"Unknown {LOOKUP_LABELS[f.lookup]} \"{raw}\"."))
            else:
                clean[f.name] = found
        else:
            clean[f.name] = raw
    if clean.get("department") and clean["department"] not in (lookups.get("leaf_departments") or set()):
        errs.append(_err("department", f"\"{_s(row.get('department'))}\" is a group of departments or disabled. Choose the department the person works in."))
    if clean.get("status") and clean["status"] not in STATUSES:
        errs.append(_err("status", "Status must be Active, Inactive or Suspended. Record leavers through separation."))
    number = clean.get("employee_number", "")
    if number and number.lower() in {_s(n).lower() for n in duplicate_numbers}:
        errs.append(_err("employee_number", f"Staff number {number} appears more than once in the file."))
    joined, confirmed = clean.get("date_of_joining"), clean.get("scheduled_confirmation_date")
    if joined and confirmed and confirmed < joined:
        errs.append(_err("scheduled_confirmation_date", "Probation can't end before the date of joining."))
    born = clean.get("date_of_birth")
    if born and joined and born >= joined:
        errs.append(_err("date_of_birth", "Date of birth must be before the date of joining."))
    ends = clean.get("contract_end_date")
    if ends and joined and ends < joined:
        errs.append(_err("contract_end_date", "The contract can't end before the date of joining."))
    return clean, errs


def reports_to_cycles(edges: dict[str, str]) -> set[str]:
    """Staff numbers that sit on a ``reports_to`` loop. ``edges`` maps staff number → line manager's number."""
    in_cycle: set[str] = set()
    done: set[str] = set()
    for start in edges:
        path: list[str] = []
        on_path: set[str] = set()
        node: str | None = start
        while node and node not in done:
            if node in on_path:
                in_cycle.update(path[path.index(node):])
                break
            path.append(node)
            on_path.add(node)
            node = edges.get(node)
        done.update(path)
    return in_cycle


def validate_links(
    row: dict[str, Any],
    by_number: dict[str, dict[str, Any]],
    users: dict[str, str],
    new_users: Iterable[str] = (),
    cycles: Iterable[str] = (),
    duplicate_users: Iterable[str] = (),
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Pass 2. ``by_number``: staff number (lower-cased) → {name, status, reports_to, user_id, ...} from pass 1.
    ``users``: lower-cased email → the Employee already linked to it ("" when none). ``new_users``: login emails
    this file links, so an approver can be someone whose login the same run sets up. Returns the cleaned links
    (``reports_to`` as the Employee name) and per-cell errors."""
    clean: dict[str, Any] = {}
    errs: list[dict[str, str]] = []
    number = _s(row.get("employee_number"))
    me = by_number.get(number.lower())
    if not number:
        return clean, [_err("employee_number", "Staff number is required.")]
    if me is None:
        return clean, [_err("employee_number", f"No employee has staff number {number}. Import the person in pass 1 first.")]
    clean["employee"] = me["name"]
    joining = {e.lower() for e in new_users}

    manager = _s(row.get("reports_to"))
    if manager:
        boss = by_number.get(manager.lower())
        if manager.lower() == number.lower():
            errs.append(_err("reports_to", "Someone can't be their own line manager."))
        elif boss is None:
            errs.append(_err("reports_to", f"No employee has staff number {manager}."))
        elif number.lower() in {c.lower() for c in cycles}:
            errs.append(_err("reports_to", f"Line managers go round in a loop through staff number {number}."))
        elif me.get("reports_to") and me["reports_to"] != boss["name"] and (me.get("status") or "Active") == "Active":
            errs.append(_err("reports_to", "This person already has a different line manager. Change it through a transfer, so it's approved and kept in the history."))
        else:
            clean["reports_to"] = boss["name"]

    login = _s(row.get("user_id")).lower()
    for field, label in (("leave_approver", "Leave approver"), ("expense_approver", "Expense approver")):
        email = _s(row.get(field)).lower()
        if not email:
            continue
        if "@" not in email:
            errs.append(_err(field, f"{label} must be an email address."))
        elif email == login or (email == _s(me.get("user_id")).lower() and email):
            errs.append(_err(field, f"Someone can't be their own {label.lower()}."))
        elif email not in users and email not in joining:
            errs.append(_err(field, f"No login for {email}. Add the approver's login email to their own row first."))
        else:
            clean[field] = email

    if login:
        linked = users.get(login)
        if "@" not in login:
            errs.append(_err("user_id", "Login email must be an email address."))
        elif login in {u.lower() for u in duplicate_users}:
            errs.append(_err("user_id", f"{login} is given to more than one person in the file."))
        elif linked and linked != me["name"]:
            errs.append(_err("user_id", f"{login} already logs in as {linked}."))
        elif me.get("user_id") and _s(me["user_id"]).lower() != login:
            errs.append(_err("user_id", f"This person already logs in as {me['user_id']}."))
        else:
            clean["user_id"] = login
    return clean, errs


def validate_balance(row: dict[str, Any], by_number: dict[str, dict[str, Any]], leave_types: dict[str, str],
                     allocated: Iterable[tuple[str, str]] = (), duplicate_keys: Iterable[tuple[str, str]] = ()) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Pass 3. ``allocated``: (employee, leave type) pairs that already have an allocation in the period."""
    clean: dict[str, Any] = {}
    errs: list[dict[str, str]] = []
    number, kind = _s(row.get("employee_number")), _s(row.get("leave_type"))
    me = by_number.get(number.lower()) if number else None
    if not number:
        errs.append(_err("employee_number", "Staff number is required."))
    elif me is None:
        errs.append(_err("employee_number", f"No employee has staff number {number}. Import the person in pass 1 first."))
    leave_type = _resolve(kind, leave_types) if kind else None
    if not kind:
        errs.append(_err("leave_type", "Leave type is required."))
    elif leave_type is None:
        errs.append(_err("leave_type", f"Unknown leave type \"{kind}\"."))
    try:
        balance = float(_s(row.get("balance")))
    except ValueError:
        balance = None
    if balance is None or balance < 0:
        errs.append(_err("balance", "Opening balance must be a number of days, 0 or more."))
    if me and leave_type:
        if (number.lower(), kind.lower()) in set(duplicate_keys):
            errs.append(_err("leave_type", f"Staff number {number} has {leave_type} more than once in the file."))
        elif (me["name"], leave_type) in set(allocated):
            errs.append(_err("leave_type", f"{me['name']} already has a {leave_type} allocation in this leave period."))
    if not errs:
        clean = {"employee": me["name"], "leave_type": leave_type, "balance": balance}
    return clean, errs


def pass_order_error(pass_no: int, done: Iterable[int]) -> str | None:
    """Pass 2 and 3 need a finished pass 1: the staff numbers they refer to come from it."""
    if pass_no in (2, 3) and 1 not in set(done):
        return "Run pass 1 (the records) first. Passes 2 and 3 refer to the staff numbers it creates."
    return None


def changes_for(clean: dict[str, Any], existing: dict[str, Any], fields: Iterable[str]) -> dict[str, Any]:
    """The fields the file changes on an existing record (dates compared as dates, blanks never clear a value)."""
    out = {}
    for f in fields:
        if f not in clean:
            continue
        new, old = clean[f], existing.get(f)
        if isinstance(new, date):
            same = parse_date(old) == new if old else False
        elif isinstance(new, int):
            same = _int(old) == new
        else:
            same = _s(old) == _s(new)
        if not same:
            out[f] = new
    return out


def result(pass_no: int, rows: int, errors: list[dict[str, Any]], create: int = 0, update: int = 0, unchanged: int = 0,
           warnings: list[str] | None = None) -> dict[str, Any]:
    return {
        "pass_no": pass_no,
        "rows": rows,
        "create": create,
        "update": update,
        "unchanged": unchanged,
        "errors": errors,
        "warnings": warnings or [],
        "ok": not errors,
    }


def read_file(file_name: str, content: bytes) -> list[list[Any]]:
    """CSV (UTF-8, with or without BOM) or XLSX → a table of cells."""
    name = (file_name or "").lower()
    if name.endswith(".xlsx"):
        from frappe.utils.xlsxutils import read_xlsx_file_from_attached_file

        return [list(r) for r in read_xlsx_file_from_attached_file(fcontent=content)]
    if name.endswith(".csv"):
        return [row for row in csv.reader(io.StringIO(content.decode("utf-8-sig")))]
    raise ValueError("Send a .csv or .xlsx file.")


def decode(file: dict[str, Any] | None) -> tuple[str, bytes]:
    """``file`` is {file_name, content (base64)} as Core sends it."""
    if not file or not file.get("content"):
        raise ValueError("Attach the file to import.")
    try:
        return _s(file.get("file_name")), base64.b64decode(file["content"])
    except (ValueError, TypeError) as exc:
        raise ValueError("The file couldn't be read.") from exc


# ---------------------------------------------------------------- Frappe glue


def _require(roles: tuple[str, ...], what: str) -> None:
    import frappe

    if not set(frappe.get_roles()) & set(roles):
        frappe.throw(f"Only {' or '.join(r for r in roles if r != 'System Manager')} can {what}.", frappe.PermissionError)


def _names(doctype: str, title: str | None = None, filters: dict | None = None) -> dict[str, str]:
    import frappe

    if not frappe.db.exists("DocType", doctype):
        return {}
    fields = ["name"] + ([title] if title else [])
    out: dict[str, str] = {}
    for r in frappe.get_all(doctype, filters=filters, fields=fields, limit=0):
        out[_s(r.get("name")).lower()] = r["name"]
        if title and r.get(title):
            out.setdefault(_s(r[title]).lower(), r["name"])
    return out


def _lookups() -> dict[str, Any]:
    import frappe

    from eswasa_hr.recruitment import _company

    company = _company()
    depts = frappe.get_all("Department", fields=["name", "department_name", "is_group", "disabled", "company"], limit=0)
    table: dict[str, str] = {}
    for d in depts:
        table[_s(d["name"]).lower()] = d["name"]
        if d.get("department_name") and (not company or d.get("company") in (None, "", company)):
            table.setdefault(_s(d["department_name"]).lower(), d["name"])
    leaves = {d["name"] for d in depts if not int(d.get("is_group") or 0) and not int(d.get("disabled") or 0)
              and (not company or not d.get("company") or d["company"] == company)}
    return {
        "genders": _names("Gender"),
        "departments": table,
        "leaf_departments": leaves,
        "designations": _names("Designation", "designation_name"),
        "grades": _names("Employee Grade"),
        "branches": _names("Branch"),
        "employment_types": _names("Employment Type"),
        "holiday_lists": _names("Holiday List", "holiday_list_name"),
        "cost_centers": _names("Cost Center", "cost_center_name", {"is_group": 0}),
        "leave_types": _names("Leave Type", "leave_type_name"),
    }


EMPLOYEE_FIELDS = ["name", "employee_number", "employee_name", "status", "user_id", "reports_to", "leave_approver", "expense_approver",
                   "department", "designation", "grade", "branch", "gender", "date_of_birth", "date_of_joining", *SETUP_FIELDS]


def _employees() -> dict[str, dict[str, Any]]:
    import frappe

    fields = [f for f in EMPLOYEE_FIELDS if f == "name" or frappe.get_meta("Employee").has_field(f)]
    return {_s(r.get("employee_number")).lower(): dict(r) for r in frappe.get_all("Employee", fields=fields, limit=0) if _s(r.get("employee_number"))}


def _demo_warning() -> list[str]:
    import frappe

    if not frappe.get_meta("Employee").has_field("custom_is_demo"):
        return []
    n = frappe.db.count("Employee", {"custom_is_demo": 1})
    return [f"{n} demo employee record{'s' if n != 1 else ''} exist. Imported records aren't demo records; remove the demo ones before go-live."] if n else []


def _rows_with_numbers(rows: list[dict[str, Any]], checked: list[tuple[dict[str, Any], list[dict[str, str]]]]) -> list[dict[str, Any]]:
    errors = []
    for i, (_clean, errs) in enumerate(checked):
        for e in errs:
            errors.append({"row": i + 2, "employee_number": _s(rows[i].get("employee_number")) or None, **e})  # row 1 is the header
    return errors


def _done_passes() -> set[int]:
    import frappe

    if not frappe.db.exists("DocType", RUN):
        return set()
    return {_int(r.get("pass_no")) for r in frappe.get_all(RUN, filters={"status": "Done"}, fields=["pass_no"], limit=0)}


def _leave_period(on: date) -> dict[str, Any] | None:
    import frappe

    from eswasa_hr.recruitment import _company

    if not frappe.db.exists("DocType", "Leave Period"):
        return None
    filters: dict[str, Any] = {"is_active": 1, "from_date": ["<=", str(on)], "to_date": [">=", str(on)]}
    company = _company()
    for r in frappe.get_all("Leave Period", filters=filters, fields=["name", "from_date", "to_date", "company"], limit=0):
        if not company or not r.get("company") or r["company"] == company:
            return dict(r)
    return None


def check(pass_no: int, rows: list[dict[str, Any]], go_live: date | None = None) -> dict[str, Any]:
    """Validate every row against live data. Returns the result plus ``plan`` (the writes a run would make)."""
    import frappe
    from frappe.utils import getdate, nowdate

    employees = _employees()
    plan: list[tuple[str, dict[str, Any]]] = []
    create = update = unchanged = 0
    warnings: list[str] = []
    if pass_no == 1:
        lookups = _lookups()
        dup = {k[0] for k in duplicates(rows, "employee_number")}
        checked = [validate_row(r, lookups, dup) for r in rows]
        from eswasa_hr.employees import update_errors

        for i, (clean, errs) in enumerate(checked):
            if errs:
                continue
            existing = employees.get(clean["employee_number"].lower())
            if existing is None:
                create += 1
                plan.append(("create", clean))
                continue
            job = changes_for(clean, existing, ("department", "designation", "grade", "branch", "status", "gender", "date_of_birth", "date_of_joining"))
            setup = changes_for(clean, existing, SETUP_FIELDS)
            if not job and not setup:
                unchanged += 1
                continue
            for msg in update_errors(job, existing.get("status")) if job else []:
                errs.append(_err(next(iter(job)), msg))
            if not errs:
                update += 1
                plan.append(("update", {"employee": existing["name"], "job": job, "setup": setup}))
        warnings += _demo_warning()
    elif pass_no == 2:
        users_rows = frappe.get_all("User", fields=["name", "email"], limit=0)
        linked = {_s(e.get("user_id")).lower(): e["name"] for e in employees.values() if e.get("user_id")}
        users = {}
        for u in users_rows:
            for key in {_s(u.get("name")).lower(), _s(u.get("email")).lower()} - {""}:
                users[key] = linked.get(key, "")
        edges = {k: _s(e.get("reports_to")) for k, e in employees.items()}
        name_to_number = {e["name"]: k for k, e in employees.items()}
        edges = {k: name_to_number.get(v, "") for k, v in edges.items() if v}
        for r in rows:
            n, m = _s(r.get("employee_number")).lower(), _s(r.get("reports_to")).lower()
            if n and m:
                edges[n] = m
        cycles = reports_to_cycles(edges)
        logins = [_s(r.get("user_id")).lower() for r in rows if _s(r.get("user_id"))]
        dup_users = {k[0] for k in duplicates(rows, "user_id")}
        checked = [validate_links(r, employees, users, logins, cycles, dup_users) for r in rows]
        by_name = {e["name"]: e for e in employees.values()}
        for clean, errs in checked:
            if errs:
                continue
            changes = changes_for(clean, by_name[clean["employee"]], LINK_FIELDS)
            if changes:
                update += 1
                plan.append(("link", {"employee": clean["employee"], "changes": changes}))
            else:
                unchanged += 1
    else:
        on = go_live or getdate(nowdate())
        period = _leave_period(on)
        if period is None:
            return {**result(pass_no, len(rows), [{"row": None, "employee_number": None, "field": None,
                                                  "message": f"No active Leave Period covers {on}. Set up the leave period first (H14)."}]), "plan": []}
        allocated = set()
        if frappe.db.exists("DocType", "Leave Allocation"):
            for a in frappe.get_all("Leave Allocation", filters={"docstatus": 1, "to_date": [">=", str(period["from_date"])]},
                                    fields=["employee", "leave_type", "from_date", "to_date"], limit=0):
                if _s(a.get("from_date")) <= _s(period["to_date"]):
                    allocated.add((a["employee"], a["leave_type"]))
        dup = duplicates(rows, "employee_number", "leave_type")
        types = _lookups()["leave_types"]
        checked = [validate_balance(r, employees, types, allocated, dup) for r in rows]
        for clean, errs in checked:
            if not errs:
                create += 1
                plan.append(("allocate", {**clean, "from_date": on, "to_date": getdate(period["to_date"])}))
    errors = _rows_with_numbers(rows, checked)
    return {**result(pass_no, len(rows), errors, create, update, unchanged, warnings), "plan": [] if errors else plan}


def _parse(file: dict[str, Any] | None, pass_no: int) -> tuple[str, bytes, list[dict[str, Any]], list[str]]:
    import frappe

    try:
        name, content = decode(file)
        table = read_file(name, content)
    except ValueError as exc:
        frappe.throw(str(exc), frappe.ValidationError)
    rows, errs = read_table(table, pass_no)
    return name, content, rows, errs


def _file_error(pass_no: int, rows: int, errs: list[str]) -> dict[str, Any]:
    return result(pass_no, rows, [{"row": None, "employee_number": None, "field": None, "message": m} for m in errs])


def dry_run_impl(file: dict[str, Any] | None, pass_no: Any, go_live: Any = None) -> dict[str, Any]:
    """Check a file and count what a run would do. Writes nothing."""
    import frappe

    _require(DRY_RUN_ROLES, "check an import")
    err = pass_no_error(pass_no)
    if err:
        frappe.throw(err, frappe.ValidationError)
    pass_no = int(pass_no)
    _name, _content, rows, errs = _parse(file, pass_no)
    if errs:
        return _file_error(pass_no, len(rows), errs)
    order = pass_order_error(pass_no, _done_passes())
    if order:
        return _file_error(pass_no, len(rows), [order])
    out = check(pass_no, rows, parse_date(go_live) if go_live else None)
    out.pop("plan", None)
    return out


def apply(pass_no: int, plan: list[tuple[str, dict[str, Any]]]) -> None:
    """Make the writes ``check`` planned. The caller rolls back if anything here throws."""
    import frappe

    from eswasa_hr import employees

    for action, data in plan:
        if action == "create":
            row = {k: (str(v) if isinstance(v, date) else v) for k, v in data.items()}
            row["employee_name"] = " ".join(_s(row.get(k)) for k in ("first_name", "middle_name", "last_name") if _s(row.get(k)))
            employees.create_impl(row)
        elif action == "update":
            if data["job"]:
                employees.update_impl(data["employee"], {k: (str(v) if isinstance(v, date) else v) for k, v in data["job"].items()})
            if data["setup"]:
                doc = frappe.get_doc("Employee", data["employee"])
                doc.update({k: (str(v) if isinstance(v, date) else v) for k, v in data["setup"].items()})
                doc.save()
        elif action == "link":
            changes = dict(data["changes"])
            doc = frappe.get_doc("Employee", data["employee"])
            login = changes.pop("user_id", None)
            if login:
                changes["user_id"] = employees._invite(login, doc.employee_name, employees.invite_roles(None, frappe.get_roles()))
                changes["create_user_permission"] = 1
                user = frappe.get_doc("User", changes["user_id"])
                user.add_roles("Employee", "Employee Self Service")
            doc.update(changes)
            doc.save()
        elif action == "allocate":
            alloc = frappe.get_doc(
                {
                    "doctype": "Leave Allocation",
                    "employee": data["employee"],
                    "leave_type": data["leave_type"],
                    "from_date": str(data["from_date"]),
                    "to_date": str(data["to_date"]),
                    "new_leaves_allocated": data["balance"],
                    "description": "Opening balance at go-live (HR import pass 3)",
                }
            )
            alloc.insert()
            alloc.submit()


def run_impl(file: dict[str, Any] | None, pass_no: Any, go_live: Any = None) -> dict[str, Any]:
    """Record the run and start the background job. Returns {job_id, run, status}."""
    import frappe
    from frappe.utils import now_datetime

    _require(RUN_ROLES, "run an import")
    err = pass_no_error(pass_no)
    if err:
        frappe.throw(err, frappe.ValidationError)
    pass_no = int(pass_no)
    name, content, rows, errs = _parse(file, pass_no)
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    order = pass_order_error(pass_no, _done_passes())
    if order:
        frappe.throw(order, frappe.ValidationError)
    run = frappe.get_doc(
        {
            "doctype": RUN,
            "pass_no": str(pass_no),
            "status": "Queued",
            "file_name": name,
            "rows": len(rows),
            "run_by": frappe.session.user,
            "started_on": now_datetime(),
            "go_live": str(parse_date(go_live)) if go_live and parse_date(go_live) else None,
        }
    )
    run.insert(ignore_permissions=True)
    _keep_file(run.name, name, content)
    frappe.enqueue(process_run, queue="long", timeout=1800, enqueue_after_commit=True, run=run.name,
                   content=base64.b64encode(content).decode(), file_name=name)
    return {"job_id": run.name, "run": run.name, "status": "Queued"}


def _keep_file(run: str, name: str, content: bytes) -> None:
    """The uploaded file stays with its run (private), so HR can see exactly what was loaded."""
    import frappe

    f = frappe.get_doc({"doctype": "File", "file_name": name, "attached_to_doctype": RUN, "attached_to_name": run, "is_private": 1, "content": content})
    f.insert(ignore_permissions=True)
    frappe.db.set_value(RUN, run, "file", f.get("file_url") or f.name)


def process_run(run: str, content: str, file_name: str) -> dict[str, Any]:
    """The background job: check again against live data, then apply everything or nothing."""
    import json

    import frappe
    from frappe.utils import now_datetime

    doc = frappe.db.get_value(RUN, run, ["pass_no", "go_live"], as_dict=True)
    pass_no = int(doc["pass_no"])
    frappe.db.set_value(RUN, run, "status", "Running")
    frappe.db.commit()
    status, out = "Failed", result(pass_no, 0, [])
    try:
        rows, errs = read_table(read_file(file_name, base64.b64decode(content)), pass_no)
        out = _file_error(pass_no, len(rows), errs) if errs else check(pass_no, rows, parse_date(doc.get("go_live")) if doc.get("go_live") else None)
        plan = out.pop("plan", [])
        if out["ok"]:
            apply(pass_no, plan)
            status = "Done"
    except Exception as exc:  # noqa: BLE001 - any failure undoes the whole run
        frappe.db.rollback()
        out = {**out, "ok": False, "errors": [{"row": None, "employee_number": None, "field": None, "message": f"Nothing was imported: {exc}"}]}
    if not out["ok"]:
        out = {**out, "create": 0, "update": 0}  # the counts say what was written
    frappe.db.set_value(RUN, run, {
        "status": status,
        "created": out["create"],
        "updated": out["update"],
        "unchanged": out["unchanged"],
        "error_count": len(out["errors"]),
        "errors": json.dumps(out["errors"]),
        "warnings": json.dumps(out["warnings"]),
        "finished_on": now_datetime(),
    })
    frappe.db.commit()
    return out


RUN_FIELDS = ["name", "pass_no", "status", "file_name", "file", "rows", "created", "updated", "unchanged", "error_count", "errors", "warnings",
              "run_by", "started_on", "finished_on", "go_live"]


def run_row(r: dict[str, Any], with_errors: bool = False) -> dict[str, Any]:
    import json

    def _load(v: Any) -> list[Any]:
        if isinstance(v, list):
            return v
        try:
            return json.loads(v or "[]")
        except ValueError:
            return []

    out = {
        "id": r.get("name"),
        "pass_no": _int(r.get("pass_no")),
        "status": r.get("status"),
        "file_name": r.get("file_name"),
        "rows": int(r.get("rows") or 0),
        "created": int(r.get("created") or 0),
        "updated": int(r.get("updated") or 0),
        "unchanged": int(r.get("unchanged") or 0),
        "error_count": int(r.get("error_count") or 0),
        "run_by": r.get("run_by"),
        "started_on": _s(r.get("started_on")) or None,
        "finished_on": _s(r.get("finished_on")) or None,
        "go_live": _s(r.get("go_live")) or None,
    }
    if with_errors:
        out["errors"] = _load(r.get("errors"))
        out["warnings"] = _load(r.get("warnings"))
    return out


def runs_impl(pass_no: Any = None) -> list[dict[str, Any]]:
    import frappe

    _require(DRY_RUN_ROLES, "see imports")
    if not frappe.db.exists("DocType", RUN):
        return []
    filters = {"pass_no": str(_int(pass_no))} if _int(pass_no) in PASSES else None
    rows = frappe.get_all(RUN, filters=filters, fields=RUN_FIELDS, order_by="creation desc", limit=200)
    return [run_row(r) for r in rows]


def run_detail_impl(name: str) -> dict[str, Any]:
    import frappe

    _require(DRY_RUN_ROLES, "see imports")
    row = frappe.db.get_value(RUN, name, RUN_FIELDS, as_dict=True) if frappe.db.exists("DocType", RUN) else None
    if not row:
        frappe.throw("Import run not found.", frappe.DoesNotExistError)
    return run_row(dict(row), with_errors=True)


def last_runs() -> dict[int, dict[str, Any]]:
    """The newest run per pass (for HR setup), or {} before any."""
    import frappe

    if not frappe.db.exists("DocType", RUN):
        return {}
    out: dict[int, dict[str, Any]] = {}
    for r in frappe.get_all(RUN, fields=["name", "pass_no", "status", "created", "updated", "error_count", "finished_on"], order_by="creation desc", limit=200):
        out.setdefault(_int(r.get("pass_no")), dict(r))
    return out


def import_state(last: dict[int, dict[str, Any]]) -> tuple[str, str]:
    """(state, detail) for the setup step: done when passes 1 and 2 last finished, partial when anything ran."""
    done = [p for p in (1, 2) if (last.get(p) or {}).get("status") == "Done"]
    if len(done) == 2:
        return "done", "Records and line managers imported."
    if not last:
        return "todo", "No import yet. Import in two passes: records, then line managers, approvers and logins."
    parts = []
    for p in PASSES:
        r = last.get(p)
        if r:
            parts.append(f"pass {p} {str(r.get('status') or '').lower()}")
    return "partial", "Last runs: " + ", ".join(parts) + "."


def template_impl(pass_no: Any) -> dict[str, Any]:
    """The pass's column template as XLSX, base64: {file_name, content}."""
    import frappe

    _require(DRY_RUN_ROLES, "download the import template")
    err = pass_no_error(pass_no)
    if err:
        frappe.throw(err, frappe.ValidationError)
    from frappe.utils.xlsxutils import make_xlsx

    p = int(pass_no)
    data = make_xlsx([template_columns(p)], f"Pass {p}").getvalue()
    return {"file_name": f"eswasa-employee-import-pass-{p}.xlsx", "content": base64.b64encode(data).decode()}


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


def _file_arg(file: Any) -> dict[str, Any] | None:
    import json

    return json.loads(file) if isinstance(file, str) else file


@_whitelist
def template(pass_no: Any = 1) -> dict[str, Any]:
    return template_impl(pass_no)


@_whitelist
def dry_run(file: Any = None, pass_no: Any = 1, go_live: Any = None) -> dict[str, Any]:
    return dry_run_impl(_file_arg(file), pass_no, go_live)


@_whitelist
def run(file: Any = None, pass_no: Any = 1, go_live: Any = None, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return run_impl(_file_arg(file), pass_no, go_live)


@_whitelist
def runs(pass_no: Any = None) -> list[dict[str, Any]]:
    return runs_impl(pass_no)


@_whitelist
def run_detail(name: str) -> dict[str, Any]:
    return run_detail_impl(name)
