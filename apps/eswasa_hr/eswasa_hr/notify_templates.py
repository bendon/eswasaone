"""
Plain-language email/SMS text for HR notifications (plan 04; brief §10, §11).

Each template declares the only context fields it may use; ``notify.queue`` drops anything else, so a caller
can't leak a field by passing it. Never add case details (grievance, disciplinary), reasons, health, pay or
any protected Employee field (``sensitive.LEVELS``): ``tests/test_notify.py`` fails if one appears. Cases
never notify by email.

``essential`` templates (decisions and offers) send even to someone who opted out of HR email
(``User.custom_hr_email_opt_out``).
"""

from __future__ import annotations

from typing import Any

SIGN_OFF = "\n\nESWASA Human Resources\nThis message was sent by EswasaOne. Please don't reply to it."

TEMPLATES: dict[str, dict[str, Any]] = {
    "leave_decided": {
        "essential": True,
        "fields": ("decision", "from_date", "to_date"),
        "subject": "Your leave request was {decision}",
        "body": "Hello,\n\nYour leave request for {from_date} to {to_date} was {decision}. "
        "Open My HR in EswasaOne to see the details.",
    },
    "leave_cancelled": {
        "essential": False,
        "fields": ("employee_name", "from_date", "to_date"),
        "subject": "Approved leave cancelled: {employee_name}",
        "body": "Hello,\n\n{employee_name} cancelled their approved leave for {from_date} to {to_date}. "
        "The days are back in their balance. Nothing more is needed from you.",
    },
    "expense_decided": {
        "essential": True,
        "fields": ("decision", "total"),
        "subject": "Your expense claim was {decision}",
        "body": "Hello,\n\nYour expense claim for {total} was {decision}. "
        "Open My HR in EswasaOne to see the details. Approved claims are paid by Finance.",
    },
    "contract_ending": {
        "essential": False,
        "fields": ("employee_name", "end_date"),
        "subject": "Fixed-term contract ends {end_date}: {employee_name}",
        "body": "Hello,\n\nThe fixed-term contract of {employee_name} ends on {end_date}. "
        "Decide in EswasaOne whether to renew it, make it permanent or let it end.",
    },
    "authorisation_expiring": {
        "essential": False,
        "fields": ("employee_name", "competence", "valid_to"),
        "subject": "Authorisation expires in 7 days: {employee_name}, {competence}",
        "body": "Hello,\n\nThe staff authorisation of {employee_name} for {competence} expires on {valid_to}. "
        "Until it is renewed they can't be assigned this work. See Competence in EswasaOne.",
    },
    "offer_sent": {
        "essential": True,
        "fields": ("applicant_name", "designation"),
        "subject": "Your offer from ESWASA",
        "body": "Dear {applicant_name},\n\nESWASA is pleased to offer you the post of {designation}. "
        "Our HR team will contact you with the offer letter and the next steps.",
    },
    "offer_letter": {
        "essential": True,
        "fields": ("applicant_name", "designation"),
        "subject": "Your offer from ESWASA",
        "body": "Dear {applicant_name},\n\nESWASA is pleased to offer you the post of {designation}. "
        "Your offer letter is attached. Please read it and reply to our HR team by the date it gives.",
    },
    "application_received": {
        "essential": True,
        "fields": ("applicant_name", "job_title", "reference"),
        "subject": "We received your application: {job_title}",
        "body": "Dear {applicant_name},\n\nThank you for applying for {job_title}. Your reference is {reference}. "
        "We will contact you if you are shortlisted.",
    },
    "declaration_open": {
        "essential": False,
        "fields": ("year_label",),
        "subject": "Sign your {year_label} impartiality declaration",
        "body": "Hello,\n\nYour {year_label} impartiality and confidentiality declaration is open. "
        "Sign it in My HR in EswasaOne. Until it is signed you can't be assigned audit or decision work.",
    },
    "appraisal_step": {
        "essential": False,
        "fields": ("step_text", "cycle_name", "due"),
        "subject": "{step_text} is due: {cycle_name}",
        "body": "Hello,\n\n{step_text} for {cycle_name} is open and due by {due}. Complete it in EswasaOne.",
    },
}


def clean(template: str, context: dict[str, Any] | None) -> dict[str, str]:
    """Only the template's declared fields, as text (missing ones empty)."""
    spec = TEMPLATES[template]
    ctx = context or {}
    return {f: "" if ctx.get(f) is None else str(ctx.get(f)) for f in spec["fields"]}


def render(template: str, context: dict[str, Any] | None) -> dict[str, str]:
    """{subject, body} for a template; unknown context keys are ignored."""
    spec = TEMPLATES[template]
    ctx = clean(template, context)
    return {"subject": spec["subject"].format_map(ctx), "body": spec["body"].format_map(ctx) + SIGN_OFF}


def essential(template: str) -> bool:
    return bool(TEMPLATES[template]["essential"])
