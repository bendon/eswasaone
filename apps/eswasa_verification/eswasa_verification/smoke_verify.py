#!/usr/bin/env python3
"""Verification smoke — Register Entry (R-C3 shape) readable via public verify_token.

Run from frappe-bench:
  bench --site eswasaone.localhost execute eswasa_verification.smoke_verify.run
"""

from __future__ import annotations

import json
import secrets
from typing import Any

import frappe
from frappe.utils import add_months, now_datetime


def run() -> dict[str, Any]:
    from eswasa_verification.api import lookup_register, verify_token

    tag = frappe.generate_hash(length=6).upper()
    entry_id = f"REG-SMOKE-{tag}"
    token = secrets.token_urlsafe(24)
    subject = f"Smoke Holder {tag}"

    # Mirror R-C3 Register Entry + Verification Token shape
    if not frappe.db.exists("Register Entry", entry_id):
        frappe.get_doc(
            {
                "doctype": "Register Entry",
                "entry_id": entry_id,
                "entry_type": "Certificate",
                "subject": subject,
                "reference_doctype": "Certificate" if frappe.db.exists("DocType", "Certificate") else None,
                "issued_at": now_datetime(),
                "expires_at": add_months(now_datetime(), 36),
                "status": "Valid",
                "details_json": json.dumps(
                    {
                        "certificate_number": f"CERT-SMOKE-{tag}",
                        "scheme": "ISO 9001",
                        "rule": "R-C3-smoke",
                    }
                ),
                "is_public": 1,
            }
        ).insert(ignore_permissions=True)

    if not frappe.db.exists("Verification Token", token):
        frappe.get_doc(
            {
                "doctype": "Verification Token",
                "token": token,
                "register_entry": entry_id,
                "issued_at": now_datetime(),
                "expires_at": add_months(now_datetime(), 36),
                "qr_payload": f"https://eswasaone.aiceafrica.com/api/verify/{token}",
                "status": "Active",
            }
        ).insert(ignore_permissions=True)

    # Guest session path
    frappe.set_user("Guest")
    result = verify_token(token)
    frappe.set_user("Administrator")

    assert result.get("valid") is True, result
    assert result.get("subject") == subject, result
    assert result.get("details", {}).get("entry_id") == entry_id, result

    missing = verify_token("no-such-token-xyz")
    assert missing.get("valid") is False, missing
    assert missing.get("details", {}).get("reason") == "not_found", missing

    # Private entry must not leak to Guest
    priv_id = f"REG-PRIV-{tag}"
    priv_tok = secrets.token_urlsafe(16)
    frappe.get_doc(
        {
            "doctype": "Register Entry",
            "entry_id": priv_id,
            "entry_type": "Other",
            "subject": "Private Smoke",
            "status": "Valid",
            "is_public": 0,
            "issued_at": now_datetime(),
        }
    ).insert(ignore_permissions=True)
    frappe.get_doc(
        {
            "doctype": "Verification Token",
            "token": priv_tok,
            "register_entry": priv_id,
            "status": "Active",
            "issued_at": now_datetime(),
        }
    ).insert(ignore_permissions=True)

    frappe.set_user("Guest")
    priv = verify_token(priv_tok)
    frappe.set_user("Administrator")
    assert priv.get("valid") is False, priv
    assert priv.get("details", {}).get("reason") == "not_found", priv

    staff = lookup_register(entry_id)
    assert staff.get("status") == "Valid", staff

    frappe.db.commit()

    return {
        "ok": True,
        "entry_id": entry_id,
        "token": token,
        "verify": result,
        "private_hidden": True,
    }
