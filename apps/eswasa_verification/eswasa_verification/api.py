# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Whitelisted verification API — VerificationResult (OpenAPI `/verify/{token}`).

Discoverable methods (A4 / Core):
  - eswasa_verification.api.verify_token(token)  — allow_guest
  - eswasa_verification.api.lookup_register(entry_id)

Consumes Register Entry + Verification Token created by certification R-C3.
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime

SMOKE_METHODS = ["verify_token", "lookup_register"]


def _iso(value: Any) -> str | None:
    if not value:
        return None
    dt = get_datetime(value)
    return dt.isoformat() if dt else None


def _parse_details(raw: Any) -> dict[str, Any]:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {"value": parsed}
        except json.JSONDecodeError:
            return {"raw": raw}
    return {"value": raw}


def _not_found(token: str) -> dict[str, Any]:
    return {
        "valid": False,
        "token": token or "",
        "subject": None,
        "issued_at": None,
        "expires_at": None,
        "details": {"reason": "not_found"},
    }


def _serialize_result(
    *,
    token: str,
    valid: bool,
    subject: str | None,
    issued_at: Any,
    expires_at: Any,
    details: dict[str, Any],
) -> dict[str, Any]:
    return {
        "valid": valid,
        "token": token,
        "subject": subject,
        "issued_at": _iso(issued_at),
        "expires_at": _iso(expires_at),
        "details": details,
    }


def _load_token(token: str) -> Any:
    """Lookup Verification Token by token field or name (R-C3 compatible)."""
    if not token:
        return None
    if not frappe.db.exists("DocType", "Verification Token"):
        return None

    tok = frappe.db.get_value(
        "Verification Token",
        {"token": token},
        ["name", "token", "register_entry", "issued_at", "expires_at", "status", "qr_payload"],
        as_dict=True,
    )
    if tok:
        return tok
    if frappe.db.exists("Verification Token", token):
        return frappe.db.get_value(
            "Verification Token",
            token,
            ["name", "token", "register_entry", "issued_at", "expires_at", "status", "qr_payload"],
            as_dict=True,
        )
    return None


def _load_register(entry_name: str) -> Any:
    """Load Register Entry by name or entry_id (public verify path)."""
    if not entry_name or not frappe.db.exists("DocType", "Register Entry"):
        return None
    if frappe.db.exists("Register Entry", entry_name):
        return frappe.db.get_value(
            "Register Entry",
            entry_name,
            [
                "name",
                "entry_id",
                "entry_type",
                "subject",
                "issued_at",
                "expires_at",
                "status",
                "details_json",
                "is_public",
                "reference_doctype",
                "reference_name",
            ],
            as_dict=True,
        )
    by_id = frappe.db.get_value("Register Entry", {"entry_id": entry_name}, "name")
    if by_id:
        return _load_register(by_id)
    return None


@frappe.whitelist(allow_guest=True)
def verify_token(token: str | None = None) -> dict[str, Any]:
    """Public certificate / mark verification (OpenAPI VerificationResult).

    Looks up Verification Token → Register Entry (created by certification R-C3).
    Guests only see public entries. Missing / private tokens return graceful
    not_found (never throws). Uses db.get_value to bypass Desk permissions.
    """
    token = (token or "").strip()
    if not token:
        return _not_found(token)

    tok = _load_token(token)
    if not tok:
        return _not_found(token)

    entry_name = tok.register_entry
    entry = _load_register(entry_name) if entry_name else None
    if not entry:
        return _not_found(token)

    is_guest = frappe.session.user == "Guest"
    if is_guest and not int(entry.is_public or 0):
        return _not_found(token)

    details = _parse_details(entry.details_json)
    details.update(
        {
            "entry_type": entry.entry_type,
            "status": entry.status,
            "entry_id": entry.entry_id or entry.name,
            "token_status": tok.status,
        }
    )
    if entry.reference_doctype and entry.reference_name:
        details["reference_doctype"] = entry.reference_doctype
        details["reference_name"] = entry.reference_name
    if tok.qr_payload:
        details["qr_payload"] = tok.qr_payload

    now = now_datetime()
    token_ok = (tok.status or "Active") == "Active"
    entry_ok = (entry.status or "Valid") == "Valid"

    expires = get_datetime(tok.expires_at) or get_datetime(entry.expires_at)
    if expires and expires < now:
        token_ok = False
        details["reason"] = "expired"
    elif not token_ok:
        details["reason"] = (tok.status or "inactive").lower()
    elif not entry_ok:
        details["reason"] = (entry.status or "invalid").lower()

    valid = bool(token_ok and entry_ok)
    if not valid and "reason" not in details:
        details["reason"] = "invalid"

    return _serialize_result(
        token=tok.token or token,
        valid=valid,
        subject=entry.subject,
        issued_at=tok.issued_at or entry.issued_at,
        expires_at=tok.expires_at or entry.expires_at,
        details=details,
    )


@frappe.whitelist()
def lookup_register(entry_id: str | None = None) -> dict[str, Any]:
    """Staff Register Entry lookup (requires Register Entry:read)."""
    if not entry_id:
        frappe.throw(_("entry_id is required"), frappe.ValidationError)

    if not frappe.has_permission("Register Entry", "read"):
        frappe.throw(_("Not permitted to read Register Entry"), frappe.PermissionError)

    entry = _load_register(entry_id)
    if not entry:
        return {
            "entry_id": entry_id,
            "subject": None,
            "status": "not_found",
            "is_public": False,
        }

    return {
        "entry_id": entry.entry_id or entry.name,
        "subject": entry.subject,
        "status": entry.status,
        "entry_type": entry.entry_type,
        "is_public": bool(entry.is_public),
        "issued_at": _iso(entry.issued_at),
        "expires_at": _iso(entry.expires_at),
        "details": _parse_details(entry.details_json),
        "reference_doctype": entry.reference_doctype,
        "reference_name": entry.reference_name,
    }
