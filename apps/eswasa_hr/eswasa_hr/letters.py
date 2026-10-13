"""
HR letters library (additions plan 03; record Letters tab, E12 My letters).

HR produces the letters it writes again and again from the event that justifies them: probation confirmed,
contract renewed or made permanent, promotion, transfer, a disciplinary warning. Staff ask for an employment
confirmation letter themselves (for a bank or an embassy); HR prepares it. Each letter is an ``HR Letter``
rendered by its own print format, kept as a private File on the letter and filed on the person as an
``Employee Document`` of type Letter (key ``hr-letter:<name>``, streamed by Core).

Wording is ESWASA's (A3): one ``Terms and Conditions`` record per letter type. Until it exists that type shows
"Awaiting ESWASA (A3)" and won't generate. The wording may use placeholders such as ``{employee_name}``.
No letter ever carries pay (A4 unanswered, so no): the context below is built from allowlists only.

Warning letters follow the case rules (``cases.has_permission``): only HR Managers and the case owner make or
read them, they never go by email, and they aren't filed as an Employee Document (HR Users read those); the
case links to the letter instead (``Disciplinary Case.warning_letter``).

The certificate of service stays where it is (``certificate.py``); it is listed in the library only.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

DOCTYPE = "HR Letter"
HR_ROLES = ("HR Manager", "HR User", "System Manager")
MANAGER_ROLES = ("HR Manager", "System Manager")
REQUESTED, ISSUED, CANCELLED = "Requested", "Issued", "Cancelled"
DOC_TYPE = "Letter"  # Employee Document.document_type
FILE_KEY = "hr-letter:"  # Employee Document.file for a letter; Core streams it from the letter

PROBATION, RENEWAL, PERMANENT, PROMOTION, TRANSFER, WARNING, CONFIRMATION = (
    "Probation confirmation", "Contract renewal", "Permanent appointment", "Promotion", "Transfer", "Warning", "Employment confirmation")
CERTIFICATE = "Certificate of service"

# Type → print format, ESWASA's wording record (Terms and Conditions title), the source it is made from.
LETTER_TYPES: dict[str, dict[str, Any]] = {
    PROBATION: {"format": "ESWASA Probation Confirmation", "wording": "Probation confirmation letter", "source": "Employee"},
    RENEWAL: {"format": "ESWASA Contract Letter", "wording": "Contract renewal letter", "source": "Contract Change", "kind": "Renew"},
    PERMANENT: {"format": "ESWASA Contract Letter", "wording": "Permanent appointment letter", "source": "Contract Change", "kind": "Make permanent"},
    PROMOTION: {"format": "ESWASA Promotion Letter", "wording": "Promotion letter", "source": "Employee Promotion"},
    TRANSFER: {"format": "ESWASA Transfer Letter", "wording": "Transfer letter", "source": "Employee Transfer"},
    WARNING: {"format": "ESWASA Warning Letter", "wording": "Warning letter", "source": "Disciplinary Case"},
    CONFIRMATION: {"format": "ESWASA Employment Confirmation", "wording": "Employment confirmation letter", "source": None},
}
FORMATS = sorted({t["format"] for t in LETTER_TYPES.values()})

# What a letter may print. Anything else on the source or the Employee (pay above all) never reaches it.
PERSON_FIELDS = ("employee_name", "employee_number", "designation", "department", "date_of_joining", "employment_type")
SOURCE_FIELDS = {
    PROBATION: ("final_confirmation_date",),
    RENEWAL: ("new_end_date", "current_end_date"),
    PERMANENT: ("new_employment_type",),
    PROMOTION: ("promotion_date", "designation", "department", "branch", "grade"),
    TRANSFER: ("transfer_date", "designation", "department", "branch"),
    WARNING: ("sanction", "offence_title", "outcome_on", "warning_expires_on"),
    CONFIRMATION: (),
}
MOVE_FIELDS = ("designation", "department", "branch", "grade")  # Employee Property History rows a letter may show


def awaiting(letter_type: str) -> str:
    return f"Awaiting ESWASA (A3): no wording for {letter_type}."


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _iso(v: Any) -> str | None:
    d = _d(v)
    return d.isoformat() if d else None


def source_state(letter_type: str, row: dict[str, Any] | None, employee: str) -> str:
    """"ready" when the source is approved or done and is this person's; otherwise why not."""
    spec = LETTER_TYPES[letter_type]
    if spec["source"] is None:
        return "ready" if (row or {}).get("status") == "Active" else "inactive"
    if not row:
        return "missing"
    if (row.get("employee") or row.get("name")) != employee:
        return "missing"
    if letter_type == PROBATION:
        ok = bool(row.get("final_confirmation_date"))
    elif spec["source"] == "Contract Change":
        ok = row.get("state") == "Done" and row.get("kind") == spec["kind"]
    elif letter_type == WARNING:
        from eswasa_hr.cases import is_warning

        ok = is_warning(row.get("sanction")) and row.get("warning_status") in ("Active", "Expired")
    else:
        ok = row.get("docstatus") == 1
    return "ready" if ok else "pending"


SOURCE_MESSAGES = {
    "missing": "Choose the approved record this letter is about.",
    "pending": "The letter can only be made once the change is approved or done.",
    "inactive": "Only an active employee can get this letter.",
}


def generate_errors(letter_type: str | None, source: str | None, wording: str | None, user_roles: Any, case_reader: bool = False) -> list[str]:
    """Why HR can't make this letter now. ``source`` comes from ``source_state``."""
    if letter_type == CERTIFICATE:
        return ["The certificate of service is printed from the person's record."]
    if letter_type not in LETTER_TYPES:
        return ["Choose a letter type."]
    roles = set(user_roles or ())
    if letter_type == WARNING:
        if not (case_reader or roles & set(MANAGER_ROLES)):
            return ["Only an HR Manager or the case owner can make a warning letter."]
    elif not roles & set(HR_ROLES):
        return ["Only HR can make letters."]
    errs = []
    if source != "ready":
        errs.append(SOURCE_MESSAGES.get(source or "missing", SOURCE_MESSAGES["missing"]))
    if not (wording or "").strip():
        errs.append(awaiting(letter_type))
    return errs


def request_errors(purpose: str | None, addressed_to: str | None = None) -> list[str]:
    errs = []
    if not (purpose or "").strip():
        errs.append("Say what the letter is for, for example a bank or an embassy.")
    elif len(purpose.strip()) > 140:
        errs.append("Keep the purpose short (140 characters at most).")
    if addressed_to and len(addressed_to.strip()) > 200:
        errs.append("Keep the addressee short (200 characters at most).")
    return errs


def preparer_error(user: str, requested_by: str | None, subject_user: str | None = None) -> str | None:
    """Four-eyes: nobody prepares a letter they asked for, or a letter about themselves."""
    if requested_by and user == requested_by:
        return "You asked for this letter, so another HR person must prepare it."
    if subject_user and user == subject_user:
        return "You can't prepare a letter about yourself; another HR person must."
    return None


def prepare_title(employee_name: str) -> str:
    return f"Prepare employment confirmation letter for {employee_name}"


_PLACEHOLDER = re.compile(r"\{([a-z_]+)\}")


def fill(wording: str | None, values: dict[str, Any]) -> str | None:
    """Put the letter's values into ESWASA's wording. Unknown placeholders stay as written."""
    if not wording:
        return None
    return _PLACEHOLDER.sub(lambda m: str(values[m.group(1)]) if values.get(m.group(1)) not in (None, "") else m.group(0), wording)


def letter_context(letter: dict[str, Any], person: dict[str, Any], source: dict[str, Any], wording: str | None, signatory: str,
                   signatory_awaiting: bool) -> dict[str, Any]:
    """Everything a letter prints. Only allowlisted fields pass, so pay can never reach it."""
    lt = letter.get("letter_type")
    p = {k: (_iso(person.get(k)) if k == "date_of_joining" else person.get(k)) for k in PERSON_FIELDS}
    p["employee_number"] = p["employee_number"] or person.get("name")
    src = {k: (_iso(source.get(k)) if k.endswith(("_date", "_on")) else source.get(k)) for k in SOURCE_FIELDS.get(lt, ())}
    values = {**p, **{k: v for k, v in src.items() if v not in (None, "")}, "addressed_to": letter.get("addressed_to"), "purpose": letter.get("purpose")}
    return {
        "reference": letter.get("name"),
        "letter_type": lt,
        "date": _iso(letter.get("issued_on")),
        "addressed_to": (letter.get("addressed_to") or "").strip() or "To whom it may concern",
        "purpose": letter.get("purpose"),
        "person": p,
        "source": src,
        "wording": fill(wording, values),
        "wording_awaiting": None if wording else awaiting(lt or "this letter"),
        "signatory": signatory,
        "signatory_awaiting": signatory_awaiting,
    }


def visible_to_person(row: dict[str, Any]) -> bool:
    """The person sees their own issued letters and requests, never a warning letter (that stays with the case)."""
    return row.get("letter_type") != WARNING and row.get("status") in (ISSUED, REQUESTED)


# ---------------------------------------------------------------- Frappe glue


FIELDS = ["name", "employee", "employee_name", "letter_type", "source_doctype", "source_name", "purpose", "addressed_to", "requested_by",
          "status", "file", "issued_by", "issued_on", "note", "creation"]


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _roles(user: str | None = None) -> set[str]:
    import frappe

    return set(frappe.get_roles(user) if user else frappe.get_roles())


def _is_hr(user: str | None = None) -> bool:
    return bool(_roles(user) & set(HR_ROLES))


def _is_manager(user: str | None = None) -> bool:
    return bool(_roles(user) & set(MANAGER_ROLES))


def _has_doctype() -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", DOCTYPE))


def _wording(letter_type: str) -> str | None:
    import frappe

    title = LETTER_TYPES[letter_type]["wording"]
    if not frappe.db.exists("Terms and Conditions", title):
        return None
    return frappe.db.get_value("Terms and Conditions", title, "terms") or None


def _employee(employee: str) -> dict[str, Any]:
    import frappe

    e = frappe.db.get_value("Employee", employee, ["name", *PERSON_FIELDS, "status", "user_id", "final_confirmation_date"], as_dict=True)
    if not e:
        frappe.throw("Employee not found.", frappe.DoesNotExistError)
    return dict(e)


def _case_reader(case: str | None, user: str | None = None) -> bool:
    """The ``cases.has_permission`` rule: an HR Manager, the case owner, or the appeal owner during an appeal."""
    import frappe

    user = user or frappe.session.user
    if _is_manager(user):
        return True
    if not case:
        return False
    c = frappe.db.get_value("Disciplinary Case", case, ["owner_user", "appeal_owner", "stage"], as_dict=True)
    return bool(c) and user in {c.get("owner_user"), c.get("appeal_owner") if c.get("stage") == "Appeal" else None}


def _can_read(row: dict[str, Any], user: str | None = None) -> bool:
    import frappe

    user = user or frappe.session.user
    if row.get("letter_type") == WARNING:
        return _case_reader(row.get("source_name"), user)
    if _is_hr(user):
        return True
    own = frappe.db.get_value("Employee", row.get("employee"), "user_id") if row.get("employee") else None
    return bool(own) and own == user and visible_to_person(row)


def _row(r: dict[str, Any]) -> dict[str, Any]:
    out = {k: r.get(k) for k in FIELDS if k not in ("file", "creation")}
    out["issued_on"] = _iso(r.get("issued_on"))
    out["requested_on"] = str(r.get("creation"))[:10] if r.get("creation") else None
    out["has_file"] = bool(r.get("file"))
    return out


def _rows(filters: dict[str, Any]) -> list[dict[str, Any]]:
    import frappe

    if not _has_doctype():
        return []
    return [dict(r) for r in frappe.get_all(DOCTYPE, filters=filters, fields=FIELDS, order_by="creation desc", limit=0)]


def _source_row(letter_type: str, source_name: str | None, employee: str) -> dict[str, Any] | None:
    import frappe

    spec = LETTER_TYPES[letter_type]
    if spec["source"] is None or letter_type == PROBATION:
        return _employee(employee)
    if not source_name:
        return None
    fields = {
        "Contract Change": ["name", "employee", "state", "kind", "new_end_date", "current_end_date", "new_employment_type"],
        "Employee Promotion": ["name", "employee", "docstatus", "promotion_date"],
        "Employee Transfer": ["name", "employee", "docstatus", "transfer_date"],
        "Disciplinary Case": ["name", "employee", "sanction", "warning_status", "offence", "outcome_on", "warning_expires_on"],
    }[spec["source"]]
    r = frappe.db.get_value(spec["source"], source_name, fields, as_dict=True)
    if not r:
        return None
    r = dict(r)
    if spec["source"] in ("Employee Promotion", "Employee Transfer"):
        for h in frappe.get_all("Employee Property History", filters={"parent": source_name}, fields=["fieldname", "new"], limit=0):
            if h.get("fieldname") in MOVE_FIELDS:
                r[h["fieldname"]] = h.get("new")
    if letter_type == WARNING and r.get("offence"):
        r["offence_title"] = frappe.db.get_value("Disciplinary Offence", r["offence"], "title")
    return r


def eligible_for(employee: str) -> list[dict[str, Any]]:
    """Approved or done records a letter can be made from, newest first, with the letter already made (if any)."""
    import frappe

    e = _employee(employee)
    made = {(r["letter_type"], r.get("source_name")): r["name"] for r in _rows({"employee": employee, "status": ISSUED})}
    out: list[dict[str, Any]] = []

    def add(letter_type: str, source_name: str, label: str, on: Any) -> None:
        out.append({"letter_type": letter_type, "source_doctype": LETTER_TYPES[letter_type]["source"], "source_name": source_name,
                    "label": label, "date": _iso(on), "letter": made.get((letter_type, source_name))})

    if e.get("final_confirmation_date"):
        add(PROBATION, employee, f"Probation confirmed {_iso(e['final_confirmation_date'])}", e["final_confirmation_date"])
    if frappe.db.exists("DocType", "Contract Change"):
        for r in frappe.get_all("Contract Change", filters={"employee": employee, "state": "Done"}, fields=["name", "kind", "new_end_date", "new_employment_type", "modified"], limit=0):
            lt = RENEWAL if r.get("kind") == "Renew" else PERMANENT
            add(lt, r["name"], f"Renewed to {_iso(r.get('new_end_date'))}" if lt == RENEWAL else f"Made {r.get('new_employment_type') or 'permanent'}", r.get("modified"))
    for dt, lt, date_field in (("Employee Promotion", PROMOTION, "promotion_date"), ("Employee Transfer", TRANSFER, "transfer_date")):
        for r in frappe.get_all(dt, filters={"employee": employee, "docstatus": 1}, fields=["name", date_field], limit=0):
            add(lt, r["name"], f"{lt} on {_iso(r.get(date_field))}", r.get(date_field))
    if frappe.db.exists("DocType", "Disciplinary Case"):
        from eswasa_hr.cases import is_warning

        for r in frappe.get_all("Disciplinary Case", filters={"employee": employee, "warning_status": ["in", ["Active", "Expired"]]},
                                fields=["name", "sanction", "outcome_on"], limit=0):
            if is_warning(r.get("sanction")) and _case_reader(r["name"]):
                add(WARNING, r["name"], f"{r['sanction']} ({r['name']})", r.get("outcome_on"))
    out.sort(key=lambda x: x["date"] or "", reverse=True)
    return out


def types_impl() -> dict[str, Any]:
    """The library: every type, whether its wording is in (ready) and why not."""
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can see the letter library.", frappe.PermissionError)
    out = []
    for lt, spec in LETTER_TYPES.items():
        ready = bool((_wording(lt) or "").strip())
        out.append({"letter_type": lt, "ready": ready, "reason": None if ready else awaiting(lt), "source_doctype": spec["source"],
                    "requested": spec["source"] is None, "managers_only": lt == WARNING, "generated_here": True})
    out.append({"letter_type": CERTIFICATE, "ready": True, "reason": None, "source_doctype": "Employee", "requested": False,
                "managers_only": False, "generated_here": False})
    return {"types": out, "awaiting": None if all(t["ready"] for t in out) else "A3"}


def list_impl(employee: str) -> dict[str, Any]:
    """Record Letters tab (HR): the person's letters and the records a letter can be made from."""
    import frappe

    if not _is_hr():
        frappe.throw("Only HR can see a person's letters.", frappe.PermissionError)
    e = _employee(employee)
    rows = [_row(r) for r in _rows({"employee": employee}) if _can_read(r)]
    return {
        "employee": employee,
        "employee_name": e.get("employee_name"),
        "letters": rows,
        "eligible": eligible_for(employee),
        "types": types_impl()["types"],
        "can_cancel": _is_manager(),
    }


def _render(name: str, letter_type: str) -> bytes:
    import frappe

    return frappe.get_print(DOCTYPE, name, print_format=LETTER_TYPES[letter_type]["format"], as_pdf=True)


def _save_file(name: str, letter_type: str, pdf: bytes) -> str:
    import frappe

    f = frappe.get_doc({"doctype": "File", "file_name": f"{letter_type} letter {name}.pdf", "attached_to_doctype": DOCTYPE,
                        "attached_to_name": name, "is_private": 1, "content": pdf})
    f.insert(ignore_permissions=True)
    return f.file_url


def _read_file(name: str, url: str) -> bytes:
    import frappe

    fname = frappe.db.get_value("File", {"file_url": url, "attached_to_doctype": DOCTYPE, "attached_to_name": name}, "name")
    if not fname:
        frappe.throw("The letter's file is missing.", frappe.DoesNotExistError)
    return frappe.get_doc("File", fname).get_content()


def _close_todos(name: str) -> None:
    import frappe

    for t in frappe.get_all("ToDo", filters={"reference_type": DOCTYPE, "reference_name": name, "status": "Open"}, fields=["name"], limit=0):
        frappe.db.set_value("ToDo", t["name"], "status", "Closed")


def _issue(name: str, e: dict[str, Any], letter_type: str, source_name: str | None) -> None:
    """Render, keep, file on the person, mark issued and tell them. The letter row already exists."""
    import frappe

    try:
        pdf = _render(name, letter_type)
    except Exception:  # noqa: BLE001  (no PDF renderer, or the print format isn't migrated)
        log = getattr(frappe, "log_error", None)
        if log:
            log(title=f"HR letter {name} not printed")
        frappe.throw("The letter couldn't be printed. Try again, or ask the system administrator to check the print format.", frappe.ValidationError)
    url = _save_file(name, letter_type, pdf)
    frappe.db.set_value(DOCTYPE, name, {"file": url, "status": ISSUED, "issued_by": frappe.session.user, "issued_on": _today().isoformat()})
    if letter_type == WARNING:
        frappe.db.set_value("Disciplinary Case", source_name, "warning_letter", name)
    else:
        frappe.get_doc({"doctype": "Employee Document", "employee": e["name"], "document_type": DOC_TYPE, "file": f"{FILE_KEY}{name}",
                        "status": "Verified", "verified_by": frappe.session.user}).insert(ignore_permissions=True)
        if e.get("user_id"):
            from eswasa_hr.notify import queue

            queue(f"letter:{name}", [e["user_id"]], "letter_issued", {"letter_type": letter_type.lower()})
    _close_todos(name)


def generate_impl(employee: str, letter_type: str, source_name: str | None = None, addressed_to: str | None = None) -> dict[str, Any]:
    """HR (or, for a warning, the case owner) makes a letter from its approved source in one action."""
    import frappe

    e = _employee(employee)
    if letter_type in LETTER_TYPES and LETTER_TYPES[letter_type]["source"] == "Employee":
        source_name = employee
    known = letter_type in LETTER_TYPES
    state = source_state(letter_type, _source_row(letter_type, source_name, employee), employee) if known else None
    reader = _case_reader(source_name) if letter_type == WARNING else False
    errs = generate_errors(letter_type, state, _wording(letter_type) if known else None, _roles(), reader)
    if errs:
        exc = frappe.PermissionError if errs[0].startswith("Only") else frappe.ValidationError
        frappe.throw(" ".join(errs), exc)
    err = preparer_error(frappe.session.user, None, e.get("user_id"))
    if err:
        frappe.throw(err, frappe.PermissionError)
    if addressed_to and len(addressed_to.strip()) > 200:
        frappe.throw("Keep the addressee short (200 characters at most).", frappe.ValidationError)
    d = frappe.get_doc({
        "doctype": DOCTYPE,
        "employee": employee,
        "employee_name": e.get("employee_name"),
        "letter_type": letter_type,
        "source_doctype": LETTER_TYPES[letter_type]["source"],
        "source_name": source_name,
        "addressed_to": (addressed_to or "").strip() or None,
        "status": REQUESTED,
    })
    d.insert(ignore_permissions=True)
    _issue(d.name, e, letter_type, source_name)
    if _is_hr():
        return list_impl(employee)
    # a case owner outside HR: only the letter just made
    return {"employee": employee, "employee_name": e.get("employee_name"), "letters": [_row(r) for r in _rows({"name": d.name})],
            "eligible": [], "types": [], "can_cancel": False}


def fulfil_impl(name: str, addressed_to: str | None = None) -> dict[str, Any]:
    """HR prepares a letter a person asked for. Not the requester, not about yourself."""
    import frappe

    r = frappe.db.get_value(DOCTYPE, name, FIELDS, as_dict=True)
    if not r:
        frappe.throw("Letter not found.", frappe.DoesNotExistError)
    if not _is_hr():
        frappe.throw("Only HR can prepare letters.", frappe.PermissionError)
    if r["status"] != REQUESTED:
        frappe.throw("This letter was already prepared or cancelled.", frappe.ValidationError)
    e = _employee(r["employee"])
    err = preparer_error(frappe.session.user, r.get("requested_by"), e.get("user_id"))
    if err:
        frappe.throw(err, frappe.PermissionError)
    errs = generate_errors(r["letter_type"], source_state(r["letter_type"], e, r["employee"]), _wording(r["letter_type"]), _roles())
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    if addressed_to and addressed_to.strip():
        frappe.db.set_value(DOCTYPE, name, "addressed_to", addressed_to.strip()[:200])
    _issue(name, e, r["letter_type"], None)
    return list_impl(r["employee"])


def request_impl(purpose: str, addressed_to: str | None = None) -> dict[str, Any]:
    """E12: a person asks for an employment confirmation letter about themselves."""
    import frappe

    from eswasa_hr.documents import hr_people

    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not emp:
        frappe.throw("Your user isn't linked to an employee record.", frappe.ValidationError)
    e = _employee(emp)
    errs = request_errors(purpose, addressed_to)
    if e.get("status") != "Active":
        errs.append(SOURCE_MESSAGES["inactive"])
    if _rows({"employee": emp, "letter_type": CONFIRMATION, "status": REQUESTED}):
        errs.append("You already have a request waiting; HR will prepare it.")
    if errs:
        frappe.throw(" ".join(errs), frappe.ValidationError)
    d = frappe.get_doc({
        "doctype": DOCTYPE,
        "employee": emp,
        "employee_name": e.get("employee_name"),
        "letter_type": CONFIRMATION,
        "purpose": purpose.strip(),
        "addressed_to": (addressed_to or "").strip() or None,
        "requested_by": frappe.session.user,
        "status": REQUESTED,
    })
    d.insert(ignore_permissions=True)
    for user in hr_people(exclude=frappe.session.user):
        frappe.get_doc({
            "doctype": "ToDo",
            "allocated_to": user,
            "description": prepare_title(e.get("employee_name") or emp),
            "reference_type": DOCTYPE,
            "reference_name": d.name,
            "status": "Open",
            "priority": "Medium",
            "assigned_by": frappe.session.user,
            "date": _today().isoformat(),
        }).insert(ignore_permissions=True)
    return my_letters_impl()


def cancel_impl(name: str, note: str) -> dict[str, Any]:
    """HR Manager only. The file is kept; the letter shows as cancelled."""
    import frappe

    if not _is_manager():
        frappe.throw("Only an HR Manager can cancel a letter.", frappe.PermissionError)
    r = frappe.db.get_value(DOCTYPE, name, FIELDS, as_dict=True)
    if not r:
        frappe.throw("Letter not found.", frappe.DoesNotExistError)
    if r["status"] == CANCELLED:
        frappe.throw("This letter is already cancelled.", frappe.ValidationError)
    if not (note or "").strip():
        frappe.throw("Say why the letter is cancelled.", frappe.ValidationError)
    frappe.db.set_value(DOCTYPE, name, {"status": CANCELLED, "note": note.strip()})
    _close_todos(name)
    return list_impl(r["employee"])


def file_impl(name: str) -> dict[str, Any]:
    """The PDF as base64 for Core to stream: HR, the case readers for a warning, the person for their own."""
    import base64

    import frappe

    r = frappe.db.get_value(DOCTYPE, name, FIELDS, as_dict=True)
    if not r:
        frappe.throw("Letter not found.", frappe.DoesNotExistError)
    if not _can_read(dict(r)):
        frappe.throw("You can't open this letter.", frappe.PermissionError)
    if not r.get("file"):
        frappe.throw("This letter hasn't been prepared yet.", frappe.DoesNotExistError)
    pdf = _read_file(name, r["file"])
    return {"name": name, "employee": r["employee"], "file_name": f"{r['letter_type']} letter {name}.pdf", "content_type": "application/pdf",
            "content": base64.b64encode(pdf).decode()}


def my_letters_impl() -> dict[str, Any]:
    import frappe

    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not emp:
        return {"employee": None, "letters": [], "can_request": False, "ready": False, "reason": None}
    rows = [_row(r) for r in _rows({"employee": emp}) if visible_to_person(r)]
    ready = bool((_wording(CONFIRMATION) or "").strip())
    return {"employee": emp, "letters": rows, "can_request": not any(r["status"] == REQUESTED and r["letter_type"] == CONFIRMATION for r in rows),
            "ready": ready, "reason": None if ready else awaiting(CONFIRMATION)}


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler for the "Prepare …" do card: Done prepares the letter."""
    import frappe

    if (action or "").strip().lower() not in ("approve", "done", "prepare"):
        frappe.throw("Prepare the letter, or ask an HR Manager to cancel the request.", frappe.ValidationError)
    fulfil_impl(name)
    return {"ok": True, "doctype": DOCTYPE, "name": name, "action": action, "workflow_action": None, "status": ISSUED, "message": "Letter prepared"}


def letter_context_for(name: str) -> dict[str, Any]:
    """Jinja method for the six ``ESWASA … Letter`` print formats (hooks ``jinja``)."""
    import frappe

    from eswasa_hr.hiring import _signatory, signatory_line

    r = frappe.db.get_value(DOCTYPE, name, FIELDS, as_dict=True)
    if not r:
        frappe.throw("Letter not found.", frappe.DoesNotExistError)
    r = dict(r)
    r["issued_on"] = r.get("issued_on") or _today().isoformat()
    person = _employee(r["employee"])
    source = _source_row(r["letter_type"], r.get("source_name"), r["employee"]) or {}
    role, holder = _signatory()
    return letter_context(r, person, source, _wording(r["letter_type"]), signatory_line(role, holder), not role)


def setup_step() -> dict[str, Any]:
    """HR setup: which letter types have ESWASA's wording (A3)."""
    from eswasa_hr.overview import AWAITING as AWAIT_STATE, DONE, PARTIAL, step

    have = [lt for lt in LETTER_TYPES if (_wording(lt) or "").strip()]
    missing = [lt for lt in LETTER_TYPES if lt not in have]
    if not missing:
        return step("letter_wording", "Letter wording", DONE, f"All {len(have)} letter types have wording.", "terms-and-conditions", desk=True)
    detail = f"Awaiting ESWASA (A3): no wording for {', '.join(missing)}."
    if have:
        detail = f"Ready: {', '.join(have)}. {detail}"
    return step("letter_wording", "Letter wording", PARTIAL if have else AWAIT_STATE, detail, "terms-and-conditions", awaiting="A3", desk=True)


# ---------------------------------------------------------------- permission hooks (hooks.py)


def query(user: str | None = None, doctype: str | None = None) -> str:
    """HR Managers see every letter; HR Users all but warnings outside their cases; others their own issued ones."""
    import frappe

    from eswasa_hr.scope import viewer_for

    user = user or frappe.session.user
    if _is_manager(user):
        return ""
    u = frappe.db.escape(user)
    t = f"`tab{DOCTYPE}`"
    own_case = f"{t}.`source_name` in (select name from `tabDisciplinary Case` where owner_user = {u})"
    if _is_hr(user):
        return f"({t}.`letter_type` != 'Warning' or {own_case})"
    emp = viewer_for(user).employee
    mine = f"({t}.`employee` = {frappe.db.escape(emp)} and {t}.`letter_type` != 'Warning' and {t}.`status` in ('Issued', 'Requested'))" if emp else "1=0"
    return f"({mine} or ({t}.`letter_type` = 'Warning' and {own_case}))"


def has_permission(doc: Any, ptype: str | None = None, user: str | None = None, **kwargs: Any) -> bool:
    row = doc if isinstance(doc, dict) else {k: getattr(doc, k, None) for k in ("employee", "letter_type", "status", "source_name")}
    if not _is_hr(user) and ptype not in (None, "read", "print", "email", "export", "report"):
        return False  # writes go through the methods below
    return _can_read(row, user)


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


def _confirm(confirm: Any) -> None:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)


@_whitelist
def letter_types() -> dict[str, Any]:
    return types_impl()


@_whitelist
def employee_letters(employee: str) -> dict[str, Any]:
    return list_impl(employee)


@_whitelist
def generate(employee: str, letter_type: str, source_name: str | None = None, addressed_to: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return generate_impl(employee, letter_type, source_name, addressed_to)


@_whitelist
def fulfil(name: str, addressed_to: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return fulfil_impl(name, addressed_to)


@_whitelist
def cancel(name: str, note: str = "", confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return cancel_impl(name, note)


@_whitelist
def letter_file(name: str) -> dict[str, Any]:
    return file_impl(name)


@_whitelist
def my_letters() -> dict[str, Any]:
    return my_letters_impl()


@_whitelist
def request(purpose: str, addressed_to: str | None = None, confirm: Any = False) -> dict[str, Any]:
    _confirm(confirm)
    return request_impl(purpose, addressed_to)
