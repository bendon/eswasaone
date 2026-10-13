"""
Starting records HR edits in Desk, created once per site after migrate (never re-created once HR deletes them):

- Terms and Conditions wording for the offer letter, the certificate of service and the yearly impartiality and
  confidentiality declaration. Written from ESWASA's published values (swasa.co.sz: transparency,
  professionalism) and the general impartiality and confidentiality duties of a conformity assessment body under
  ISO/IEC 17065 and ISO/IEC 17021-1, paraphrased, not quoted.
- One company-wide Employee Onboarding Template and Employee Separation Template, whose activities carry an owner
  (``custom_owner``) and team (``custom_team``) so the start screens can name who does each task.

The code reads these records; it holds no wording or checklist of its own.
"""

from __future__ import annotations

from typing import Any

FLAG = "eswasa_hr_seeded_records_v1"

OFFER_LETTER = "Offer letter"
CERTIFICATE = "Certificate of service"
DECLARATION = "Impartiality and confidentiality declaration"

WORDING: dict[str, str] = {
    OFFER_LETTER: (
        "We are pleased to offer you employment with the Eswatini Standards Authority on the terms set out in this "
        "letter. The offer is subject to satisfactory references, proof of the qualifications you stated in your "
        "application, and the documents listed in your onboarding checklist. Your employment is also governed by the "
        "Authority's conditions of service and policies as amended from time to time, and by the Employment Act of "
        "Eswatini. Because the Authority provides standards, certification, testing and calibration services, you will "
        "be asked to sign a yearly impartiality and confidentiality declaration. Please confirm your acceptance by the "
        "date shown in this letter."
    ),
    CERTIFICATE: (
        "This is to certify that the person named below is or was employed by the Eswatini Standards Authority in the "
        "posts and for the periods shown. This certificate is issued at the employee's request and states the posts "
        "held and the dates of employment only."
    ),
    DECLARATION: (
        "I will act impartially in all work I do for the Eswatini Standards Authority. I will tell the Authority "
        "promptly about any relationship, interest or pressure, commercial, financial or other, that could affect, or "
        "appear to affect, my objectivity, and I will not take part in work where such a conflict exists. I will keep "
        "confidential all information about clients, applicants, and certification, testing and calibration work that I "
        "obtain through my work for the Authority, except where the law requires disclosure or the client has agreed in "
        "writing, and I will not use it for any other purpose. These duties continue after my work for the Authority ends."
    ),
}

# (owner, activity, team). Owner: HR = whoever starts it, Line manager, New joiner, HR chooses = HR picks the person.
ONBOARDING: list[tuple[str, str, str]] = [
    ("HR", "Contract signed and filed", "HR"),
    ("HR", "Required documents on file: ID, qualifications, police clearance", "HR"),
    ("HR chooses", "Email address and EswasaOne login", "ICT"),
    ("HR chooses", "Laptop and access card", "ICT"),
    ("HR chooses", "Bank details captured for payroll", "Finance"),
    ("Line manager", "Welcome meeting and first-week plan", "Line manager"),
    ("Line manager", "Choose a buddy for the first month", "Line manager"),
    ("New joiner", "Sign the impartiality and confidentiality declaration", "New joiner"),
    ("New joiner", "Complete the induction course", "New joiner"),
]
OFFBOARDING: list[tuple[str, str, str]] = [
    ("HR", "Exit interview", "HR"),
    ("Line manager", "Handover of open work", "Line manager"),
    ("HR chooses", "Return laptop and access card", "ICT"),
    ("HR chooses", "Final pay with leave days owed", "Finance"),
    ("HR", "Certificate of service", "HR"),
]


def _company() -> str | None:
    import frappe

    return frappe.db.get_single_value("Global Defaults", "default_company")


def _terms(title: str, text: str) -> None:
    import frappe

    if not frappe.db.exists("Terms and Conditions", title):
        frappe.get_doc({"doctype": "Terms and Conditions", "title": title, "terms": text, "hr": 1}).insert(ignore_permissions=True)


def _template(doctype: str, rows: list[tuple[str, str, str]]) -> None:
    import frappe

    if not frappe.db.exists("DocType", doctype) or frappe.get_all(doctype, limit=1):
        return
    frappe.get_doc(
        {
            "doctype": doctype,
            "company": _company(),
            "activities": [{"activity_name": name, "custom_owner": owner, "custom_team": team} for owner, name, team in rows],
        }
    ).insert(ignore_permissions=True)


def seed_once() -> None:
    """after_migrate: create the starting records the first time only."""
    import frappe

    if frappe.db.get_default(FLAG):
        return
    if frappe.db.exists("DocType", "Terms and Conditions"):
        for title, text in WORDING.items():
            _terms(title, text)
    _template("Employee Onboarding Template", ONBOARDING)
    _template("Employee Separation Template", OFFBOARDING)
    frappe.db.set_default(FLAG, "1")


# ---------------------------------------------------------------- read side (used by onboarding, lifecycle, declarations)

OWNER_KIND = {"HR": "hr", "Line manager": "manager", "New joiner": "joiner", "HR chooses": "pick"}


def template_rows(doctype: str, employee: dict[str, Any] | None = None) -> list[tuple[str, str, str]]:
    """(owner kind, activity, team) from the template that best matches the employee (designation, then
    department, then grade, then company-wide). Empty when HR has no template: the screen starts an empty list."""
    import frappe

    if not frappe.db.exists("DocType", doctype):
        return []
    e = employee or {}
    templates = frappe.get_all(doctype, fields=["name", "department", "designation", "employee_grade"], limit=0)

    def score(t: dict[str, Any]) -> int | None:
        s = 0
        for field, weight in (("designation", 4), ("department", 2), ("employee_grade", 1)):
            if t.get(field):
                if t[field] != e.get(field if field != "employee_grade" else "grade"):
                    return None
                s += weight
        return s

    ranked = sorted(((score(t), t["name"]) for t in templates if score(t) is not None), reverse=True)
    if not ranked:
        return []
    acts = frappe.get_all("Employee Boarding Activity", filters={"parent": ranked[0][1], "parenttype": doctype},
                          fields=["activity_name", "custom_owner", "custom_team", "idx"], order_by="idx asc", limit=0)
    return [(OWNER_KIND.get(a.get("custom_owner") or "", "pick"), a["activity_name"], a.get("custom_team") or "") for a in acts if a.get("activity_name")]


def wording(title: str) -> str | None:
    """The Terms and Conditions text HR keeps for ``title``; None if HR removed it."""
    import frappe

    if not frappe.db.exists("Terms and Conditions", title):
        return None
    return frappe.db.get_value("Terms and Conditions", title, "terms") or None
