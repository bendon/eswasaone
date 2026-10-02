# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Whitelisted standards API — StandardSummary + publish gate.

Discoverable methods (A4 / Core):
  - eswasa_standards.api.list_standards(q=None, sector=None)
  - eswasa_standards.api.get_standard(code)
  - eswasa_standards.api.publish_standard(standard, confirm=False, work_item=None)

Never returns full / licensed standard body text — summary fields only;
buy_url routes purchasers to the e-store.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint

SMOKE_METHODS = ["list_standards", "get_standard", "publish_standard"]

STANDARDS_WRITE_ROLES = (
    "Eswasa Standards Manager",
    "Eswasa Standards Officer",
    "System Manager",
    "Administrator",
)


def _buy_url(code: str, stored: str | None = None) -> str:
    if stored:
        return stored
    slug = (code or "").replace(" ", "-").replace(":", "-")
    return f"/estore/{slug}"


def _serialize_standard(row: Any) -> dict[str, Any]:
    code = row.code or row.name
    return {
        "code": code,
        "title": row.title,
        "sector": row.sector,
        "status": row.status,
        "buy_url": _buy_url(code, getattr(row, "buy_url", None)),
    }


def _require_standards_write() -> None:
    roles = set(frappe.get_roles())
    if frappe.session.user == "Administrator":
        return
    if not roles.intersection(STANDARDS_WRITE_ROLES):
        frappe.throw(
            _("Not permitted to publish standards"),
            frappe.PermissionError,
        )


@frappe.whitelist()
def list_standards(q: str | None = None, sector: str | None = None) -> dict[str, Any]:
    """GET /standards — StandardSummary[] (permissions-aware)."""
    if not frappe.has_permission("Standard", "read"):
        frappe.throw(_("Not permitted to read Standard"), frappe.PermissionError)

    filters: dict[str, Any] = {}
    if sector:
        filters["sector"] = sector

    or_filters = None
    if q:
        ql = f"%{q}%"
        or_filters = [
            ["code", "like", ql],
            ["title", "like", ql],
        ]

    rows = frappe.get_all(
        "Standard",
        filters=filters,
        or_filters=or_filters,
        fields=["name", "code", "title", "sector", "status", "buy_url"],
        order_by="code asc",
        limit_page_length=100,
    )
    return {"items": [_serialize_standard(r) for r in rows]}


@frappe.whitelist()
def get_standard(code: str | None = None) -> dict[str, Any]:
    """Single StandardSummary by code (no abstract / licensed body)."""
    if not code:
        frappe.throw(_("code is required"), frappe.ValidationError)

    if not frappe.has_permission("Standard", "read"):
        frappe.throw(_("Not permitted to read Standard"), frappe.PermissionError)

    name = code
    if not frappe.db.exists("Standard", name):
        name = frappe.db.get_value("Standard", {"code": code}, "name")
    if not name:
        return {
            "code": code,
            "title": None,
            "sector": None,
            "status": "not_found",
            "buy_url": _buy_url(code),
        }

    row = frappe.db.get_value(
        "Standard",
        name,
        ["name", "code", "title", "sector", "status", "buy_url"],
        as_dict=True,
    )
    return _serialize_standard(row)


@frappe.whitelist()
def publish_standard(
    standard: str | None = None,
    confirm: bool | int | str = False,
    work_item: str | None = None,
) -> dict[str, Any]:
    """POST /standards/publish — Gazette + catalogue + e-store (R-S3 gate).

    Contract: ``{ standard, confirm }``. Requires explicit confirm=true
    (confirm-before-commit). Roles: Standards Manager / Officer.
    """
    _require_standards_write()

    if not cint(confirm):
        frappe.throw(
            _("confirm=true is required before publishing a standard"),
            frappe.ValidationError,
        )
    if not standard and not work_item:
        frappe.throw(_("standard (or work_item) is required"), frappe.ValidationError)

    if not frappe.has_permission("Standard", "write") and frappe.session.user != "Administrator":
        frappe.throw(_("Not permitted to write Standard"), frappe.PermissionError)

    from eswasa_standards.rules import rs3_publish_standard

    title = None
    sector = None
    if work_item and frappe.db.exists("Work Item", work_item):
        title = frappe.db.get_value("Work Item", work_item, "title")
        sector = frappe.db.get_value("Work Item", work_item, "sector")
    elif standard and frappe.db.exists("Standard", standard):
        title = frappe.db.get_value("Standard", standard, "title")
        sector = frappe.db.get_value("Standard", standard, "sector")

    result = rs3_publish_standard(
        standard_code=standard,
        title=title,
        sector=sector,
        work_item=work_item,
    )
    frappe.db.commit()
    return result
