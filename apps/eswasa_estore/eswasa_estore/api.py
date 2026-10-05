# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Whitelisted e-store API — catalogue, checkout, MoMo callback, licensed download.

Discoverable methods (A4 / Core):
  - eswasa_estore.api.list_products(q=None, sector=None)
  - eswasa_estore.api.checkout(items, payment_method, confirm, ...)
  - eswasa_estore.api.momo_callback(payload / reference_id, status, ...)
  - eswasa_estore.api.download(token) — watermarked metadata; no licensed full text

Checkout is confirm-before-commit. Never returns licensed PDF / full standard text
in free catalogue responses.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, now_datetime

from eswasa_estore.rules import (
    create_estore_order,
    notify_email,
    re2_momo_success,
    re3_momo_fail,
)

SMOKE_METHODS = ["checkout", "list_products", "momo_callback", "download"]


def _buy_url(code: str) -> str:
    slug = (code or "").replace(" ", "-").replace(":", "-")
    return f"/estore/checkout?code={slug}"


def _parse_jsonish(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


@frappe.whitelist()
def list_products(q: str | None = None, sector: str | None = None) -> dict[str, Any]:
    """Catalogue summaries for Core buy links (no licensed body text)."""
    if not frappe.has_permission("Standard Product", "read"):
        # Soft empty rather than hard-fail — Core can fall back to standards list
        return {"items": []}

    filters: dict[str, Any] = {"is_published": 1}
    if sector:
        filters["sector"] = sector

    or_filters = None
    if q:
        ql = f"%{q}%"
        or_filters = [
            ["standard_code", "like", ql],
            ["title", "like", ql],
        ]

    rows = frappe.get_all(
        "Standard Product",
        filters=filters,
        or_filters=or_filters,
        fields=["name", "standard_code", "title", "sector", "price_szl", "rights"],
        order_by="standard_code asc",
        limit_page_length=100,
    )
    items = [
        {
            "code": r.standard_code or r.name,
            "title": r.title,
            "sector": r.sector,
            "status": "Published",
            "buy_url": _buy_url(r.standard_code or r.name),
            "price_szl": r.price_szl,
            "rights": r.rights or "licensed",
        }
        for r in rows
    ]
    return {"items": items}


@frappe.whitelist()
def checkout(
    items: str | list | None = None,
    payment_method: str = "momo",
    confirm: int | bool | str = 0,
    momo_reference: str | None = None,
    order_id: str | None = None,
    customer: str | None = None,
    user_email: str | None = None,
    amount_szl: float | str | None = None,
) -> dict[str, Any]:
    """POST /estore/checkout — CheckoutResult (confirm-before-commit).

    Creates Estore Order. MoMo path stays Pending Payment until momo_callback (R-E2).
    Invoice path marks paid and fires R-E1 fulfilment immediately.
    """
    if not frappe.has_permission("Estore Order", "create") and frappe.session.user != "Administrator":
        # Soft-allow authenticated buyers: Estore Clerk/Manager or System Manager
        roles = set(frappe.get_roles())
        if not roles.intersection(
            {"System Manager", "Eswasa Estore Manager", "Eswasa Estore Clerk", "All"}
        ):
            # Still allow if user can read Standard Product (citizen buyer via Core)
            if not frappe.has_permission("Standard Product", "read"):
                frappe.throw(_("Not permitted to checkout"), frappe.PermissionError)

    items = _parse_jsonish(items) or []
    if not isinstance(items, list):
        items = []
    confirm_bool = bool(cint(confirm)) if not isinstance(confirm, bool) else confirm
    if not confirm_bool:
        return {
            "order_id": None,
            "status": "confirmation_required",
            "payment_ref": None,
            "momo_reference": None,
        }

    result = create_estore_order(
        items=items,
        payment_method=payment_method or "momo",
        momo_reference=momo_reference,
        order_id=order_id,
        customer=customer,
        user_email=user_email,
        amount_szl=float(amount_szl) if amount_szl not in (None, "") else None,
    )
    return result


@frappe.whitelist(allow_guest=True)
def momo_callback(
    payload: str | dict | None = None,
    reference_id: str | None = None,
    status: str | None = None,
    external_id: str | None = None,
    amount: str | float | None = None,
    currency: str | None = None,
    reason: str | None = None,
    financial_transaction_id: str | None = None,
) -> dict[str, Any]:
    """MoMo Collection callback → R-E2 (success) or R-E3 (fail/timeout).

    Accepts either a JSON ``payload`` (MTN shape) or flat kwargs.
    Guest-allowed so Core /adapters/momo/callback can forward without session.
    """
    data: dict[str, Any] = {}
    if payload is not None:
        parsed = _parse_jsonish(payload)
        if isinstance(parsed, dict):
            data = parsed

    reference_id = (
        reference_id
        or data.get("referenceId")
        or data.get("reference_id")
        or data.get("id")
    )
    status_raw = str(status or data.get("status") or "PENDING").upper()
    external_id = external_id or data.get("externalId") or data.get("external_id")
    amount = amount if amount is not None else data.get("amount")
    currency = currency or data.get("currency")
    reason = reason or data.get("reason")
    financial_transaction_id = (
        financial_transaction_id
        or data.get("financialTransactionId")
        or data.get("financial_transaction_id")
    )

    if status_raw in ("SUCCESSFUL", "SUCCESS", "SUCCESSFUL_PAYMENT"):
        result = re2_momo_success(
            reference_id=str(reference_id) if reference_id else None,
            external_id=str(external_id) if external_id else None,
            amount=amount,
            currency=currency,
            financial_transaction_id=(
                str(financial_transaction_id) if financial_transaction_id else None
            ),
            raw=data,
        )
        return {"status": "accepted", "rule": "R-E2", **result}

    if status_raw in ("FAILED", "TIMEOUT", "REJECTED", "CANCELLED", "EXPIRED"):
        result = re3_momo_fail(
            reference_id=str(reference_id) if reference_id else None,
            external_id=str(external_id) if external_id else None,
            reason=reason or status_raw,
            status=status_raw,
            raw=data,
        )
        return {"status": "accepted", "rule": "R-E3", **result}

    # Pending / unknown — acknowledge without side-effects
    return {
        "status": "accepted",
        "rule": None,
        "ok": True,
        "momo_status": status_raw,
        "momo_reference": reference_id,
    }


@frappe.whitelist(allow_guest=True)
def download(token: str | None = None) -> dict[str, Any]:
    """Redeem Download Token — returns watermarked access metadata only.

    Never returns licensed full PDF text in the free JSON response. Callers must
    use the signed asset URL when wired. Rights remain ``licensed``.
    """
    token = (token or "").strip()
    if not token:
        frappe.throw(_("token is required"), frappe.ValidationError)

    tok = frappe.db.get_value(
        "Download Token",
        {"token": token},
        [
            "name",
            "token",
            "entitlement",
            "standard_product",
            "expires_at",
            "max_downloads",
            "download_count",
            "status",
        ],
        as_dict=True,
    )
    if not tok and frappe.db.exists("Download Token", token):
        tok = frappe.db.get_value(
            "Download Token",
            token,
            [
                "name",
                "token",
                "entitlement",
                "standard_product",
                "expires_at",
                "max_downloads",
                "download_count",
                "status",
            ],
            as_dict=True,
        )
    if not tok:
        return {"ok": False, "reason": "not_found", "rights": "licensed"}

    now = now_datetime()
    expires = get_datetime(tok.expires_at) if tok.expires_at else None
    if (tok.status or "Active") != "Active":
        return {"ok": False, "reason": (tok.status or "inactive").lower(), "rights": "licensed"}
    if expires and expires < now:
        frappe.db.set_value("Download Token", tok.name, "status", "Expired", update_modified=False)
        return {"ok": False, "reason": "expired", "rights": "licensed"}

    used = cint(tok.download_count or 0)
    max_d = cint(tok.max_downloads or 3)
    if used >= max_d:
        frappe.db.set_value("Download Token", tok.name, "status", "Exhausted", update_modified=False)
        return {"ok": False, "reason": "exhausted", "rights": "licensed"}

    frappe.db.set_value(
        "Download Token",
        tok.name,
        "download_count",
        used + 1,
        update_modified=False,
    )
    if used + 1 >= max_d:
        frappe.db.set_value("Download Token", tok.name, "status", "Exhausted", update_modified=False)

    product = None
    rights = "licensed"
    title = None
    if tok.standard_product and frappe.db.exists("Standard Product", tok.standard_product):
        product = frappe.db.get_value(
            "Standard Product",
            tok.standard_product,
            ["standard_code", "title", "rights", "pdf_asset"],
            as_dict=True,
        )
        rights = (product.rights if product else None) or "licensed"
        title = product.title if product else None

    # Watermark label from entitlement / comments — never emit full PDF bytes here
    watermark = None
    ent_email = None
    if tok.entitlement and frappe.db.exists("License Entitlement", tok.entitlement):
        ent_email = frappe.db.get_value("License Entitlement", tok.entitlement, "user_email")
        watermark = (
            f"ESWASA licensed | {ent_email or 'user'} | {tok.entitlement} | {tok.standard_product}"
        )

    # TODO: wire real — stream watermarked PDF bytes from pdf_asset via private file
    asset_hint = None
    if product and product.pdf_asset and rights != "licensed":
        # Open/public may expose asset path; licensed stays opaque
        asset_hint = product.pdf_asset

    return {
        "ok": True,
        "token": tok.token,
        "standard_code": tok.standard_product,
        "title": title,
        "rights": rights,
        "watermark": watermark,
        "downloads_remaining": max(max_d - used - 1, 0),
        "expires_at": tok.expires_at.isoformat() if tok.expires_at else None,
        "asset_url": asset_hint,
        "message": (
            "Licensed standard: paraphrase-and-cite only in free answers; "
            "full text via this watermarked download entitlement."
            if rights == "licensed"
            else "Open/public asset metadata."
        ),
    }


@frappe.whitelist()
def retry_payment(order_id: str | None = None) -> dict[str, Any]:
    """R-E3 helper — reset Failed order to Pending Payment and return retry URL."""
    if not order_id:
        frappe.throw(_("order_id is required"), frappe.ValidationError)
    if not frappe.db.exists("Estore Order", order_id):
        return {"ok": False, "reason": "not_found"}

    order = frappe.get_doc("Estore Order", order_id)
    if order.status == "Paid":
        return {"ok": True, "status": "Paid", "order_id": order.order_id}

    new_ref = str(frappe.generate_hash(length=16))
    order.db_set("status", "Pending Payment", update_modified=False)
    order.db_set("momo_reference", new_ref, update_modified=False)
    order.db_set("failure_reason", "", update_modified=False)
    retry_url = order.retry_url or f"/estore/checkout?order={quote(order.order_id)}"

    notify_email(
        [order.user_email] if order.user_email else [],
        f"EswasaOne payment retry: {order.order_id}",
        f"<p>Retry payment for <b>{order.order_id}</b>.</p><p>New MoMo ref: {new_ref}</p>"
        f"<p><a href=\"{retry_url}\">{retry_url}</a></p>",
    )
    return {
        "ok": True,
        "order_id": order.order_id,
        "status": "pending_payment",
        "momo_reference": new_ref,
        "retry_url": retry_url,
    }
