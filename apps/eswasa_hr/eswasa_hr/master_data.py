"""
Structure master data (screen H0 "Structure"): departments, designations, locations, cost centres, grade bands.

Core used to insert and ``set_value`` these with ``frappe.client``, so a department could land under a disabled
or another company's parent, and a department still in use could be disabled. Creating and editing now happen here:
- Create checks the company, that the parent is an enabled group, and that the name isn't taken.
- Disabling a department or cost centre is refused while people, Staffing Plans or sub-departments still use it,
  with a plain reason ("3 active people and 1 submitted Staffing Plan still use this department.").
- A department head is set only through ``POST /hr/departments/{id}/head``, never here.
HR Manager or System Manager only. Methods return the stored row; Core maps it to the screen's shape.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any

MANAGER_ROLES = ("HR Manager", "System Manager")
ROOT_DEPARTMENT = "All Departments"

# kind -> (DocType, title field, label)
KINDS: dict[str, tuple[str, str, str]] = {
    "department": ("Department", "department_name", "department"),
    "designation": ("Designation", "designation_name", "designation"),
    "location": ("Branch", "branch", "location"),
    "cost_centre": ("Cost Center", "cost_center_name", "cost centre"),
    "grade_band": ("Employee Grade", "name", "grade band"),
}
# Kinds that belong to a company and sit in a tree.
COMPANY_KINDS = ("department", "cost_centre")
HEAD_FIELDS = ("custom_head", "department_head", "head")

# What can still use a record, singular and plural.
NOUNS = {
    "people": ("active person", "active people"),
    "staffing_plans": ("submitted Staffing Plan", "submitted Staffing Plans"),
    "sub_departments": ("enabled sub-department", "enabled sub-departments"),
    "departments": ("enabled department", "enabled departments"),
}


def _s(v: Any) -> str:
    return str(v or "").strip()


def _join(parts: list[str]) -> str:
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def disable_blockers(counts: dict[str, int], label: str) -> str | None:
    """Why a record can't be disabled yet, or None. ``counts`` is keyed by NOUNS."""
    parts = [f"{n} {NOUNS[k][0] if n == 1 else NOUNS[k][1]}" for k, n in counts.items() if n]
    if not parts:
        return None
    verb = "uses" if len(parts) == 1 and next(n for n in counts.values() if n) == 1 else "use"
    return f"{_join(parts)} still {verb} this {label}."


def parent_error(parent: dict[str, Any] | None, company: str | None, label: str) -> str | None:
    """``parent`` is the parent row (is_group, disabled, company), or None when it doesn't exist."""
    if parent is None:
        return f"That parent {label} doesn't exist."
    if not int(parent.get("is_group") or 0):
        return f"The parent must be a group of {label}s, not a single {label}."
    if int(parent.get("disabled") or 0):
        return f"The parent {label} is disabled."
    if company and parent.get("company") and parent["company"] != company:
        return f"The parent {label} belongs to another company."
    return None


def create_errors(kind: str, title: str, company: str | None, parent: dict[str, Any] | None = None, check_parent: bool = False, duplicate: bool = False) -> list[str]:
    label = KINDS[kind][2]
    errs = []
    if not _s(title):
        errs.append(f"Give the {label} a name.")
    if kind in COMPANY_KINDS and not company:
        errs.append("Set up the organisation first; a " + label + " belongs to it.")
    if check_parent:
        err = parent_error(parent, company, label)
        if err:
            errs.append(err)
    if duplicate:
        errs.append(f"A {label} called {_s(title)} already exists.")
    return errs


def update_errors(kind: str, name: str, changes: dict[str, Any]) -> list[str]:
    label = KINDS[kind][2]
    errs = []
    if kind == "department" and any(f in changes for f in HEAD_FIELDS):
        errs.append("Set the head with Assign head, so the change is recorded.")
    if kind == "department" and changes.get("parent_department") and changes["parent_department"] == name:
        errs.append("A department can't sit under itself.")
    if "title" in changes and not _s(changes["title"]):
        errs.append(f"Give the {label} a name.")
    return errs


# ---------------------------------------------------------------- Frappe glue


def _require_manager() -> None:
    import frappe

    if not set(frappe.get_roles()) & set(MANAGER_ROLES):
        frappe.throw("Only an HR Manager can change the structure.", frappe.PermissionError)


def _company() -> str | None:
    from eswasa_hr.recruitment import _company as company

    return company()


def _row(doctype: str, name: str) -> dict[str, Any]:
    import frappe

    return frappe.get_doc(doctype, name).as_dict()


def _parent(doctype: str, name: str | None) -> dict[str, Any] | None:
    import frappe

    row = frappe.db.get_value(doctype, name, ["is_group", "disabled", "company"], as_dict=True) if name else None
    return dict(row) if row else None


def _department_blockers(name: str) -> str | None:
    import frappe

    counts = {
        "people": frappe.db.count("Employee", {"department": name, "status": "Active"}),
        "staffing_plans": frappe.db.count("Staffing Plan", {"department": name, "docstatus": 1}) if frappe.db.exists("DocType", "Staffing Plan") else 0,
        "sub_departments": frappe.db.count("Department", {"parent_department": name, "disabled": 0}),
    }
    return disable_blockers(counts, "department")


def _cost_centre_blockers(name: str) -> str | None:
    import frappe

    counts = {
        "people": frappe.db.count("Employee", {"payroll_cost_center": name, "status": "Active"}),
        "departments": frappe.db.count("Department", {"payroll_cost_center": name, "disabled": 0}),
    }
    return disable_blockers(counts, "cost centre")


def _throw(errs: list[str]) -> None:
    import frappe

    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)


def create_impl(kind: str, data: dict[str, Any]) -> dict[str, Any]:
    import frappe

    _require_manager()
    doctype, _field, label = KINDS[kind]
    company = _company() if kind in COMPANY_KINDS else None
    title = _s(data.get("title") or data.get("name") or data.get("code"))
    doc: dict[str, Any] = {"doctype": doctype}
    parent, check_parent = None, False

    if kind == "department":
        parent_name = _s(data.get("parent_department_id")) or (ROOT_DEPARTMENT if frappe.db.exists("Department", ROOT_DEPARTMENT) else "")
        if parent_name:
            parent, check_parent = _parent("Department", parent_name), True
        duplicate = bool(frappe.db.exists("Department", {"department_name": title, "company": company}))
        doc.update({"department_name": title, "company": company, "parent_department": parent_name or None})
        cc = _s(data.get("cost_centre_id"))
        if cc:
            if not frappe.db.exists("Cost Center", {"name": cc, "company": company, "disabled": 0}):
                _throw(["That cost centre isn't an enabled cost centre of this company."])
            doc["payroll_cost_center"] = cc
    elif kind == "cost_centre":
        parent_name = _s(data.get("parent_id")) or (frappe.db.get_value("Cost Center", {"company": company, "is_group": 1, "disabled": 0}, "name") if company else None)
        parent, check_parent = _parent("Cost Center", parent_name), bool(company)
        duplicate = bool(frappe.db.exists("Cost Center", {"cost_center_name": title, "company": company}))
        doc.update({"cost_center_name": title, "company": company, "is_group": 0, "parent_cost_center": parent_name})
    elif kind == "designation":
        duplicate = bool(frappe.db.exists("Designation", title))
        doc["designation_name"] = title
        if _s(data.get("description")):
            doc["description"] = _s(data["description"])
        grade = _s(data.get("grade_band_id"))
        if grade:
            if not frappe.db.exists("Employee Grade", grade):
                _throw(["That grade band doesn't exist."])
            doc["custom_grade"] = grade
    elif kind == "location":
        duplicate = bool(frappe.db.exists("Branch", title))
        doc["branch"] = title
    else:  # grade_band
        duplicate = bool(frappe.db.exists("Employee Grade", title))
        doc["__newname"] = title
        doc["grade_name"] = title
        if _s(data.get("description") or data.get("label")):
            doc["description"] = _s(data.get("description") or data.get("label"))

    _throw(create_errors(kind, title, company, parent, check_parent, duplicate))
    d = frappe.get_doc(doc)
    d.insert()
    return d.as_dict()


def update_impl(kind: str, name: str, data: dict[str, Any]) -> dict[str, Any]:
    import frappe

    _require_manager()
    doctype, title_field, label = KINDS[kind]
    if not frappe.db.exists(doctype, name):
        frappe.throw(f"That {label} doesn't exist.", frappe.DoesNotExistError)
    changes = {k: v for k, v in (data or {}).items() if v is not None}
    _throw(update_errors(kind, name, changes))
    updates: dict[str, Any] = {}
    if "title" in changes and title_field != "name":
        updates[title_field] = _s(changes["title"])
    if "description" in changes and kind in ("designation", "grade_band"):
        updates["description"] = changes["description"]

    if kind == "department":
        if "parent_department" in changes:
            p = _s(changes["parent_department"])
            if p:
                _throw([e for e in [parent_error(_parent("Department", p), _company(), label)] if e])
            updates["parent_department"] = p or ROOT_DEPARTMENT
        if "payroll_cost_center" in changes:
            updates["payroll_cost_center"] = _s(changes["payroll_cost_center"]) or None
    if kind == "designation" and "grade_band_id" in changes:
        g = _s(changes["grade_band_id"])
        if g and not frappe.db.exists("Employee Grade", g):
            _throw(["That grade band doesn't exist."])
        updates["custom_grade"] = g or None

    status = changes.get("status")
    if status == "archived" and kind in ("department", "cost_centre"):
        reason = _department_blockers(name) if kind == "department" else _cost_centre_blockers(name)
        _throw([reason] if reason else [])
        updates["disabled"] = 1
    elif status in ("active", "draft") and kind in ("department", "cost_centre"):
        updates["disabled"] = 0

    if updates:
        d = frappe.get_doc(doctype, name)
        d.update(updates)
        d.save()
    return _row(doctype, name)


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


def _confirmed(confirm: Any) -> None:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)


@_whitelist
def create_department(name: str, parent_department_id: str | None = None, cost_centre_id: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirmed(confirm)
    return create_impl("department", {"title": name, "parent_department_id": parent_department_id, "cost_centre_id": cost_centre_id})


@_whitelist
def create_designation(title: str, description: str | None = None, grade_band_id: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirmed(confirm)
    return create_impl("designation", {"title": title, "description": description, "grade_band_id": grade_band_id})


@_whitelist
def create_location(name: str, confirm: Any = False) -> dict[str, Any]:
    _confirmed(confirm)
    return create_impl("location", {"title": name})


@_whitelist
def create_cost_centre(name: str, confirm: Any = False) -> dict[str, Any]:
    _confirmed(confirm)
    return create_impl("cost_centre", {"title": name})


@_whitelist
def create_grade_band(code: str, label: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirmed(confirm)
    return create_impl("grade_band", {"title": code, "label": label})


@_whitelist
def update_department(
    department: str,
    title: str | None = None,
    parent_department: str | None = None,
    payroll_cost_center: str | None = None,
    status: str | None = None,
    confirm: Any = False,
) -> dict[str, Any]:
    _confirmed(confirm)
    return update_impl("department", department, {"title": title, "parent_department": parent_department, "payroll_cost_center": payroll_cost_center, "status": status})


@_whitelist
def update_designation(designation: str, title: str | None = None, description: str | None = None, grade_band_id: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirmed(confirm)
    return update_impl("designation", designation, {"title": title, "description": description, "grade_band_id": grade_band_id})


@_whitelist
def update_location(location: str, title: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirmed(confirm)
    return update_impl("location", location, {"title": title})


@_whitelist
def update_cost_centre(cost_centre: str, status: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirmed(confirm)
    return update_impl("cost_centre", cost_centre, {"status": status})


@_whitelist
def update_grade_band(grade_band: str, description: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirmed(confirm)
    return update_impl("grade_band", grade_band, {"description": description})
