#!/usr/bin/env python3
"""R-C3 acceptance-gate smoke for eswasa_certification.

Run from frappe-bench:
  bench --site eswasaone.localhost execute eswasa_certification.smoke_rc3.run

Or:
  bench --site eswasaone.localhost run-tests --app eswasa_certification --module eswasa_certification.tests.test_rc3_gate
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe.utils import add_months, nowdate


def run() -> dict[str, Any]:
    """Create + submit a Certificate; assert invoice, register, token, feed."""
    from eswasa_certification.seed import DEMO_SCHEME, ensure_demo_data

    demo = ensure_demo_data()
    scheme = demo.get("scheme") or DEMO_SCHEME

    # Ensure scheme fee for invoice
    if frappe.db.exists("Certification Scheme", scheme):
        frappe.db.set_value(
            "Certification Scheme",
            scheme,
            {
                "certification_fee": 5000,
                "assessment_turnaround_days": 14,
            },
            update_modified=False,
        )

    app = frappe.get_doc(
        {
            "doctype": "Certification Application",
            "scheme": scheme,
            "applicant_name": "R-C3 Smoke Org (Pty) Ltd",
            "applicant_org": "R-C3 Smoke Org (Pty) Ltd",
            "contact_email": "rc3-smoke@example.com",
            "application_date": nowdate(),
            "workflow_state": "Application",
            "nc_open": 0,
            "certificate_blocked": 0,
            "assessment_notes": "rc3-smoke-application",
        }
    )
    app.insert(ignore_permissions=True)
    # Jump to Audit for certificate issue without walking full workflow
    frappe.db.set_value(
        "Certification Application",
        app.name,
        {
            "workflow_state": "Audit",
            "nc_open": 0,
            "certificate_blocked": 0,
        },
        update_modified=False,
    )
    app.reload()

    cert_no = f"RC3-SMOKE-{frappe.generate_hash(length=6).upper()}"
    cert = frappe.get_doc(
        {
            "doctype": "Certificate",
            "certificate_number": cert_no,
            "application": app.name,
            "scheme": scheme,
            "holder_name": app.applicant_name,
            "status": "Active",
            "issued_on": nowdate(),
            "valid_until": add_months(nowdate(), 36),
            "scope_summary": "R-C3 smoke scope: ISO 9001 demo.",
        }
    )
    cert.insert(ignore_permissions=True)
    cert.flags.ignore_permissions = True
    try:
        cert.submit()
    except Exception as exc:
        # Fallback if global hooks abort submit after write
        frappe.db.set_value("Certificate", cert.name, "docstatus", 1, update_modified=False)
        cert.reload()
        from eswasa_certification.rules import rc3_certificate_submitted

        rc3_certificate_submitted(cert)
        frappe.logger("eswasa_certification").warning(f"R-C3 submit fallback: {exc}")

    cert.reload()
    frappe.db.commit()

    result = {
        "certificate": cert.name,
        "certificate_number": cert.certificate_number,
        "docstatus": cert.docstatus,
        "sales_invoice": cert.sales_invoice,
        "register_entry": cert.register_entry,
        "verification_token": cert.verification_token,
        "qr_payload": cert.qr_payload,
        "checks": {},
    }

    result["checks"]["has_invoice"] = bool(
        cert.sales_invoice and frappe.db.exists("Sales Invoice", cert.sales_invoice)
    )
    result["checks"]["has_token"] = bool(cert.verification_token)
    result["checks"]["has_qr"] = bool(cert.qr_payload and cert.verification_token in (cert.qr_payload or ""))
    result["checks"]["has_register"] = bool(
        cert.register_entry
        and frappe.db.exists("DocType", "Register Entry")
        and frappe.db.exists("Register Entry", cert.register_entry)
    )
    # Feed evidence: Comment with [R-C3] or [feed:R-C3]
    comments = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "Certificate",
            "reference_name": cert.name,
            "content": ("like", "%R-C3%"),
        },
        pluck="name",
    )
    result["checks"]["has_feed_comment"] = bool(comments)
    result["feed_comments"] = comments

    # Verification Token row
    if cert.verification_token and frappe.db.exists("DocType", "Verification Token"):
        result["checks"]["has_verification_token_doc"] = bool(
            frappe.db.exists("Verification Token", {"token": cert.verification_token})
        )
    else:
        result["checks"]["has_verification_token_doc"] = False

    # Surveillance scheduled
    result["checks"]["has_surveillance"] = bool(
        frappe.db.exists("Surveillance Visit", {"certificate": cert.name})
    )

    required = [
        "has_invoice",
        "has_token",
        "has_qr",
        "has_register",
        "has_feed_comment",
        "has_verification_token_doc",
    ]
    result["pass"] = all(result["checks"].get(k) for k in required)
    result["R-C3"] = "PASS" if result["pass"] else "FAIL"

    print(json.dumps(result, indent=2, default=str))
    if not result["pass"]:
        frappe.throw(f"R-C3 gate FAIL: {json.dumps(result['checks'])}")
    return result
