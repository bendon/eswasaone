# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""E-store business rules R-E1…R-E3.

Triggered from:
  - hooks.doc_events on Payment Entry / Sales Order (R-E1 / R-E2)
  - eswasa_estore.api.momo_callback (R-E2 / R-E3)
  - eswasa_estore.api.checkout → create Estore Order (pending)

All side-effects are idempotent. Email stubs log when SMTP is missing.
"""

from __future__ import annotations

import json
import secrets
from typing import Any
from urllib.parse import quote

import frappe
from frappe.utils import add_days, cint, flt, now_datetime, nowdate

FEED_REALTIME_EVENT = "eswasa_feed"
DEFAULT_DOWNLOAD_BASE = "https://eswasaone.aiceafrica.com/api/estore/download"
DEFAULT_RETRY_BASE = "https://eswasaone.aiceafrica.com/estore/checkout"
DEFAULT_PRICE_SZL = 450.0
DEFAULT_SEAT_YEARS = 1
DOWNLOAD_TOKEN_DAYS = 7
MAX_DOWNLOADS = 3


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _log(title: str, detail: str = "") -> None:
    try:
        frappe.logger("eswasa_estore").info(f"{title}: {detail}")
    except Exception:
        pass
    try:
        frappe.log_error(message=detail or title, title=f"[estore] {title}"[:140])
    except Exception:
        pass


def _comment(doctype: str, name: str, content: str, comment_type: str = "Info") -> None:
    try:
        comment = frappe.get_doc(
            {
                "doctype": "Comment",
                "comment_type": comment_type,
                "reference_doctype": doctype,
                "reference_name": name,
                "content": content,
            }
        )
        comment.set_new_name()
        comment.db_insert()
    except Exception:
        pass


def publish_feed(
    *,
    event: str,
    subject: str,
    reference_doctype: str,
    reference_name: str,
    detail: str | None = None,
    status: str | None = None,
) -> None:
    payload = {
        "source": "eswasa_estore",
        "event": event,
        "subject": subject,
        "status": status,
        "reference_doctype": reference_doctype,
        "reference_name": reference_name,
        "detail": detail,
        "at": str(now_datetime()),
    }
    try:
        frappe.publish_realtime(FEED_REALTIME_EVENT, payload, after_commit=True)
    except Exception:
        pass

    try:
        if frappe.db.exists("DocType", "Notification Log"):
            nlog = frappe.get_doc(
                {
                    "doctype": "Notification Log",
                    "subject": f"[{event}] {subject}"[:140],
                    "email_content": detail or subject,
                    "document_type": reference_doctype,
                    "document_name": reference_name,
                    "type": "Alert",
                    "from_user": frappe.session.user or "Administrator",
                }
            )
            nlog.insert(ignore_permissions=True)
    except Exception:
        _log("feed_notification_log_failed", event)

    _comment(
        reference_doctype,
        reference_name,
        f"[feed:{event}] {subject}" + (f" — {detail}" if detail else ""),
    )


def _smtp_configured() -> bool:
    try:
        if frappe.conf.get("mail_server") or frappe.conf.get("mail_login"):
            return True
        if frappe.db.exists("DocType", "Email Account"):
            return bool(
                frappe.db.exists("Email Account", {"enable_outgoing": 1})
            )
    except Exception:
        pass
    return False


def notify_email(recipients: list[str], subject: str, message: str) -> bool:
    """Send email or stub to logger. Returns True if sendmail was attempted."""
    recipients = [r for r in recipients if r and "@" in str(r)]
    if not recipients:
        return False

    if not _smtp_configured():
        # TODO: wire real — SMTP / Email Account not configured on this host
        _log(
            "email_stub",
            f"to={recipients} subject={subject} body={message[:500]}",
        )
        return False

    try:
        frappe.sendmail(
            recipients=recipients,
            subject=subject,
            message=message,
            delayed=True,
            retry=0,
        )
        return True
    except Exception as exc:
        # TODO: wire real — fall back to logger on SMTP failure
        _log("email_failed", f"{subject}: {exc} | {message[:300]}")
        return False


def _download_base() -> str:
    configured = frappe.conf.get("eswasa_download_base")
    if configured:
        return str(configured)
    hostname = frappe.conf.get("hostname")
    if hostname:
        return f"https://{hostname}/api/estore/download"
    return DEFAULT_DOWNLOAD_BASE


def _retry_base() -> str:
    return frappe.conf.get("eswasa_estore_retry_base") or DEFAULT_RETRY_BASE


def _parse_items(raw: Any) -> list[dict[str, Any]]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [i for i in raw if isinstance(i, dict)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [i for i in parsed if isinstance(i, dict)]
        except json.JSONDecodeError:
            return []
    return []


def _order_amount(items: list[dict[str, Any]]) -> float:
    total = 0.0
    for item in items:
        code = item.get("standard_code") or item.get("code") or ""
        qty = cint(item.get("qty") or 1)
        price = flt(item.get("price_szl"))
        if not price and code and frappe.db.exists("Standard Product", code):
            price = flt(frappe.db.get_value("Standard Product", code, "price_szl") or 0)
        if not price:
            price = DEFAULT_PRICE_SZL
        total += price * max(qty, 1)
    return total


def _ensure_customer(name: str, email: str | None = None) -> str | None:
    if not frappe.db.exists("DocType", "Customer"):
        return None
    if frappe.db.exists("Customer", name):
        return name
    try:
        group = (
            "Commercial"
            if frappe.db.exists("Customer Group", "Commercial")
            else (
                "All Customer Groups"
                if frappe.db.exists("Customer Group", "All Customer Groups")
                else None
            )
        )
        territory = (
            "Eswatini"
            if frappe.db.exists("Territory", "Eswatini")
            else (
                "All Territories"
                if frappe.db.exists("Territory", "All Territories")
                else None
            )
        )
        cust = frappe.get_doc(
            {
                "doctype": "Customer",
                "customer_name": name,
                "customer_type": "Individual",
                "customer_group": group,
                "territory": territory,
            }
        )
        if email:
            cust.email_id = email
        cust.insert(ignore_permissions=True)
        return cust.name
    except Exception as exc:
        _log("ensure_customer_failed", f"{name}: {exc}")
        return None


def _default_company() -> str | None:
    return frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value(
        "Company", {}, "name"
    )


def _mode_of_payment() -> str | None:
    for candidate in ("MoMo", "Mobile Money", "Cash", "Wire Transfer"):
        if frappe.db.exists("Mode of Payment", candidate):
            return candidate
    # Create lightweight MoMo mode if table empty
    try:
        if frappe.db.exists("DocType", "Mode of Payment"):
            mop = frappe.get_doc(
                {
                    "doctype": "Mode of Payment",
                    "mode_of_payment": "MoMo",
                    "type": "Bank",
                    "enabled": 1,
                }
            )
            mop.insert(ignore_permissions=True)
            return mop.name
    except Exception as exc:
        _log("mode_of_payment_create_failed", str(exc))
    return None


def _paid_from_account(company: str) -> str | None:
    """Receivable (Debtors) account — Payment Entry Receive.paid_from."""
    return frappe.db.get_value(
        "Account",
        {"company": company, "account_type": "Receivable", "is_group": 0},
        "name",
    )


def _paid_to_account(company: str) -> str | None:
    """Cash/Bank account — Payment Entry Receive.paid_to."""
    return (
        frappe.db.get_value(
            "Account",
            {"company": company, "account_type": "Bank", "is_group": 0},
            "name",
        )
        or frappe.db.get_value(
            "Account",
            {"company": company, "account_type": "Cash", "is_group": 0},
            "name",
        )
    )


# ---------------------------------------------------------------------------
# Order create (checkout)
# ---------------------------------------------------------------------------


def create_estore_order(
    *,
    items: list[dict[str, Any]],
    payment_method: str = "momo",
    momo_reference: str | None = None,
    order_id: str | None = None,
    customer: str | None = None,
    user_email: str | None = None,
    amount_szl: float | None = None,
) -> dict[str, Any]:
    """Persist Estore Order for checkout. Idempotent on order_id / momo_reference."""
    items = items or []
    order_id = (order_id or "").strip() or f"SO-{frappe.generate_hash(length=8).upper()}"
    payment_method = (payment_method or "momo").lower()
    if payment_method not in ("momo", "invoice"):
        payment_method = "momo"

    user_email = user_email or frappe.db.get_value("User", frappe.session.user, "email")
    if not user_email or "@" not in str(user_email):
        user_email = frappe.session.user if "@" in (frappe.session.user or "") else None
    customer = customer or (frappe.session.user if frappe.session.user != "Guest" else "Guest Buyer")

    if momo_reference and frappe.db.exists("Estore Order", {"momo_reference": momo_reference}):
        existing = frappe.db.get_value(
            "Estore Order",
            {"momo_reference": momo_reference},
            ["name", "order_id", "status", "payment_ref", "momo_reference"],
            as_dict=True,
        )
        return {
            "order_id": existing.order_id,
            "status": existing.status,
            "payment_ref": existing.payment_ref,
            "momo_reference": existing.momo_reference,
        }

    if frappe.db.exists("Estore Order", order_id):
        row = frappe.get_doc("Estore Order", order_id)
        return {
            "order_id": row.order_id,
            "status": row.status,
            "payment_ref": row.payment_ref,
            "momo_reference": row.momo_reference,
        }

    amount = flt(amount_szl) if amount_szl is not None else _order_amount(items)
    if payment_method == "momo" and not momo_reference:
        momo_reference = str(frappe.generate_hash(length=16))

    payment_ref = f"PAY-{order_id}"
    status = "Pending Payment" if payment_method == "momo" else "Invoiced"
    retry_url = f"{_retry_base()}?order={quote(order_id)}"

    doc = frappe.get_doc(
        {
            "doctype": "Estore Order",
            "order_id": order_id,
            "customer": customer,
            "user_email": user_email,
            "status": status,
            "payment_method": payment_method,
            "momo_reference": momo_reference,
            "payment_ref": payment_ref,
            "amount_szl": amount,
            "currency": "SZL",
            "items_json": json.dumps(items),
            "fulfilment_status": "Pending",
            "retry_url": retry_url,
        }
    )
    doc.insert(ignore_permissions=True)

    # Invoice path: mark paid + fulfil immediately (no MoMo wait)
    if payment_method == "invoice":
        re2_mark_paid_and_fulfil(order_id=order_id, source="invoice_checkout")

    return {
        "order_id": order_id,
        "status": "pending_payment" if status == "Pending Payment" else "invoiced",
        "payment_ref": payment_ref,
        "momo_reference": momo_reference,
    }


# ---------------------------------------------------------------------------
# R-E1 — fulfilment
# ---------------------------------------------------------------------------


def re1_fulfil_purchase(
    order_name: str | None = None,
    *,
    order_id: str | None = None,
) -> dict[str, Any]:
    """Standard purchase paid → License Entitlement + watermarked Download Token + email."""
    if not order_name and order_id:
        order_name = order_id if frappe.db.exists("Estore Order", order_id) else None
    if not order_name or not frappe.db.exists("Estore Order", order_name):
        return {"ok": False, "reason": "order_not_found"}

    order = frappe.get_doc("Estore Order", order_name)
    if order.fulfilment_status == "Fulfilled":
        return {"ok": True, "idempotent": True, "order_id": order.order_id}

    items = _parse_items(order.items_json)
    if not items:
        order.db_set("fulfilment_status", "Skipped", update_modified=False)
        _comment(order.doctype, order.name, "[R-E1] No line items — fulfilment skipped")
        return {"ok": False, "reason": "no_items"}

    entitlements: list[str] = []
    tokens: list[str] = []
    download_links: list[str] = []

    for item in items:
        code = (item.get("standard_code") or item.get("code") or "").strip()
        qty = max(cint(item.get("qty") or 1), 1)
        if not code:
            continue

        product = _ensure_standard_product(code, item)
        if not product:
            _log("re1_product_missing", code)
            continue

        for seat_idx in range(qty):
            ent_id = f"{order.order_id}-{code}-{seat_idx + 1}".replace(" ", "")
            if len(ent_id) > 140:
                ent_id = f"{order.order_id}-{frappe.generate_hash(length=8)}"

            if frappe.db.exists("License Entitlement", ent_id):
                entitlements.append(ent_id)
            else:
                ent = frappe.get_doc(
                    {
                        "doctype": "License Entitlement",
                        "entitlement_id": ent_id,
                        "customer": order.customer or "Buyer",
                        "user_email": order.user_email,
                        "standard_product": product,
                        "standard_code": code,
                        "seats": 1,
                        "valid_from": nowdate(),
                        "valid_to": add_days(nowdate(), 365 * DEFAULT_SEAT_YEARS),
                        "sales_order": order.order_id,
                        "status": "Active",
                    }
                )
                ent.insert(ignore_permissions=True)
                entitlements.append(ent.name)

            token_name, link = _issue_download_token(
                entitlement=entitlements[-1],
                standard_product=product,
                order=order,
                watermark_label=_watermark_label(order, code),
            )
            if token_name:
                tokens.append(token_name)
            if link:
                download_links.append(link)

    if entitlements:
        order.db_set("fulfilment_status", "Fulfilled", update_modified=False)
    else:
        order.db_set("fulfilment_status", "Partial", update_modified=False)

    # Email download links — never include licensed full text
    links_block = "\n".join(f"- {u}" for u in download_links) or "(no download links)"
    msg = (
        f"<p>Your EswasaOne standards purchase <b>{order.order_id}</b> is ready.</p>"
        f"<p>Licensed download links (watermarked; personal use only — no public redistribution):</p>"
        f"<pre>{links_block}</pre>"
        f"<p>Full standard text is not included in this email. Use the secure link to download.</p>"
    )
    notify_email(
        [order.user_email] if order.user_email else [],
        f"EswasaOne download ready — {order.order_id}",
        msg,
    )

    publish_feed(
        event="estore.fulfilled",
        subject=f"Order {order.order_id} fulfilled",
        reference_doctype="Estore Order",
        reference_name=order.name,
        detail=f"entitlements={len(entitlements)} tokens={len(tokens)}",
        status="Fulfilled",
    )
    _comment(
        order.doctype,
        order.name,
        f"[R-E1] Licence Entitlement×{len(entitlements)} + Download Token×{len(tokens)}",
    )

    return {
        "ok": True,
        "order_id": order.order_id,
        "entitlements": entitlements,
        "tokens": tokens,
        "download_links": download_links,
    }


def _ensure_standard_product(code: str, item: dict[str, Any]) -> str | None:
    if frappe.db.exists("Standard Product", code):
        return code
    # Soft-create catalogue stub so fulfilment is not blocked
    try:
        doc = frappe.get_doc(
            {
                "doctype": "Standard Product",
                "standard_code": code,
                "title": item.get("title") or code,
                "price_szl": flt(item.get("price_szl") or DEFAULT_PRICE_SZL),
                "sector": item.get("sector") or "General",
                "rights": "licensed",
                "is_published": 1,
                "description": f"<p>Catalogue stub for {code} — licensed; no full text.</p>",
            }
        )
        doc.insert(ignore_permissions=True)
        return doc.name
    except Exception as exc:
        _log("ensure_standard_product_failed", f"{code}: {exc}")
        return None


def _watermark_label(order, code: str) -> str:
    who = order.user_email or order.customer or "licensed-user"
    return f"ESWASA licensed | {who} | {order.order_id} | {code} | {nowdate()}"


def _issue_download_token(
    *,
    entitlement: str,
    standard_product: str,
    order,
    watermark_label: str,
) -> tuple[str | None, str | None]:
    """Create Active Download Token. Watermark is metadata (PDF overlay = TODO: wire real)."""
    existing = frappe.db.get_value(
        "Download Token",
        {"entitlement": entitlement, "status": "Active"},
        "name",
    )
    if existing:
        link = f"{_download_base()}?token={quote(existing)}"
        return existing, link

    token = secrets.token_urlsafe(24)
    try:
        tok = frappe.get_doc(
            {
                "doctype": "Download Token",
                "token": token,
                "entitlement": entitlement,
                "standard_product": standard_product,
                "expires_at": add_days(now_datetime(), DOWNLOAD_TOKEN_DAYS),
                "max_downloads": MAX_DOWNLOADS,
                "download_count": 0,
                "status": "Active",
            }
        )
        tok.insert(ignore_permissions=True)
        # Persist watermark as Comment (no DocType field for watermark text)
        _comment(
            "Download Token",
            tok.name,
            f"[R-E1 watermark] {watermark_label}",
        )
        # Rights note on entitlement
        rights = (
            frappe.db.get_value("Standard Product", standard_product, "rights") or "licensed"
        )
        _comment(
            "License Entitlement",
            entitlement,
            f"[R-E1] rights={rights}; watermarked download token issued for order {order.order_id}",
        )
        link = f"{_download_base()}?token={quote(token)}"
        return tok.name, link
    except Exception as exc:
        _log("download_token_failed", f"{entitlement}: {exc}")
        return None, None


# ---------------------------------------------------------------------------
# R-E2 — MoMo success
# ---------------------------------------------------------------------------


def re2_momo_success(
    *,
    reference_id: str | None = None,
    external_id: str | None = None,
    amount: str | float | None = None,
    currency: str | None = None,
    financial_transaction_id: str | None = None,
    raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """MoMo callback success → Payment Entry; mark order paid; fire fulfilment."""
    order = _find_order(reference_id=reference_id, external_id=external_id)
    if not order:
        _log(
            "re2_order_not_found",
            f"ref={reference_id} external={external_id}",
        )
        return {"ok": False, "reason": "order_not_found", "momo_reference": reference_id}

    return re2_mark_paid_and_fulfil(
        order_id=order.name,
        source="momo_callback",
        amount=amount,
        currency=currency,
        financial_transaction_id=financial_transaction_id,
        momo_reference=reference_id or order.momo_reference,
        raw=raw,
    )


def re2_mark_paid_and_fulfil(
    *,
    order_id: str,
    source: str = "manual",
    amount: str | float | None = None,
    currency: str | None = None,
    financial_transaction_id: str | None = None,
    momo_reference: str | None = None,
    raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not frappe.db.exists("Estore Order", order_id):
        return {"ok": False, "reason": "order_not_found"}

    order = frappe.get_doc("Estore Order", order_id)
    already_paid = order.status == "Paid"

    if not already_paid:
        pe_name = _create_payment_entry(
            order,
            amount=amount,
            currency=currency,
            financial_transaction_id=financial_transaction_id,
            momo_reference=momo_reference or order.momo_reference,
        )
        updates = {
            "status": "Paid",
            "failure_reason": "",
        }
        if pe_name:
            updates["payment_entry"] = pe_name
        if momo_reference and not order.momo_reference:
            updates["momo_reference"] = momo_reference
        for field, value in updates.items():
            order.db_set(field, value, update_modified=False)
        order.reload()

        publish_feed(
            event="payment.settled",
            subject=f"MoMo paid — {order.order_id}",
            reference_doctype="Estore Order",
            reference_name=order.name,
            detail=f"source={source} pe={order.payment_entry or 'stub'}",
            status="Paid",
        )
        _comment(
            order.doctype,
            order.name,
            f"[R-E2] Paid via {source}; Payment Entry={order.payment_entry or 'stub'}",
        )

    # Matching fulfilment: standards purchase → R-E1; other kinds via purpose flag
    purpose = _order_purpose(order)
    fulfil_result: dict[str, Any]
    if purpose in ("standard", "estore", "mixed", None):
        fulfil_result = re1_fulfil_purchase(order.name)
    elif purpose == "cert_fee":
        fulfil_result = _fulfil_cert_fee(order)
    elif purpose == "enrolment":
        fulfil_result = _fulfil_enrolment(order)
    else:
        fulfil_result = re1_fulfil_purchase(order.name)

    return {
        "ok": True,
        "order_id": order.order_id,
        "status": "Paid",
        "payment_entry": order.payment_entry,
        "fulfilment": fulfil_result,
        "idempotent": already_paid,
        "raw": raw or {},
    }


def _order_purpose(order) -> str | None:
    items = _parse_items(order.items_json)
    if not items:
        return None
    purposes = {(i.get("purpose") or "standard").lower() for i in items}
    if purposes == {"cert_fee"}:
        return "cert_fee"
    if purposes == {"enrolment"}:
        return "enrolment"
    if "standard" in purposes or "estore" in purposes:
        return "standard"
    return "mixed"


def _fulfil_cert_fee(order) -> dict[str, Any]:
    """Cert fee payment — leave marking to certification; comment + feed only."""
    # TODO: wire real — notify eswasa_certification when fee Sales Invoice settles
    _comment(order.doctype, order.name, "[R-E2] cert_fee fulfilment stub — invoice settle")
    order.db_set("fulfilment_status", "Fulfilled", update_modified=False)
    return {"ok": True, "kind": "cert_fee", "stub": True}


def _fulfil_enrolment(order) -> dict[str, Any]:
    """Training enrolment payment stub."""
    # TODO: wire real — LMS enrolment on paid training fee
    _comment(order.doctype, order.name, "[R-E2] enrolment fulfilment stub — LMS enrol")
    order.db_set("fulfilment_status", "Fulfilled", update_modified=False)
    return {"ok": True, "kind": "enrolment", "stub": True}


def _create_payment_entry(
    order,
    *,
    amount: str | float | None = None,
    currency: str | None = None,
    financial_transaction_id: str | None = None,
    momo_reference: str | None = None,
) -> str | None:
    if order.payment_entry and frappe.db.exists("Payment Entry", order.payment_entry):
        return order.payment_entry

    if not frappe.db.exists("DocType", "Payment Entry"):
        _comment(order.doctype, order.name, "[R-E2] Payment Entry DocType missing — stub")
        return None

    company = _default_company()
    if not company:
        _log("re2_no_company", order.order_id)
        return None

    paid_amount = flt(amount) if amount not in (None, "") else flt(order.amount_szl)
    if paid_amount <= 0:
        paid_amount = DEFAULT_PRICE_SZL

    customer_name = order.customer or "EswasaOne Buyer"
    party = _ensure_customer(customer_name, order.user_email)
    if not party:
        _comment(order.doctype, order.name, "[R-E2] Customer missing — Payment Entry stubbed")
        return None

    mop = _mode_of_payment()
    paid_from = _paid_from_account(company)
    paid_to = _paid_to_account(company)
    if not mop or not paid_from or not paid_to:
        _comment(
            order.doctype,
            order.name,
            f"[R-E2] MoP/account missing (mop={mop}, from={paid_from}, to={paid_to}) — PE stubbed",
        )
        return None

    # Idempotent by reference_no
    ref_no = momo_reference or order.momo_reference or order.payment_ref or order.order_id
    existing = frappe.db.get_value(
        "Payment Entry",
        {"reference_no": ref_no, "docstatus": ("<", 2)},
        "name",
    )
    if existing:
        return existing

    company_currency = frappe.db.get_value("Company", company, "default_currency") or "SZL"
    pay_currency = currency or order.currency or company_currency

    try:
        pe = frappe.get_doc(
            {
                "doctype": "Payment Entry",
                "payment_type": "Receive",
                "party_type": "Customer",
                "party": party,
                "company": company,
                "posting_date": nowdate(),
                "mode_of_payment": mop,
                "paid_from": paid_from,
                "paid_to": paid_to,
                "paid_from_account_currency": company_currency,
                "paid_to_account_currency": company_currency,
                "paid_amount": paid_amount,
                "received_amount": paid_amount,
                "source_exchange_rate": 1,
                "target_exchange_rate": 1,
                "reference_no": ref_no,
                "reference_date": nowdate(),
                "remarks": (
                    f"R-E2 MoMo settlement for {order.order_id}"
                    + (f" txn={financial_transaction_id}" if financial_transaction_id else "")
                ),
            }
        )
        if pay_currency:
            pe.paid_to_account_currency = pay_currency
        pe.insert(ignore_permissions=True)
        try:
            pe.submit()
        except Exception:
            pass
        return pe.name
    except Exception as exc:
        _log("payment_entry_failed", f"{order.order_id}: {exc}")
        _comment(order.doctype, order.name, f"[R-E2] Payment Entry failed: {exc}")
        return None


def _find_order(
    *,
    reference_id: str | None = None,
    external_id: str | None = None,
):
    if reference_id and frappe.db.exists("Estore Order", {"momo_reference": reference_id}):
        name = frappe.db.get_value("Estore Order", {"momo_reference": reference_id}, "name")
        return frappe.get_doc("Estore Order", name)
    if external_id and frappe.db.exists("Estore Order", external_id):
        return frappe.get_doc("Estore Order", external_id)
    if external_id and frappe.db.exists("Estore Order", {"order_id": external_id}):
        name = frappe.db.get_value("Estore Order", {"order_id": external_id}, "name")
        return frappe.get_doc("Estore Order", name)
    return None


# ---------------------------------------------------------------------------
# R-E3 — MoMo fail / timeout
# ---------------------------------------------------------------------------


def re3_momo_fail(
    *,
    reference_id: str | None = None,
    external_id: str | None = None,
    reason: str | None = None,
    status: str | None = None,
    raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """MoMo fail/timeout → notify user; offer retry."""
    order = _find_order(reference_id=reference_id, external_id=external_id)
    if not order:
        _log("re3_order_not_found", f"ref={reference_id} external={external_id}")
        return {"ok": False, "reason": "order_not_found", "momo_reference": reference_id}

    if order.status == "Paid":
        return {"ok": True, "idempotent": True, "order_id": order.order_id, "status": "Paid"}

    fail_reason = reason or status or "FAILED"
    retry_url = order.retry_url or f"{_retry_base()}?order={quote(order.order_id)}"
    order.db_set("status", "Failed", update_modified=False)
    order.db_set("failure_reason", fail_reason, update_modified=False)
    order.db_set("retry_url", retry_url, update_modified=False)

    msg = (
        f"<p>Your EswasaOne payment for order <b>{order.order_id}</b> did not complete "
        f"({fail_reason}).</p>"
        f"<p>You can retry here: <a href=\"{retry_url}\">{retry_url}</a></p>"
    )
    notify_email(
        [order.user_email] if order.user_email else [],
        f"EswasaOne payment failed — retry {order.order_id}",
        msg,
    )
    # TODO: wire real — SMS / WhatsApp via Core messaging adapter
    _log(
        "re3_sms_stub",
        f"order={order.order_id} retry={retry_url} reason={fail_reason}",
    )

    publish_feed(
        event="payment.failed",
        subject=f"MoMo failed — {order.order_id}",
        reference_doctype="Estore Order",
        reference_name=order.name,
        detail=fail_reason,
        status="Failed",
    )
    _comment(
        order.doctype,
        order.name,
        f"[R-E3] MoMo {fail_reason}; retry offered at {retry_url}",
    )

    return {
        "ok": True,
        "order_id": order.order_id,
        "status": "Failed",
        "retry_url": retry_url,
        "reason": fail_reason,
        "raw": raw or {},
    }


# ---------------------------------------------------------------------------
# Doc event hooks
# ---------------------------------------------------------------------------


def on_payment_entry_submit(doc, method: str | None = None) -> None:
    """R-E2 / R-F4 adjacent: Payment Entry submit with MoMo/estore reference → fulfil."""
    ref = (doc.get("reference_no") or "").strip()
    remarks = doc.get("remarks") or ""
    if not ref and "R-E2" not in remarks and "estore" not in remarks.lower():
        return

    order = None
    if ref:
        order = _find_order(reference_id=ref, external_id=ref)
    if not order and "SO-" in remarks:
        # best-effort extract order id
        for part in remarks.replace("/", " ").split():
            if part.startswith("SO-") and frappe.db.exists("Estore Order", part):
                order = frappe.get_doc("Estore Order", part)
                break
    if not order:
        return

    if order.status != "Paid":
        order.db_set("status", "Paid", update_modified=False)
        order.db_set("payment_entry", doc.name, update_modified=False)
    if order.fulfilment_status != "Fulfilled":
        re1_fulfil_purchase(order.name)


def on_sales_order_update(doc, method: str | None = None) -> None:
    """When ERPNext Sales Order hits Paid / Completed, fire R-E1 if linked Estore Order."""
    status = (doc.get("status") or "").lower()
    if status not in ("paid", "completed", "to bill", "to deliver"):
        # Only fulfil when clearly paid
        if cint(doc.get("per_billed") or 0) < 100 and status != "closed":
            return
        if "paid" not in status and cint(doc.get("advance_paid") or 0) <= 0:
            return

    order_name = None
    if frappe.db.exists("Estore Order", doc.name):
        order_name = doc.name
    elif frappe.db.exists("Estore Order", {"sales_order": doc.name}):
        order_name = frappe.db.get_value("Estore Order", {"sales_order": doc.name}, "name")
    if not order_name:
        return

    order = frappe.get_doc("Estore Order", order_name)
    if order.status != "Paid":
        order.db_set("status", "Paid", update_modified=False)
        order.db_set("sales_order", doc.name, update_modified=False)
    if order.fulfilment_status != "Fulfilled":
        re1_fulfil_purchase(order.name)
