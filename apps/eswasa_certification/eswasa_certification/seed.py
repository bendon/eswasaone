"""Demo-only seed for Ask-box / smoke: 'show overdue audits'.

A10 DemoSeed (`seed/`) owns long-lived narrative anchors such as:
  - CERT-2025-0041  (portal activity / Certificate narrative — NOT created here)
  - AUD-2026-00001  (live overdue-audit smoke id — we may create/refresh it)

This module is **absorbable**:
  - Docs are tagged with DEMO_* markers (assessment_notes / findings_summary).
  - Applications use APP-.YYYY.-.##### — never CERT-.YYYY.-.#####.
  - Prefer stable audit name AUD-2026-00001 when free; never overwrite a row
    that exists without our marker (A10 may have absorbed it).
  - Disable via site_config ``eswasa_certification_demo_seed = 0``
    or env ``ESWASA_CERT_DEMO_SEED=0`` so A10 can take over without fights.

Safe to call repeatedly via after_install / after_migrate / ensure_demo_data().
"""

from __future__ import annotations

import os
from datetime import timedelta

import frappe
from frappe.utils import cint, getdate, nowdate


DEMO_SCHEME = "ISO9001-QMS"
DEMO_AUDITOR = "AUD-001"
DEMO_APP_KEY = "demo-overdue-application"  # stored in assessment_notes marker
DEMO_AUDIT_KEY = "demo-overdue-audit"  # stored in findings_summary marker
# Preferred smoke id — must keep returning this for Core live path.
DEMO_AUDIT_PREFERRED_NAME = "AUD-2026-00001"
# Reserved for A10 — do not insert Certificate/Application claiming these names
# except AUD-2026-00001 which we may create first for Core smoke (absorbable).
A10_RESERVED_CERT = "CERT-2025-0041"


def demo_seed_enabled() -> bool:
    """Return False when A10 / ops have disabled local demo seeding."""
    conf = frappe.conf.get("eswasa_certification_demo_seed")
    if conf is not None:
        return bool(cint(conf))
    env = os.environ.get("ESWASA_CERT_DEMO_SEED")
    if env is not None:
        return env.strip().lower() not in ("0", "false", "no", "off")
    return True


def ensure_demo_data() -> dict:
    """Create one scheme, auditor, competence, application, and an overdue audit.

    Safe to call repeatedly. Returns names of demo docs (or skipped=True).
    """
    if not demo_seed_enabled():
        return {
            "skipped": True,
            "reason": "eswasa_certification_demo_seed disabled",
            "scheme": DEMO_SCHEME if frappe.db.exists("Certification Scheme", DEMO_SCHEME) else None,
            "auditor": DEMO_AUDITOR if frappe.db.exists("Auditor", DEMO_AUDITOR) else None,
            "application": _find_demo_application(),
            "audit": _find_demo_audit(),
        }

    scheme = _ensure_scheme()
    auditor = _ensure_auditor()
    _ensure_competence(auditor, scheme)
    application = _ensure_application(scheme, auditor)
    audit = _ensure_overdue_audit(application, scheme, auditor)
    return {
        "skipped": False,
        "scheme": scheme,
        "auditor": auditor,
        "application": application,
        "audit": audit,
    }


def _find_demo_application() -> str | None:
    return frappe.db.get_value(
        "Certification Application",
        {"assessment_notes": ("like", f"%{DEMO_APP_KEY}%")},
        "name",
    )


def _find_demo_audit() -> str | None:
    by_marker = frappe.db.get_value(
        "Audit",
        {"findings_summary": ("like", f"%{DEMO_AUDIT_KEY}%")},
        "name",
    )
    if by_marker:
        return by_marker
    # Absorbable: preferred smoke name may exist from prior seed / A10
    if frappe.db.exists("Audit", DEMO_AUDIT_PREFERRED_NAME):
        return DEMO_AUDIT_PREFERRED_NAME
    return None


def _ensure_scheme() -> str:
    if frappe.db.exists("Certification Scheme", DEMO_SCHEME):
        return DEMO_SCHEME
    doc = frappe.get_doc(
        {
            "doctype": "Certification Scheme",
            "scheme_code": DEMO_SCHEME,
            "scheme_name": "Quality Management Systems (ISO 9001)",
            "standard_ref": "ISO 9001:2015",
            "scheme_type": "Management System",
            "accreditation_basis": "ISO/IEC 17021",
            "surveillance_interval_months": 12,
            "certificate_validity_months": 36,
            "is_active": 1,
            "description": (
                "Demo certification scheme for EswasaOne Ask-box and CBMS vertical slice."
            ),
        }
    )
    doc.insert(ignore_permissions=True)
    return doc.name


def _ensure_auditor() -> str:
    if frappe.db.exists("Auditor", DEMO_AUDITOR):
        return DEMO_AUDITOR
    doc = frappe.get_doc(
        {
            "doctype": "Auditor",
            "auditor_code": DEMO_AUDITOR,
            "auditor_name": "Sipho Dlamini",
            "employment_type": "Internal",
            "email": "sipho.dlamini@eswasa.org.sz",
            "is_active": 1,
        }
    )
    doc.insert(ignore_permissions=True)
    return doc.name


def _ensure_competence(auditor: str, scheme: str) -> None:
    exists = frappe.db.exists(
        "Auditor Competence",
        {"auditor": auditor, "scheme": scheme, "competence_level": "Lead Auditor"},
    )
    if exists:
        return
    frappe.get_doc(
        {
            "doctype": "Auditor Competence",
            "auditor": auditor,
            "scheme": scheme,
            "standard_ref": "ISO 9001:2015",
            "competence_level": "Lead Auditor",
            "valid_from": nowdate(),
            "evidence_notes": "Demo competence record for ISO 9001 lead auditor.",
        }
    ).insert(ignore_permissions=True)


def _ensure_application(scheme: str, auditor: str) -> str:
    existing = _find_demo_application()
    if existing:
        return existing

    # Do not claim A10 narrative application/certificate id
    doc = frappe.get_doc(
        {
            "doctype": "Certification Application",
            "scheme": scheme,
            "applicant_name": "Lusoti Foods (Pty) Ltd",
            "applicant_org": "Lusoti Foods (Pty) Ltd",
            "contact_email": "quality@lusoti.example",
            "contact_phone": "+268 2400 0000",
            "site_address": "Matsapha Industrial Site, Eswatini",
            "application_date": nowdate(),
            "workflow_state": "Audit Scheduled",
            "assigned_auditor": auditor,
            "assessment_notes": (
                f"{DEMO_APP_KEY}: seeded demo application with overdue Stage-1 audit. "
                "Absorbable by A10 DemoSeed; uses APP- series, not CERT-2025-0041."
            ),
        }
    )
    doc.insert(ignore_permissions=True)
    return doc.name


def _audit_is_ours(name: str) -> bool:
    summary = frappe.db.get_value("Audit", name, "findings_summary") or ""
    return DEMO_AUDIT_KEY in summary


def _ensure_overdue_audit(application: str, scheme: str, auditor: str) -> str:
    existing = frappe.db.get_value(
        "Audit",
        {
            "application": application,
            "audit_type": "Stage 1",
            "findings_summary": ("like", f"%{DEMO_AUDIT_KEY}%"),
        },
        "name",
    )
    overdue_date = getdate(nowdate()) - timedelta(days=14)

    if existing:
        frappe.db.set_value(
            "Audit",
            existing,
            {
                "due_date": overdue_date,
                "status": "Overdue",
                "auditor": auditor,
                "scheme": scheme,
            },
            update_modified=False,
        )
        return existing

    # Prefer stable smoke name when free; if taken by A10 without our marker, leave it.
    preferred = DEMO_AUDIT_PREFERRED_NAME
    if frappe.db.exists("Audit", preferred):
        if _audit_is_ours(preferred):
            frappe.db.set_value(
                "Audit",
                preferred,
                {
                    "application": application,
                    "due_date": overdue_date,
                    "status": "Overdue",
                    "auditor": auditor,
                    "scheme": scheme,
                },
                update_modified=False,
            )
            return preferred
        # A10 (or other) owns AUD-2026-00001 — create a separate marked demo audit
        # via naming series so we do not fight that name.
        doc = frappe.get_doc(
            {
                "doctype": "Audit",
                "application": application,
                "scheme": scheme,
                "auditor": auditor,
                "audit_type": "Stage 1",
                "status": "Overdue",
                "due_date": overdue_date,
                "planned_date": overdue_date,
                "findings_summary": (
                    f"{DEMO_AUDIT_KEY}: seeded for Ask-box; "
                    f"{preferred} reserved/absorbed elsewhere."
                ),
            }
        )
        doc.insert(ignore_permissions=True)
        return doc.name

    doc = frappe.get_doc(
        {
            "doctype": "Audit",
            "application": application,
            "scheme": scheme,
            "auditor": auditor,
            "audit_type": "Stage 1",
            "status": "Overdue",
            "due_date": overdue_date,
            "planned_date": overdue_date,
            "findings_summary": (
                f"{DEMO_AUDIT_KEY}: seeded for Ask-box 'show overdue audits'. "
                "Preferred name AUD-2026-00001 for Core smoke; A10 may absorb."
            ),
        }
    )
    # Pin smoke id without bumping past a future A10 claim incorrectly
    doc.name = preferred
    doc.flags.name_set = True
    doc.insert(ignore_permissions=True)
    # Keep Series counter coherent so the next autoname is AUD-2026-00002+
    try:
        prefix = "AUD-2026-"
        current = cint(frappe.db.get_value("Series", prefix, "current") or 0)
        if current < 1:
            frappe.db.sql(
                "INSERT INTO tabSeries (name, current) VALUES (%s, 1) "
                "ON DUPLICATE KEY UPDATE current = GREATEST(current, 1)",
                (prefix,),
            )
    except Exception:
        pass
    return doc.name
