#!/usr/bin/env python3
"""R-E1…E3 acceptance smoke for eswasa_estore.

Run from frappe-bench:
  bench --site eswasaone.localhost execute eswasa_estore.smoke_re.run
"""

from __future__ import annotations

from typing import Any

import frappe


def run() -> dict[str, Any]:
    """Checkout → MoMo success (R-E2/E1) → MoMo fail (R-E3) on a second order."""
    from eswasa_estore.api import checkout, download, momo_callback
    from eswasa_estore.rules import re1_fulfil_purchase

    tag = frappe.generate_hash(length=6).upper()
    code = f"SZNS SMOKE-E-{tag}:2026"
    email = f"estore-smoke-{tag.lower()}@example.com"

    # Catalogue product
    if not frappe.db.exists("Standard Product", code):
        frappe.get_doc(
            {
                "doctype": "Standard Product",
                "standard_code": code,
                "title": f"E-store smoke standard {tag}",
                "price_szl": 450,
                "sector": "Smoke",
                "rights": "licensed",
                "is_published": 1,
                "description": "<p>Licensed smoke listing — no full text.</p>",
            }
        ).insert(ignore_permissions=True)

    # --- R-E2 path: checkout + successful MoMo callback ---
    momo_ref = f"momo-smoke-{tag.lower()}"
    order_id = f"SO-SMOKE-{tag}"
    co = checkout(
        items=[{"standard_code": code, "qty": 1}],
        payment_method="momo",
        confirm=True,
        momo_reference=momo_ref,
        order_id=order_id,
        customer=f"Smoke Buyer {tag}",
        user_email=email,
        amount_szl=450,
    )
    assert co.get("order_id") == order_id, co
    assert co.get("momo_reference") == momo_ref, co
    assert frappe.db.exists("Estore Order", order_id)

    ok = momo_callback(
        reference_id=momo_ref,
        status="SUCCESSFUL",
        external_id=order_id,
        amount="450.00",
        currency="SZL",
        financial_transaction_id=f"FT-{tag}",
    )
    assert ok.get("ok") is True, ok
    assert ok.get("rule") == "R-E2", ok

    order = frappe.get_doc("Estore Order", order_id)
    assert order.status == "Paid", order.status
    assert order.fulfilment_status == "Fulfilled", order.fulfilment_status

    ents = frappe.get_all(
        "License Entitlement",
        filters={"sales_order": order_id},
        pluck="name",
    )
    assert ents, "expected License Entitlement"

    toks = frappe.get_all(
        "Download Token",
        filters={"entitlement": ("in", ents), "status": "Active"},
        fields=["name", "token"],
    )
    assert toks, "expected Download Token"

    dl = download(token=toks[0].token)
    assert dl.get("ok") is True, dl
    assert dl.get("rights") == "licensed", dl
    assert dl.get("watermark"), dl
    # Must not embed PDF / normative body in the JSON payload
    assert "pdf_bytes" not in dl and "body" not in dl and not dl.get("asset_url")

    # Idempotent re-fulfil
    again = re1_fulfil_purchase(order_id=order_id)
    assert again.get("idempotent") or again.get("ok"), again

    # --- R-E3 path: fail / timeout ---
    fail_order = f"SO-SMOKE-F-{tag}"
    fail_ref = f"momo-fail-{tag.lower()}"
    checkout(
        items=[{"standard_code": code, "qty": 1}],
        payment_method="momo",
        confirm=True,
        momo_reference=fail_ref,
        order_id=fail_order,
        customer=f"Smoke Fail {tag}",
        user_email=email,
    )
    fail = momo_callback(
        reference_id=fail_ref,
        status="FAILED",
        external_id=fail_order,
        reason="payer_rejected",
    )
    assert fail.get("ok") is True, fail
    assert fail.get("rule") == "R-E3", fail
    assert fail.get("retry_url"), fail
    fail_doc = frappe.get_doc("Estore Order", fail_order)
    assert fail_doc.status == "Failed", fail_doc.status

    # Timeout also maps to R-E3
    to_order = f"SO-SMOKE-T-{tag}"
    to_ref = f"momo-to-{tag.lower()}"
    checkout(
        items=[{"standard_code": code, "qty": 1}],
        payment_method="momo",
        confirm=True,
        momo_reference=to_ref,
        order_id=to_order,
        user_email=email,
    )
    timed = momo_callback(reference_id=to_ref, status="TIMEOUT", external_id=to_order)
    assert timed.get("rule") == "R-E3", timed

    frappe.db.commit()

    return {
        "ok": True,
        "order_id": order_id,
        "payment_entry": order.payment_entry,
        "entitlements": ents,
        "download_token": toks[0].token,
        "fail_order": fail_order,
        "retry_url": fail.get("retry_url"),
        "rules": ["R-E1", "R-E2", "R-E3"],
    }
