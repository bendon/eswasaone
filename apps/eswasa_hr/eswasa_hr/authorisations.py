"""
Staff authorisations (brief §6.2; journey J4): who may do which audit, review or calibration work.

HR prepares a draft Staff Authorisation (person, competence, validity, evidence). It goes to the head of
the person's department in Approvals (one ToDo for that person — never a role pool). The head approves
or rejects through the ``eswasa_approval_handlers`` hook; approving submits it, and from then on
``competence.assignment_error`` lets Certification and Metrology assign the person until ``valid_to``.

Four-eyes: the approver is never the person authorised, nor whoever prepared it.
Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from eswasa_hr import settings

DOCTYPE = "Staff Authorisation"
HR_ROLES = ("HR Manager", "HR User", "System Manager")
EVIDENCE_TYPES = ("Training Result", "Witnessed audit", "Proficiency test", "File", "Other")
LMS_PREFIX = "LMS:"  # a reference to an LMS Certificate is "LMS:<name>" (plan 07 step 6)


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def status_on(docstatus: int, valid_to: Any, day: date, withdrawn: bool = False) -> str:
    """In training (draft) → Current → Expiring (within the first alert window, HR Settings) → Expired; Withdrawn wins."""
    if withdrawn:
        return "Withdrawn"
    if int(docstatus or 0) == 0:
        return "In training"
    if int(docstatus) == 2:
        return "Withdrawn"
    end = _d(valid_to)
    if end is None:
        return "Current"
    if end < day:
        return "Expired"
    if (end - day).days <= max(settings.get("expiry_alert_days")):
        return "Expiring"
    return "Current"


def default_valid_to(valid_from: Any, months: int | None) -> date | None:
    start = _d(valid_from)
    if not start or not months:
        return None
    y, m = divmod(start.month - 1 + int(months), 12)
    year, month = start.year + y, m + 1
    for day in (start.day, 30, 29, 28):
        try:
            return date(year, month, day) - timedelta(days=1)
        except ValueError:
            continue
    return None  # pragma: no cover


def approver_error(user: str, approver: str | None, person: str | None, preparer: str | None) -> str | None:
    if not approver:
        return "This department has no head set. Set one in Structure before sending authorisations."
    if person and user == person:
        return "You can't approve your own authorisation."
    if preparer and user == preparer:
        return "Whoever prepared an authorisation can't approve it."
    if user != approver:
        return "Only the head of the person's department can approve this."
    return None


def todo_title(employee_name: str, skill: str) -> str:
    return f"Approve authorisation: {employee_name or 'an employee'}, {skill}"


def cover(rows: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    """Per skill: current holders (incl. expiring) and how many of those are expiring."""
    out: dict[str, dict[str, int]] = {}
    for r in rows:
        c = out.setdefault(r["skill"], {"holders": 0, "expiring": 0})
        if r["status"] in ("Current", "Expiring"):
            c["holders"] += 1
        if r["status"] == "Expiring":
            c["expiring"] += 1
    return out


def clean_evidence(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Evidence rows as the form sends them, plus an optional ``file`` (plan 07 step 5): a Core media key, a
    Frappe ``/files/`` URL or a File name. A file on its own is enough to say what the evidence is."""
    out = []
    for i, r in enumerate(rows or [], start=1):
        kind = str(r.get("evidence_type") or "").strip()
        ref = str(r.get("reference") or "").strip()
        notes = str(r.get("notes") or "").strip()
        file = str(r.get("file") or "").strip()
        if not kind and not ref and not notes and not file:
            continue
        if kind not in EVIDENCE_TYPES:
            raise ValueError(f"Evidence {i}: choose what kind of evidence it is.")
        if kind == "File" and not file:
            raise ValueError(f"Evidence {i}: attach the file.")
        if not ref and not notes and not file:
            raise ValueError(f"Evidence {i}: say what it is, e.g. the course, audit or test.")
        row = {"evidence_type": kind, "reference": ref or None, "notes": notes or None}
        if file:
            row["file"] = file
        out.append(row)
    return out


def evidence_link(evidence_type: str | None, reference: str | None, training: set[str]) -> dict[str, str] | None:
    """A Training Result (or LMS Certificate) the reference names, so the screen can link it; else None."""
    if evidence_type != "Training Result" or not reference or reference not in training:
        return None
    return {"doctype": "LMS Certificate" if reference.startswith(LMS_PREFIX) else "Training Result", "name": reference}


def evidence_row(e: Any, training: set[str], show_file: bool) -> dict[str, Any]:
    """API shape of a stored evidence row; the file lives in the child's ``attachment`` field."""
    get = e.get if isinstance(e, dict) else lambda k: getattr(e, k, None)
    out = {"evidence_type": get("evidence_type"), "reference": get("reference"), "notes": get("notes")}
    if get("name"):
        out["id"] = get("name")
    if show_file and get("attachment"):
        out["file"] = get("attachment")
    link = evidence_link(get("evidence_type"), get("reference"), training)
    if link:
        out["link"] = link
    return out


def _fmt(d: date) -> str:
    return f"{d.day} {d.strftime('%B %Y')}"


def covers(row: dict[str, Any], on: date, until: date | None = None) -> bool:
    """An approved, unwithdrawn authorisation valid on every day from ``on`` to ``until`` (default ``on``)."""
    if int(row.get("docstatus") or 0) != 1 or row.get("status") == "Withdrawn":
        return False
    start, end = _d(row.get("valid_from")), _d(row.get("valid_to"))
    return not (start and on < start) and not (end and (until or on) > end)


def authorisation_reason(
    name: str, scheme: str, rows: list[dict[str, Any]], on: date, today: date, until: date | None = None, work: str = "audit"
) -> str | None:
    """The refusal text when no authorisation row covers the work dates, else None (plan 07 step 1)."""
    if any(covers(r, on, until) for r in rows):
        return None
    last = until or on
    approved = [r for r in rows if int(r.get("docstatus") or 0) == 1 and r.get("status") != "Withdrawn"]
    if not approved:
        if any(int(r.get("docstatus") or 0) == 0 for r in rows):
            return f"{name}'s authorisation for {scheme} is still in training and hasn't been approved."
        if rows:
            return f"{name}'s authorisation for {scheme} has been withdrawn."
        return f"{name} isn't authorised for {scheme}."
    best = max(approved, key=lambda r: _d(r.get("valid_to")) or date.max)
    start, end = _d(best.get("valid_from")), _d(best.get("valid_to"))
    if end and end < last:
        if end < today:
            return f"{name}'s authorisation for {scheme} expired on {_fmt(end)}. Renew it before assigning this {work}."
        return f"{name}'s authorisation for {scheme} expires on {_fmt(end)}, before the {work} on {_fmt(last)}."
    if start and on < start:
        return f"{name}'s authorisation for {scheme} starts on {_fmt(start)}, after the {work} on {_fmt(on)}."
    return f"{name} isn't authorised for {scheme} on {_fmt(on)}."


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _is_hr() -> bool:
    import frappe

    return bool(set(frappe.get_roles()) & set(HR_ROLES))


def _require_hr() -> None:
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can do this.", frappe.PermissionError)


def _user_of(employee: str | None) -> str | None:
    import frappe

    return frappe.db.get_value("Employee", employee, "user_id") if employee else None


def department_head(dept: str | None) -> tuple[str | None, str | None]:
    """(head Employee, head User) of a department, from Department.custom_head."""
    import frappe

    head = frappe.db.get_value("Department", dept, "custom_head") if dept else None
    return head, _user_of(head)


def head_of(employee: str) -> tuple[str | None, str | None]:
    """(head Employee, head User) of the employee's department, from Department.custom_head."""
    import frappe

    return department_head(frappe.db.get_value("Employee", employee, "department"))


def subject(doc: Any) -> dict[str, Any]:
    """Who an authorisation is for: an Employee, or an External Person (plan 07 step 7), whose department
    for approval is the one set on the authorisation itself."""
    import frappe

    from eswasa_hr import external

    if external.person_type(doc) == external.EXTERNAL:
        p = external.get(doc.get("external_person")) or {}
        return {
            "type": external.EXTERNAL,
            "id": doc.get("external_person"),
            "name": p.get("full_name") or doc.get("external_person"),
            "user": p.get("user"),
            "department": doc.get("department"),
        }
    e = frappe.db.get_value("Employee", doc.get("employee"), ["employee_name", "user_id", "department"], as_dict=True) or {}
    return {
        "type": external.EMPLOYEE,
        "id": doc.get("employee"),
        "name": e.get("employee_name") or doc.get("employee"),
        "user": e.get("user_id"),
        "department": e.get("department"),
    }


def _skill_meta(skill: str) -> dict[str, Any]:
    import frappe

    row = frappe.db.get_value(
        "Skill", skill, ["name", "custom_kind", "custom_scheme", "custom_validity_months"], as_dict=True
    )
    return dict(row or {"name": skill})


def _row(doc: Any, day: date) -> dict[str, Any]:
    return {
        "id": doc.name,
        "employee": doc.employee or doc.get("external_person"),
        "employee_name": doc.employee,
        "skill": doc.skill,
        "valid_from": str(doc.valid_from) if doc.valid_from else None,
        "valid_to": str(doc.valid_to) if doc.valid_to else None,
        "status": status_on(doc.docstatus, doc.valid_to, day, (doc.status or "") == "Withdrawn"),
    }


def sync_todo(doc: Any, method: str | None = None) -> None:
    """doc_events hook: a draft has one open ToDo for the department head; anything else has none."""
    import frappe
    from frappe.utils import add_days

    open_rows = frappe.get_all(
        "ToDo",
        filters={"reference_type": DOCTYPE, "reference_name": doc.name, "status": "Open"},
        fields=["name", "allocated_to"],
    )
    wanted = None
    who = subject(doc)
    if int(doc.docstatus or 0) == 0 and not getattr(getattr(doc, "flags", None), "skip_route", False):
        _, head_user = department_head(who["department"])
        if head_user and head_user != who["user"] and head_user != doc.owner:
            wanted = head_user
    keep = False
    for row in open_rows:
        if wanted and row.get("allocated_to") == wanted and not keep:
            keep = True
            continue
        frappe.db.set_value("ToDo", row.get("name"), "status", "Closed")
    if wanted and not keep:
        name = who["name"]
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": wanted,
                "description": todo_title(name, doc.skill),
                "reference_type": DOCTYPE,
                "reference_name": doc.name,
                "status": "Open",
                "priority": "Medium",
                "assigned_by": doc.owner,
                "date": add_days(_today(), settings.get("head_sla_days")),
            }
        ).insert(ignore_permissions=True)


def request_impl(
    employee: str | None,
    skill: str,
    valid_from: str,
    valid_to: str | None = None,
    evidence: list[dict[str, Any]] | None = None,
    external_person: str | None = None,
    department: str | None = None,
) -> dict[str, Any]:
    import frappe

    from eswasa_hr import external

    _require_hr()
    kind = external.EXTERNAL if external_person else external.EMPLOYEE
    err = external.person_error(kind, employee, external_person, external.enabled() if external_person else False)
    if err:
        frappe.throw(err, frappe.ValidationError)
    if external_person:
        if not department:
            frappe.throw("Choose the department whose head approves this external person.", frappe.ValidationError)
        _, head_user = department_head(department)
        person_user = (external.get(external_person) or {}).get("user")
    else:
        _, head_user = head_of(employee)
        person_user = _user_of(employee)
    if not head_user:
        frappe.throw(approver_error("", None, None, None), frappe.ValidationError)
    if head_user == person_user:
        frappe.throw(
            "This person heads their own department, so someone else must approve. Ask the Executive Director's office.",
            frappe.ValidationError,
        )
    try:
        rows = clean_evidence(evidence)
    except ValueError as exc:
        frappe.throw(str(exc), frappe.ValidationError)
    if not rows:
        frappe.throw("Add at least one piece of evidence: a course, a witnessed audit or a test.", frappe.ValidationError)
    meta = _skill_meta(skill)
    end = _d(valid_to) or default_valid_to(valid_from, meta.get("custom_validity_months"))
    doc = frappe.get_doc(
        {
            "doctype": DOCTYPE,
            "person_type": kind,
            "employee": employee or None,
            "external_person": external_person or None,
            "department": department if external_person else None,
            "skill": skill,
            "valid_from": valid_from,
            "valid_to": end.isoformat() if end else None,
            "evidence": [_stored(r) for r in rows],
        }
    )
    doc.insert()
    return detail_impl(doc.name)


def _stored(row: dict[str, Any]) -> dict[str, Any]:
    """A cleaned evidence row as the child DocType keeps it (the file in ``attachment``)."""
    out = {k: v for k, v in row.items() if k != "file"}
    if row.get("file"):
        out["attachment"] = row["file"]
    return out


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler (hook ``eswasa_approval_handlers``)."""
    import frappe

    doc = frappe.get_doc(DOCTYPE, name)
    who = subject(doc)
    head, head_user = department_head(who["department"])
    err = approver_error(frappe.session.user, head_user, who["user"], doc.owner)
    if err:
        frappe.throw(err, frappe.PermissionError)
    if int(doc.docstatus or 0) != 0:
        frappe.throw("This authorisation was already decided.", frappe.ValidationError)
    key = (action or "").strip().lower()
    note = (comment or "").strip()
    if key == "approve":
        doc.approved_by = head
        doc.submit()
        if note:
            doc.add_comment("Comment", note)
        status = "Approved"
    elif key in ("reject", "return"):
        if not note:
            frappe.throw("Say what's missing. HR sees your note and can send it again.", frappe.ValidationError)
        doc.add_comment("Comment", f"Not approved: {note}")
        doc.flags.skip_route = True
        sync_todo(doc)
        status = "Not approved"
    else:
        frappe.throw("An authorisation can only be approved or sent back.", frappe.ValidationError)
    return {
        "ok": True,
        "doctype": DOCTYPE,
        "name": name,
        "action": action,
        "workflow_action": None,
        "status": status,
        "message": f"Authorisation {status.lower()}: {doc.skill}",
    }


def detail_impl(name: str) -> dict[str, Any]:
    import frappe

    doc = frappe.get_doc(DOCTYPE, name)
    who = subject(doc)
    mine = bool(who["user"]) and who["user"] == frappe.session.user
    if not (mine or _is_hr()):
        frappe.throw("You can see your own authorisations only.", frappe.PermissionError)
    day = _today()
    head, head_user = department_head(who["department"])
    meta = _skill_meta(doc.skill)
    evidence = doc.get("evidence") or []
    return {
        **_row(doc, day),
        "employee_name": who["name"],
        "person_type": who["type"],
        "kind": meta.get("custom_kind"),
        "scheme": meta.get("custom_scheme"),
        "approver": frappe.db.get_value("Employee", doc.approved_by, "employee_name") if doc.approved_by else None,
        "decides": frappe.db.get_value("Employee", head, "employee_name") if head else None,
        "evidence": [evidence_row(e, _training_names(evidence), True) for e in evidence],
    }


def _training_names(evidence: list[Any]) -> set[str]:
    """References on Training Result evidence rows that name a real Training Result or LMS Certificate."""
    import frappe

    refs = {
        (e.get("reference") if isinstance(e, dict) else getattr(e, "reference", None)) or ""
        for e in evidence
        if (e.get("evidence_type") if isinstance(e, dict) else getattr(e, "evidence_type", None)) == "Training Result"
    } - {""}
    found = set()
    for ref in refs:
        if ref.startswith(LMS_PREFIX):
            if frappe.db.exists("DocType", "LMS Certificate") and frappe.db.exists("LMS Certificate", ref[len(LMS_PREFIX):]):
                found.add(ref)
        elif frappe.db.exists("Training Result", ref):
            found.add(ref)
    return found


def add_evidence_impl(
    name: str, evidence_type: str, file: str | None = None, reference: str | None = None, notes: str | None = None
) -> dict[str, Any]:
    """HR adds a piece of evidence (usually an uploaded file) to an authorisation still being prepared.
    Once the head has approved, the evidence they saw stays as it was: renewals carry new evidence."""
    import frappe

    _require_hr()
    doc = frappe.get_doc(DOCTYPE, name)
    if int(doc.docstatus or 0) != 0:
        frappe.throw(
            "This authorisation has been decided, so its evidence can't change. Add the evidence to its renewal.",
            frappe.ValidationError,
        )
    try:
        rows = clean_evidence([{"evidence_type": evidence_type, "reference": reference, "notes": notes, "file": file}])
    except ValueError as exc:
        frappe.throw(str(exc).replace("Evidence 1: ", ""), frappe.ValidationError)
    if not rows:
        frappe.throw("Say what the evidence is, or attach the file.", frappe.ValidationError)
    doc.append("evidence", _stored(rows[0]))
    doc.save()
    return detail_impl(name)


def evidence_file_impl(row: str) -> dict[str, Any]:
    """The stored file of one evidence row, for HR or the person only (Core streams it and audits the view)."""
    import frappe

    e = frappe.db.get_value(
        "Staff Authorisation Evidence", row, ["name", "parent", "attachment", "evidence_type"], as_dict=True
    )
    if not e or not e.get("parent"):
        frappe.throw("That evidence doesn't exist.", frappe.DoesNotExistError)
    doc = frappe.get_doc(DOCTYPE, e["parent"])
    who = subject(doc)
    if not (_is_hr() or (who["user"] and who["user"] == frappe.session.user)):
        frappe.throw("Only HR or the person can open authorisation evidence.", frappe.PermissionError)
    return {"id": row, "authorisation": doc.name, "employee": who["id"], "file": e.get("attachment")}


def _all_rows(filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    import frappe

    day = _today()
    rows = frappe.get_all(
        DOCTYPE,
        filters={"docstatus": ["<", 2], **(filters or {})},
        fields=["name", "employee", "external_person", "skill", "valid_from", "valid_to", "status", "docstatus"],
        limit=0,
        order_by="skill asc",
    )
    ids = sorted({r.get("employee") for r in rows if r.get("employee")})
    names = {
        e.get("name"): e.get("employee_name")
        for e in (frappe.get_all("Employee", filters={"name": ["in", ids]}, fields=["name", "employee_name"], limit=0) if ids else [])
    }
    ext = sorted({r.get("external_person") for r in rows if r.get("external_person") and not r.get("employee")})
    if ext:
        names.update(
            {p.get("name"): p.get("full_name") for p in frappe.get_all("External Person", filters={"name": ["in", ext]}, fields=["name", "full_name"], limit=0)}
        )
    out = []
    for r in rows:
        r = dict(r)
        person = r.get("employee") or r.get("external_person")
        out.append(
            {
                "id": r["name"],
                "employee": person,
                "employee_name": names.get(person) or person,
                "skill": r["skill"],
                "valid_from": str(r["valid_from"]) if r.get("valid_from") else None,
                "valid_to": str(r["valid_to"]) if r.get("valid_to") else None,
                "status": status_on(r.get("docstatus"), r.get("valid_to"), day, r.get("status") == "Withdrawn"),
            }
        )
    return out


def matrix_impl() -> dict[str, Any]:
    import frappe

    _require_hr()
    rows = [r for r in _all_rows() if r["status"] != "Withdrawn"]
    skills = frappe.get_all(
        "Skill", fields=["name", "custom_kind", "custom_scheme", "custom_validity_months"], limit=0, order_by="name asc"
    )
    cov = cover(rows)
    people: dict[str, dict[str, Any]] = {}
    for r in rows:
        p = people.setdefault(r["employee"], {"employee": r["employee"], "employee_name": r["employee_name"], "cells": {}})
        prev = p["cells"].get(r["skill"])
        rank = {"Current": 4, "Expiring": 3, "In training": 2, "Expired": 1}
        if not prev or rank.get(r["status"], 0) > rank.get(prev["status"], 0):
            p["cells"][r["skill"]] = {"id": r["id"], "status": r["status"], "valid_to": r["valid_to"]}
    return {
        "skills": [
            {
                "name": s.get("name"),
                "kind": s.get("custom_kind"),
                "scheme": s.get("custom_scheme"),
                "validity_months": s.get("custom_validity_months"),
                "holders": cov.get(s.get("name"), {}).get("holders", 0),
                "expiring": cov.get(s.get("name"), {}).get("expiring", 0),
            }
            for s in skills
            if s.get("custom_kind")
        ],
        "people": sorted(people.values(), key=lambda p: p["employee_name"]),
    }


def expiring_impl(days: int | None = None) -> list[dict[str, Any]]:
    _require_hr()
    day = _today()
    limit = day + timedelta(days=int(days) if days else max(settings.get("expiry_alert_days")))
    return sorted(
        [r for r in _all_rows({"docstatus": 1}) if r["valid_to"] and day <= _d(r["valid_to"]) <= limit],
        key=lambda r: r["valid_to"],
    )


def mine_impl() -> list[dict[str, Any]]:
    import frappe

    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name")
    if not emp:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    return [r for r in _all_rows({"employee": emp}) if r["status"] != "Withdrawn"]


def ask_renewal_impl(skill: str, note: str) -> dict[str, Any]:
    """Employee asks HR to renew: one ToDo for each HR Manager (named people, not a pool)."""
    import frappe
    from frappe.utils import add_days

    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, ["name", "employee_name"], as_dict=True)
    if not emp:
        frappe.throw("Your login isn't linked to an employee record. Ask HR to link it.", frappe.DoesNotExistError)
    if not (note or "").strip():
        frappe.throw("Say what you've done towards the renewal, e.g. the course or audit.", frappe.ValidationError)
    managers = [
        r.get("parent")
        for r in frappe.get_all("Has Role", filters={"role": "HR Manager", "parenttype": "User"}, fields=["parent"], limit=0)
        if r.get("parent") not in ("Administrator",)
    ]
    created = 0
    for user in sorted(set(managers)):
        frappe.get_doc(
            {
                "doctype": "ToDo",
                "allocated_to": user,
                "description": f"Prepare renewal: {emp.employee_name}, {skill}. {note.strip()}",
                "reference_type": "Employee",
                "reference_name": emp.name,
                "status": "Open",
                "priority": "Medium",
                "date": add_days(_today(), settings.get("head_sla_days")),
            }
        ).insert(ignore_permissions=True)
        created += 1
    return {"sent_to": created}


def authorised_reason(
    user: str | None, scheme: str | None, on: Any = None, until: Any = None, kind: str | None = None, work: str = "audit"
) -> tuple[bool | None, str | None]:
    """(ok, reason) for the work date(s), not today. ``scheme`` is a Certification Scheme or a calibration
    discipline (Skill.custom_scheme); ``kind`` narrows to Skill.custom_kind. (None, None) when HR has no
    competence for it or the user has no Employee record: the caller then uses its own check."""
    import frappe

    if not user or not scheme:
        return None, None
    filters: dict[str, Any] = {"custom_scheme": scheme}
    if kind:
        filters["custom_kind"] = kind
    skills = [s.get("name") for s in frappe.get_all("Skill", filters=filters, fields=["name"], limit=0)]
    if not skills:
        return None, None
    emp = frappe.db.get_value("Employee", {"user_id": user}, ["name", "employee_name"], as_dict=True)
    if emp:
        who, person = {"employee": emp.get("name")}, emp.get("employee_name") or emp.get("name")
    else:
        from eswasa_hr import external

        ext = external.for_user(user)  # plan 07 step 7: an external person is checked like staff
        if not ext:
            return None, None
        who, person = {"external_person": ext.get("name")}, ext.get("full_name") or ext.get("name")
    today = _today()
    day = _d(str(on)[:10]) if on else today
    rows = frappe.get_all(
        DOCTYPE,
        filters={**who, "skill": ["in", skills]},
        fields=["docstatus", "status", "valid_from", "valid_to"],
        limit=0,
    )
    reason = authorisation_reason(person, scheme, rows, day, today, _d(str(until)[:10]) if until else None, work)
    return reason is None, reason


def authorised_for_scheme(user: str | None, scheme: str | None, on_date: Any = None) -> bool | None:
    """Bridge for Certification (Auditor Competence): None when HR has no competence set up for the scheme."""
    return authorised_reason(user, scheme, on=on_date)[0]


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def matrix() -> dict[str, Any]:
    return matrix_impl()


@_whitelist
def expiring(days: Any = None) -> list[dict[str, Any]]:
    return expiring_impl(int(days) if days else None)


@_whitelist
def detail(name: str) -> dict[str, Any]:
    return detail_impl(name)


@_whitelist
def request(
    employee: str | None = None,
    skill: str = "",
    valid_from: str = "",
    valid_to: str | None = None,
    evidence: Any = None,
    confirm: Any = False,
    external_person: str | None = None,
    department: str | None = None,
) -> dict[str, Any]:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)
    rows = frappe.parse_json(evidence) if isinstance(evidence, str) else (evidence or [])
    return request_impl(employee or None, skill, valid_from, valid_to or None, rows, external_person or None, department or None)


@_whitelist
def add_evidence(
    name: str, evidence_type: str, file: str | None = None, reference: str | None = None, notes: str | None = None, confirm: Any = False
) -> dict[str, Any]:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)
    return add_evidence_impl(name, evidence_type, file, reference, notes)


@_whitelist
def evidence_file(row: str) -> dict[str, Any]:
    return evidence_file_impl(row)


@_whitelist
def mine() -> list[dict[str, Any]]:
    return mine_impl()


@_whitelist
def ask_renewal(skill: str, note: str = "", confirm: Any = False) -> dict[str, Any]:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)
    return ask_renewal_impl(skill, note)
