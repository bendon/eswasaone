"""Metrology business rules R-M1…R-M4.

Triggered from Document controllers / hooks.doc_events (R-M1, M2, M4)
and scheduler_events (R-M3). All side-effects are idempotent.
In-app feed stubs (Comment / Notification Log / realtime) are OK if email missing.
"""

from __future__ import annotations

import secrets
from typing import Any

import frappe
from frappe.utils import add_days, add_months, cint, flt, getdate, now_datetime, nowdate, today

METRO_FEE_ITEM = "ESWASA-METRO-FEE"
FEED_REALTIME_EVENT = "eswasa_feed"
DEFAULT_TAT_DAYS = 7
DEFAULT_FEE = 1500.0
ROLE_METROLOGIST = "Eswasa Metrology Officer"
ROLE_MANAGER = "Eswasa Metrology Manager"
ROLE_REVIEWER = "Eswasa Metrology Reviewer"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _log(title: str, detail: str = "") -> None:
    try:
        frappe.logger("eswasa_metrology").info(f"{title}: {detail}")
    except Exception:
        pass
    try:
        frappe.log_error(message=detail or title, title=f"[metro] {title}"[:140])
    except Exception:
        pass


def _comment(doctype: str, name: str, content: str, comment_type: str = "Info") -> None:
    """Best-effort Comment (db_insert avoids broken global on_change hooks)."""
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
    """Feed stub Core can consume: realtime + Notification Log + Comment."""
    payload = {
        "source": "eswasa_metrology",
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


def _assign_role_todo(
    *,
    doctype: str,
    name: str,
    role: str,
    description: str,
) -> None:
    existing = frappe.db.exists(
        "ToDo",
        {
            "reference_type": doctype,
            "reference_name": name,
            "role": role,
            "status": "Open",
        },
    )
    if existing:
        return
    try:
        todo = frappe.get_doc(
            {
                "doctype": "ToDo",
                "description": description,
                "reference_type": doctype,
                "reference_name": name,
                "role": role,
                "assigned_by": frappe.session.user or "Administrator",
                "status": "Open",
                "priority": "Medium",
            }
        )
        todo.insert(ignore_permissions=True)
    except Exception:
        _log("assign_todo_failed", f"{doctype} {name} → {role}")


def _notify_email(recipients: list[str], subject: str, message: str) -> None:
    recipients = [r for r in recipients if r and "@" in r]
    if not recipients:
        return
    try:
        frappe.sendmail(
            recipients=recipients,
            subject=subject,
            message=message,
            delayed=True,
            retry=0,
        )
    except Exception:
        _log("email_failed", subject)


def _client_email_for_job(job) -> str | None:
    email = job.get("client_email")
    if email:
        return email
    instrument = job.get("instrument")
    if instrument:
        return frappe.db.get_value("Instrument", instrument, "owner_email")
    return None


def _pick_metrologist() -> str | None:
    """First enabled User with Metrology Officer role (pool assign)."""
    rows = frappe.get_all(
        "Has Role",
        filters={"role": ROLE_METROLOGIST, "parenttype": "User"},
        fields=["parent"],
        limit_page_length=20,
    )
    for row in rows:
        user = row.parent
        if user in ("Administrator", "Guest"):
            continue
        if cint(frappe.db.get_value("User", user, "enabled")):
            return user
    return None


# ---------------------------------------------------------------------------
# Selling / invoice helpers (cloned from certification R-C3 style)
# ---------------------------------------------------------------------------


def _ensure_selling_masters() -> None:
    try:
        if not frappe.db.exists("UOM", "Nos"):
            frappe.get_doc({"doctype": "UOM", "uom_name": "Nos"}).insert(
                ignore_permissions=True
            )
        if not frappe.db.exists("Item Group", "All Item Groups"):
            frappe.get_doc(
                {
                    "doctype": "Item Group",
                    "item_group_name": "All Item Groups",
                    "is_group": 1,
                }
            ).insert(ignore_permissions=True)
        if not frappe.db.exists("Item Group", "Services"):
            frappe.get_doc(
                {
                    "doctype": "Item Group",
                    "item_group_name": "Services",
                    "parent_item_group": "All Item Groups",
                    "is_group": 0,
                }
            ).insert(ignore_permissions=True)
        if frappe.db.exists("DocType", "Customer Group") and not frappe.db.exists(
            "Customer Group", "All Customer Groups"
        ):
            frappe.get_doc(
                {
                    "doctype": "Customer Group",
                    "customer_group_name": "All Customer Groups",
                    "is_group": 1,
                }
            ).insert(ignore_permissions=True)
        if frappe.db.exists("DocType", "Customer Group") and not frappe.db.exists(
            "Customer Group", "Commercial"
        ):
            frappe.get_doc(
                {
                    "doctype": "Customer Group",
                    "customer_group_name": "Commercial",
                    "parent_customer_group": "All Customer Groups",
                    "is_group": 0,
                }
            ).insert(ignore_permissions=True)
        if frappe.db.exists("DocType", "Territory") and not frappe.db.exists(
            "Territory", "All Territories"
        ):
            frappe.get_doc(
                {
                    "doctype": "Territory",
                    "territory_name": "All Territories",
                    "is_group": 1,
                }
            ).insert(ignore_permissions=True)
        if frappe.db.exists("DocType", "Territory") and not frappe.db.exists(
            "Territory", "Eswatini"
        ):
            frappe.get_doc(
                {
                    "doctype": "Territory",
                    "territory_name": "Eswatini",
                    "parent_territory": "All Territories",
                    "is_group": 0,
                }
            ).insert(ignore_permissions=True)

        if frappe.db.exists("DocType", "Fiscal Year"):
            today_d = getdate(today())
            year_name = str(today_d.year)
            if not frappe.db.exists("Fiscal Year", year_name):
                overlapping = frappe.db.sql(
                    """
                    select name from `tabFiscal Year`
                    where %s between year_start_date and year_end_date
                    limit 1
                    """,
                    (today_d,),
                )
                if not overlapping:
                    fy = frappe.get_doc(
                        {
                            "doctype": "Fiscal Year",
                            "year": year_name,
                            "year_start_date": f"{today_d.year}-01-01",
                            "year_end_date": f"{today_d.year}-12-31",
                        }
                    )
                    fy.insert(ignore_permissions=True)
                    try:
                        fy.set_as_default()
                    except Exception:
                        pass

        if frappe.db.exists("DocType", "Price List") and not frappe.db.exists(
            "Price List", "Standard Selling"
        ):
            company = frappe.db.get_value("Company", {}, "name")
            currency = (
                frappe.db.get_value("Company", company, "default_currency") if company else "SZL"
            ) or "SZL"
            frappe.get_doc(
                {
                    "doctype": "Price List",
                    "price_list_name": "Standard Selling",
                    "selling": 1,
                    "buying": 0,
                    "currency": currency,
                    "enabled": 1,
                }
            ).insert(ignore_permissions=True)
    except Exception as exc:
        _log("ensure_selling_masters_failed", str(exc))


def _default_item_group() -> str:
    _ensure_selling_masters()
    for name in ("Services", "All Item Groups", "Products"):
        if frappe.db.exists("Item Group", name):
            return name
    row = frappe.db.get_value("Item Group", {}, "name")
    return row or "All Item Groups"


def _ensure_metro_fee_item() -> str:
    _ensure_selling_masters()
    if frappe.db.exists("Item", METRO_FEE_ITEM):
        return METRO_FEE_ITEM
    if not frappe.db.exists("DocType", "Item"):
        return METRO_FEE_ITEM
    try:
        item = frappe.get_doc(
            {
                "doctype": "Item",
                "item_code": METRO_FEE_ITEM,
                "item_name": "Metrology Calibration Fee",
                "item_group": _default_item_group(),
                "stock_uom": "Nos",
                "is_stock_item": 0,
                "is_sales_item": 1,
                "include_item_in_manufacturing": 0,
                "description": "ESWASA metrology calibration fee (R-M1/R-M2).",
            }
        )
        item.insert(ignore_permissions=True)
    except Exception as exc:
        _log("ensure_metro_fee_item_failed", f"{METRO_FEE_ITEM}: {exc}")
    return METRO_FEE_ITEM


def _ensure_customer(holder_name: str, email: str | None = None) -> str | None:
    _ensure_selling_masters()
    if not frappe.db.exists("DocType", "Customer"):
        return None
    existing = frappe.db.get_value("Customer", {"customer_name": holder_name}, "name")
    if existing:
        return existing
    try:
        cust = frappe.get_doc(
            {
                "doctype": "Customer",
                "customer_name": holder_name,
                "customer_type": "Company",
                "customer_group": "Commercial"
                if frappe.db.exists("Customer Group", "Commercial")
                else (
                    "All Customer Groups"
                    if frappe.db.exists("Customer Group", "All Customer Groups")
                    else None
                ),
                "territory": "Eswatini"
                if frappe.db.exists("Territory", "Eswatini")
                else (
                    "All Territories"
                    if frappe.db.exists("Territory", "All Territories")
                    else None
                ),
            }
        )
        if email:
            cust.email_id = email
        cust.insert(ignore_permissions=True)
        return cust.name
    except Exception:
        _log("ensure_customer_failed", holder_name)
        return None


def _income_account(company: str) -> str | None:
    return frappe.db.get_value(
        "Account",
        {"company": company, "account_name": "Sales", "is_group": 0},
        "name",
    ) or frappe.db.get_value(
        "Account",
        {"company": company, "root_type": "Income", "is_group": 0},
        "name",
    )


def _job_fee(job) -> float:
    fee = 0.0
    if job.get("test_method"):
        fee = flt(frappe.db.get_value("Test Method", job.test_method, "calibration_fee") or 0)
    if fee <= 0:
        fee = DEFAULT_FEE
    return fee


def _create_draft_invoice(job) -> str | None:
    """R-M1: draft Sales Invoice for calibration fee. Idempotent."""
    if not frappe.db.exists("DocType", "Sales Invoice"):
        _comment(job.doctype, job.name, "[R-M1] Sales Invoice DocType missing — stub skipped")
        return None
    if job.get("sales_invoice") and frappe.db.exists("Sales Invoice", job.sales_invoice):
        return job.sales_invoice

    existing = frappe.db.get_value(
        "Sales Invoice",
        {"remarks": ("like", f"%{job.name}%"), "docstatus": ("<", 2)},
        "name",
    )
    if existing:
        return existing

    company = frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value(
        "Company", {}, "name"
    )
    if not company:
        _log("rm1_no_company", job.name)
        return None

    owner = None
    if job.instrument:
        owner = frappe.db.get_value("Instrument", job.instrument, "owner_customer")
    customer_name = owner or f"Metrology Client ({job.name})"
    email = _client_email_for_job(job)
    customer = _ensure_customer(customer_name, email)
    if not customer:
        return None

    item_code = _ensure_metro_fee_item()
    if not frappe.db.exists("Item", item_code):
        _log("rm1_item_missing", item_code)
        return None

    income = _income_account(company)
    currency = frappe.db.get_value("Company", company, "default_currency") or "SZL"
    price_list = (
        "Standard Selling"
        if frappe.db.exists("Price List", "Standard Selling")
        else frappe.db.get_value("Price List", {"selling": 1}, "name")
    )
    fee = _job_fee(job)
    try:
        item_row: dict[str, Any] = {
            "item_code": item_code,
            "qty": 1,
            "rate": fee,
            "description": f"Calibration fee — {job.job_code or job.name}",
        }
        if income:
            item_row["income_account"] = income
        payload: dict[str, Any] = {
            "doctype": "Sales Invoice",
            "company": company,
            "customer": customer,
            "currency": currency,
            "posting_date": nowdate(),
            "due_date": add_days(nowdate(), 30),
            "remarks": f"R-M1 draft calibration fee for {job.name} / {job.job_code}",
            "items": [item_row],
        }
        if price_list:
            payload["selling_price_list"] = price_list
            payload["price_list_currency"] = currency
            payload["plc_conversion_rate"] = 1
        sinv = frappe.get_doc(payload)
        sinv.insert(ignore_permissions=True)
        # Leave draft — R-M2 finalises
        return sinv.name
    except Exception as exc:
        _log("rm1_sales_invoice_failed", f"{job.name}: {exc}")
        _comment(job.doctype, job.name, f"[R-M1] Sales Invoice failed: {exc}")
        return None


def _finalise_invoice(job) -> str | None:
    """R-M2: submit draft invoice linked to job (or create+submit)."""
    invoice_name = job.get("sales_invoice")
    if not invoice_name:
        invoice_name = _create_draft_invoice(job)
    if not invoice_name or not frappe.db.exists("Sales Invoice", invoice_name):
        return invoice_name
    try:
        sinv = frappe.get_doc("Sales Invoice", invoice_name)
        if cint(sinv.docstatus) == 0:
            sinv.flags.ignore_permissions = True
            sinv.submit()
        return sinv.name
    except Exception as exc:
        _log("rm2_finalise_invoice_failed", f"{job.name}: {exc}")
        _comment(job.doctype, job.name, f"[R-M2] Finalise invoice failed: {exc}")
        return invoice_name


# ---------------------------------------------------------------------------
# R-M1 — Calibration Job on_submit (Received)
# ---------------------------------------------------------------------------


def rm1_job_received(doc, method: str | None = None) -> dict[str, Any]:
    """Assign Metrologist; due = method TAT; draft invoice. Idempotent."""
    if getattr(doc, "flags", None) and doc.flags.get("rm1_done"):
        return {"skipped": True}

    # Ensure Received state
    if not doc.get("workflow_state") or doc.workflow_state in (None, "", "Draft"):
        frappe.db.set_value(
            doc.doctype, doc.name, "workflow_state", "Received", update_modified=False
        )
        doc.workflow_state = "Received"

    # Due = method TAT
    tat = DEFAULT_TAT_DAYS
    if doc.test_method:
        tat = cint(frappe.db.get_value("Test Method", doc.test_method, "tat_days") or DEFAULT_TAT_DAYS)
    if not tat:
        tat = DEFAULT_TAT_DAYS
    anchor = getdate(doc.received_on or nowdate())
    due = add_days(anchor, tat)
    updates: dict[str, Any] = {}
    if not doc.received_on:
        updates["received_on"] = now_datetime()
        doc.received_on = updates["received_on"]
    if not doc.due_on or getdate(doc.due_on) != due:
        updates["due_on"] = due
        doc.due_on = due

    # Assign Metrologist
    metrologist = doc.get("assigned_to") or _pick_metrologist()
    if metrologist and not doc.get("assigned_to"):
        updates["assigned_to"] = metrologist
        doc.assigned_to = metrologist
    _assign_role_todo(
        doctype=doc.doctype,
        name=doc.name,
        role=ROLE_METROLOGIST,
        description=f"R-M1: Calibrate job {doc.job_code or doc.name} (due {due})",
    )

    invoice_name = _create_draft_invoice(doc)
    if invoice_name:
        updates["sales_invoice"] = invoice_name
        doc.sales_invoice = invoice_name

    if updates:
        frappe.db.set_value(doc.doctype, doc.name, updates, update_modified=False)

    publish_feed(
        event="R-M1",
        subject=f"Calibration job received: {doc.job_code or doc.name}",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        detail=f"assigned={doc.assigned_to}; due={due}; invoice={invoice_name}",
        status="RECEIVED",
    )
    _comment(
        doc.doctype,
        doc.name,
        f"[R-M1] Assigned={doc.assigned_to}; due={due}; draft_invoice={invoice_name}",
    )
    if getattr(doc, "flags", None) is not None:
        doc.flags.rm1_done = True
    return {
        "job": doc.name,
        "assigned_to": doc.assigned_to,
        "due_on": str(due),
        "sales_invoice": invoice_name,
    }


def rm1_on_job_update(doc, method: str | None = None) -> None:
    """Also fire R-M1 when workflow enters Received without a prior submit path."""
    if doc.get("workflow_state") != "Received":
        return
    if doc.get("sales_invoice") and doc.get("due_on") and doc.get("assigned_to"):
        return
    # Avoid re-entry loops
    if getattr(doc, "flags", None) and doc.flags.get("rm1_done"):
        return
    rm1_job_received(doc, method)


def validate_instrument_not_blocked(doc, method: str | None = None) -> None:
    """R-M3 validate: refuse new jobs that use blocked internal instruments."""
    instrument = doc.get("instrument")
    if not instrument:
        return
    blocked = cint(frappe.db.get_value("Instrument", instrument, "blocked_for_use"))
    if blocked:
        frappe.throw(
            f"Instrument {instrument} is blocked for use — internal calibration overdue (R-M3).",
            frappe.ValidationError,
        )


# ---------------------------------------------------------------------------
# R-M2 — Result approved (on_update_after_submit, reviewed)
# ---------------------------------------------------------------------------


def _ensure_certificate(job) -> str | None:
    existing = frappe.db.get_value(
        "Calibration Certificate", {"calibration_job": job.name}, "name"
    )
    if existing:
        return existing
    token = secrets.token_urlsafe(16)
    cert_no = f"MCC-{job.job_code or job.name}-{frappe.generate_hash(length=4).upper()}"
    issued = getdate(nowdate())
    valid_until = add_months(issued, 12)
    try:
        cert = frappe.get_doc(
            {
                "doctype": "Calibration Certificate",
                "certificate_number": cert_no,
                "calibration_job": job.name,
                "instrument": job.instrument,
                "issued_on": issued,
                "valid_until": valid_until,
                "verification_token": token,
                "workflow_state": "Certified",
            }
        )
        cert.insert(ignore_permissions=True)
        return cert.name
    except Exception as exc:
        _log("rm2_certificate_failed", f"{job.name}: {exc}")
        _comment(job.doctype, job.name, f"[R-M2] Certificate failed: {exc}")
        return None


def _ensure_traceability(job) -> str | None:
    existing = frappe.db.get_value(
        "Traceability Link", {"calibration_job": job.name}, "name"
    )
    if existing:
        return existing
    link_id = f"TL-{job.job_code or job.name}"
    std = "ESWASA Working Standard"
    if job.test_method:
        std = (
            frappe.db.get_value("Test Method", job.test_method, "standard_ref")
            or std
        )
    try:
        link = frappe.get_doc(
            {
                "doctype": "Traceability Link",
                "link_id": link_id,
                "calibration_job": job.name,
                "reference_standard": std,
                "reference_certificate": f"REF-{job.job_code or job.name}",
                "trace_to": "SI via ESWASA national metrology",
                "notes": "R-M2: auto Traceability Link on result approval.",
            }
        )
        link.insert(ignore_permissions=True)
        return link.name
    except Exception as exc:
        _log("rm2_traceability_failed", f"{job.name}: {exc}")
        _comment(job.doctype, job.name, f"[R-M2] Traceability Link failed: {exc}")
        return None


def rm2_result_approved(doc, method: str | None = None) -> dict[str, Any]:
    """Generate cert + traceability; finalise invoice; mark job Dispatched; notify."""
    if not cint(doc.get("reviewed")):
        return {"skipped": True, "reason": "not_reviewed"}
    if cint(doc.get("docstatus")) != 1:
        return {"skipped": True, "reason": "not_submitted"}

    job_name = doc.calibration_job
    if not job_name or not frappe.db.exists("Calibration Job", job_name):
        return {"skipped": True, "reason": "no_job"}

    # Idempotent: already dispatched with certificate
    job = frappe.get_doc("Calibration Job", job_name)
    if job.workflow_state == "Dispatched" and frappe.db.exists(
        "Calibration Certificate", {"calibration_job": job_name}
    ):
        return {"skipped": True, "reason": "already_dispatched"}

    cert_name = _ensure_certificate(job)
    link_name = _ensure_traceability(job)
    invoice_name = _finalise_invoice(job)

    frappe.db.set_value(
        "Calibration Job",
        job_name,
        {
            "workflow_state": "Dispatched",
            "sales_invoice": invoice_name or job.sales_invoice,
        },
        update_modified=True,
    )

    email = _client_email_for_job(job)
    _notify_email(
        [email] if email else [],
        subject=f"Calibration complete: {job.job_code or job.name}",
        message=(
            f"Your calibration job {job.job_code or job.name} has been reviewed and dispatched.\n"
            f"Certificate: {cert_name}\n"
            f"Traceability: {link_name}\n"
            f"Invoice: {invoice_name}\n"
        ),
    )
    publish_feed(
        event="R-M2",
        subject=f"Result approved / job dispatched: {job.job_code or job.name}",
        reference_doctype="Calibration Job",
        reference_name=job_name,
        detail=f"cert={cert_name}; trace={link_name}; invoice={invoice_name}; result={doc.name}",
        status="DISPATCHED",
    )
    _comment(
        "Calibration Job",
        job_name,
        (
            f"[R-M2] APPROVED artefacts: cert={cert_name}, "
            f"trace={link_name}, invoice={invoice_name}, result={doc.name}"
        ),
    )
    return {
        "job": job_name,
        "certificate": cert_name,
        "traceability_link": link_name,
        "sales_invoice": invoice_name,
        "result": doc.name,
    }


def rm2_on_job_reviewed(doc, method: str | None = None) -> None:
    """Fallback: Calibration Job entering Reviewed also runs R-M2 artefacts."""
    if doc.get("workflow_state") not in ("Reviewed", "Certified", "Dispatched"):
        return
    if not doc.has_value_changed("workflow_state") and doc.workflow_state != "Reviewed":
        # Only act on transition into Reviewed (or force when Reviewed and no cert yet)
        if doc.workflow_state != "Reviewed":
            return
    if doc.workflow_state != "Reviewed":
        return
    if frappe.db.exists("Calibration Certificate", {"calibration_job": doc.name}):
        return

    # Prefer an existing submitted result; otherwise synthesise approval path
    result_name = frappe.db.get_value(
        "Result",
        {"calibration_job": doc.name, "docstatus": 1},
        "name",
    )
    if result_name:
        result = frappe.get_doc("Result", result_name)
        if not cint(result.reviewed):
            frappe.db.set_value("Result", result_name, "reviewed", 1, update_modified=False)
            result.reviewed = 1
        rm2_result_approved(result, method)
        return

    # No result yet — still produce artefacts from job review
    cert_name = _ensure_certificate(doc)
    link_name = _ensure_traceability(doc)
    invoice_name = _finalise_invoice(doc)
    frappe.db.set_value(
        doc.doctype,
        doc.name,
        {
            "workflow_state": "Dispatched",
            "sales_invoice": invoice_name or doc.sales_invoice,
        },
        update_modified=False,
    )
    email = _client_email_for_job(doc)
    _notify_email(
        [email] if email else [],
        subject=f"Calibration complete: {doc.job_code or doc.name}",
        message=(
            f"Your calibration job {doc.job_code or doc.name} has been reviewed and dispatched.\n"
            f"Certificate: {cert_name}\n"
        ),
    )
    publish_feed(
        event="R-M2",
        subject=f"Job reviewed / dispatched: {doc.job_code or doc.name}",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        detail=f"cert={cert_name}; trace={link_name}; invoice={invoice_name}",
        status="DISPATCHED",
    )


# ---------------------------------------------------------------------------
# R-M3 — daily: Instrument calibration-due
# ---------------------------------------------------------------------------


def instrument_is_internal(instrument_name: str | None = None, row: Any | None = None) -> bool:
    if row is not None:
        if cint(getattr(row, "is_internal_eswasa", 0)):
            return True
        owner = (getattr(row, "owner_customer", None) or "").upper()
        return "ESWASA" in owner
    if not instrument_name:
        return False
    is_int = cint(frappe.db.get_value("Instrument", instrument_name, "is_internal_eswasa"))
    if is_int:
        return True
    owner = (frappe.db.get_value("Instrument", instrument_name, "owner_customer") or "").upper()
    return "ESWASA" in owner


def rm3_calibration_due_sweep() -> dict[str, int]:
    """Daily: notify owners of due instruments; block overdue internal ESWASA."""
    today_d = getdate(today())
    horizon = add_days(today_d, 14)
    due_rows = frappe.get_all(
        "Instrument",
        filters={
            "status": "Active",
            "calibration_due_on": ("between", [today_d, horizon]),
            "calibration_due_notice_sent": 0,
        },
        fields=[
            "name",
            "instrument_name",
            "owner_customer",
            "owner_email",
            "calibration_due_on",
            "is_internal_eswasa",
        ],
    )
    notified = 0
    for row in due_rows:
        _notify_email(
            [row.owner_email] if row.owner_email else [],
            subject=f"Calibration due: {row.instrument_name or row.name}",
            message=(
                f"Instrument {row.name} ({row.instrument_name}) is due for calibration "
                f"on {row.calibration_due_on}."
            ),
        )
        _assign_role_todo(
            doctype="Instrument",
            name=row.name,
            role=ROLE_METROLOGIST,
            description=f"R-M3: Calibration due {row.calibration_due_on} for {row.name}",
        )
        publish_feed(
            event="R-M3",
            subject=f"Calibration due: {row.name}",
            reference_doctype="Instrument",
            reference_name=row.name,
            detail=f"due={row.calibration_due_on}",
            status="CALIBRATION_DUE",
        )
        frappe.db.set_value(
            "Instrument",
            row.name,
            "calibration_due_notice_sent",
            1,
            update_modified=False,
        )
        notified += 1

    overdue = frappe.get_all(
        "Instrument",
        filters={
            "status": "Active",
            "calibration_due_on": ("<", today_d),
        },
        fields=[
            "name",
            "instrument_name",
            "owner_customer",
            "owner_email",
            "calibration_due_on",
            "is_internal_eswasa",
            "blocked_for_use",
        ],
    )
    blocked = 0
    for row in overdue:
        if not instrument_is_internal(row=row):
            # Still notify external owners once if notice not sent
            if not cint(
                frappe.db.get_value("Instrument", row.name, "calibration_due_notice_sent")
            ):
                _notify_email(
                    [row.owner_email] if row.owner_email else [],
                    subject=f"Calibration OVERDUE: {row.instrument_name or row.name}",
                    message=(
                        f"Instrument {row.name} was due on {row.calibration_due_on}."
                    ),
                )
                publish_feed(
                    event="R-M3",
                    subject=f"Calibration OVERDUE: {row.name}",
                    reference_doctype="Instrument",
                    reference_name=row.name,
                    status="OVERDUE",
                )
                frappe.db.set_value(
                    "Instrument",
                    row.name,
                    "calibration_due_notice_sent",
                    1,
                    update_modified=False,
                )
            continue

        if not cint(row.blocked_for_use):
            frappe.db.set_value(
                "Instrument",
                row.name,
                {
                    "blocked_for_use": 1,
                    "status": "Out of Service",
                },
                update_modified=False,
            )
            blocked += 1
            _assign_role_todo(
                doctype="Instrument",
                name=row.name,
                role=ROLE_MANAGER,
                description=f"R-M3: Internal instrument {row.name} blocked — calibrate before use",
            )
            publish_feed(
                event="R-M3",
                subject=f"Internal instrument BLOCKED: {row.name}",
                reference_doctype="Instrument",
                reference_name=row.name,
                detail=f"overdue since {row.calibration_due_on}",
                status="BLOCKED",
            )
            _notify_email(
                [row.owner_email] if row.owner_email else ["lab@eswasa.org.sz"],
                subject=f"Internal instrument blocked: {row.name}",
                message=(
                    f"Internal ESWASA instrument {row.name} is overdue for calibration "
                    f"and blocked from new jobs (R-M3)."
                ),
            )
    return {"notified": notified, "blocked": blocked}


# ---------------------------------------------------------------------------
# R-M4 — Result validate out-of-tolerance
# ---------------------------------------------------------------------------


def rm4_out_of_tolerance(doc, method: str | None = None) -> None:
    """Flag OOT + notify; block submit/approve until supervisor signs off."""
    is_fail = (doc.get("pass_fail") or "").strip() == "Fail"
    is_oot = cint(doc.get("out_of_tolerance")) or is_fail
    if not is_oot:
        if cint(doc.get("supervisor_signoff_required")) and not is_fail:
            doc.supervisor_signoff_required = 0
            doc.out_of_tolerance = 0
        return

    doc.out_of_tolerance = 1
    doc.supervisor_signoff_required = 1

    # Notify once — Comment marker is the idempotency token (name may be unset on insert)
    already = False
    if doc.name and not doc.is_new():
        already = bool(
            frappe.db.exists(
                "Comment",
                {
                    "reference_doctype": doc.doctype,
                    "reference_name": doc.name,
                    "content": ("like", "%[R-M4] OOT flagged%"),
                },
            )
        )
    if not already and getattr(doc, "flags", None) and doc.flags.get("rm4_notified"):
        already = True

    if not already:
        job_name = doc.calibration_job
        email = None
        if job_name and frappe.db.exists("Calibration Job", job_name):
            email = _client_email_for_job(frappe.get_doc("Calibration Job", job_name))
        _notify_email(
            [email] if email else [],
            subject=f"Out-of-tolerance result: {doc.result_id or doc.name or 'new'}",
            message=(
                f"Result {doc.result_id or doc.name or '(new)'} for job {job_name} is "
                f"out of tolerance (parameter={doc.parameter}). "
                f"Supervisor sign-off is required (R-M4)."
            ),
        )
        if doc.name and not doc.is_new():
            _assign_role_todo(
                doctype=doc.doctype,
                name=doc.name,
                role=ROLE_MANAGER,
                description=f"R-M4: Supervisor sign-off required for OOT result {doc.name}",
            )
            publish_feed(
                event="R-M4",
                subject=f"Out-of-tolerance: {doc.result_id or doc.name}",
                reference_doctype=doc.doctype,
                reference_name=doc.name,
                detail=f"parameter={doc.parameter}; job={job_name}",
                status="OOT",
            )
            _comment(doc.doctype, doc.name, f"[R-M4] OOT flagged on {doc.name}")
        if getattr(doc, "flags", None) is not None:
            doc.flags.rm4_notified = True

    # Draft may be saved with OOT flag; submit / review requires sign-off
    blocking = cint(doc.get("docstatus")) == 1 or cint(doc.get("reviewed"))
    if method == "before_submit":
        blocking = True
    if blocking and not cint(doc.get("supervisor_signed_off")):
        frappe.throw(
            (
                f"Result {doc.result_id or doc.name} is out of tolerance — "
                f"supervisor sign-off is required before submit/approve (R-M4)."
            ),
            frappe.ValidationError,
        )


def rm4_before_submit(doc, method: str | None = None) -> None:
    """Hard gate: cannot submit OOT result without supervisor sign-off."""
    rm4_out_of_tolerance(doc, "before_submit")


def rm4_after_insert(doc, method: str | None = None) -> None:
    """Complete R-M4 feed/todo once the Result has a name."""
    if not (cint(doc.get("out_of_tolerance")) or (doc.get("pass_fail") or "").strip() == "Fail"):
        return
    already = frappe.db.exists(
        "Comment",
        {
            "reference_doctype": doc.doctype,
            "reference_name": doc.name,
            "content": ("like", "%[R-M4] OOT flagged%"),
        },
    )
    if already:
        return
    job_name = doc.calibration_job
    _assign_role_todo(
        doctype=doc.doctype,
        name=doc.name,
        role=ROLE_MANAGER,
        description=f"R-M4: Supervisor sign-off required for OOT result {doc.name}",
    )
    publish_feed(
        event="R-M4",
        subject=f"Out-of-tolerance: {doc.result_id or doc.name}",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        detail=f"parameter={doc.parameter}; job={job_name}",
        status="OOT",
    )
    _comment(doc.doctype, doc.name, f"[R-M4] OOT flagged on {doc.name}")
