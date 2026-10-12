"""Certification business rules R-C1…R-C7.

Triggered from Document controllers / hooks.doc_events (R-C1–C3)
and scheduler_events (R-C4–C7). All side-effects are idempotent.
"""

from __future__ import annotations

import json
import secrets
from typing import Any

import frappe
from frappe.utils import add_days, add_months, cint, getdate, now_datetime, nowdate, today

# Public verify URL base (nginx → Core). Override via site_config.
DEFAULT_VERIFY_BASE = "https://eswasaone.aiceafrica.com/api/verify"
CERT_FEE_ITEM = "ESWASA-CERT-FEE"
FEED_REALTIME_EVENT = "eswasa_feed"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _log(title: str, detail: str = "") -> None:
    try:
        frappe.logger("eswasa_certification").info(f"{title}: {detail}")
    except Exception:
        pass
    try:
        frappe.log_error(message=detail or title, title=f"[cert] {title}"[:140])
    except Exception:
        pass


def _comment(doctype: str, name: str, content: str, comment_type: str = "Info") -> None:
    """Best-effort Comment (avoids broken global on_change hooks via db_insert)."""
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
    for_user: str | None = None,
) -> None:
    """Feed stub Core can consume: realtime + Notification Log + Core /ws/feed webhook.

    ``for_user`` targets the Notification Log to a specific user (e.g. the citizen
    who submitted the application) so it appears in their notification inbox.
    """
    payload = {
        "source": "eswasa_certification",
        "event": event,
        "subject": subject,
        "status": status,
        "reference_doctype": reference_doctype,
        "reference_name": reference_name,
        "detail": detail,
        "at": str(now_datetime()),
    }
    try:
        frappe.publish_realtime(
            FEED_REALTIME_EVENT,
            payload,
            after_commit=True,
        )
    except Exception:
        pass

    # Bridge to Core WebSocket bus so Institution portals update live
    try:
        import json
        from urllib import request as urlrequest

        core_url = (
            frappe.conf.get("eswasaone_core_url")
            or frappe.conf.get("eswasaone_feed_webhook")
            or ""
        )
        if core_url:
            endpoint = str(core_url).rstrip("/")
            if not endpoint.endswith("eswasa_feed"):
                endpoint = f"{endpoint}/api/events/webhooks/eswasa_feed"
            req = urlrequest.Request(
                endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urlrequest.urlopen(req, timeout=2)  # noqa: S310 — internal Core
    except Exception:
        pass

    # Notification Log is the durable feed inbox for Desk / Core pollers
    try:
        if frappe.db.exists("DocType", "Notification Log"):
            # Target the notification to the document owner (citizen) so it
            # shows in their /account/notifications inbox, unless an explicit
            # for_user was passed by the caller.
            target_user = for_user
            if not target_user:
                try:
                    target_user = frappe.db.get_value(reference_doctype, reference_name, "owner")
                except Exception:
                    pass

            # Notification Log.for_user must be a User name; contact emails often aren't.
            if target_user and not frappe.db.exists("User", target_user):
                owner = frappe.db.get_value(reference_doctype, reference_name, "owner")
                target_user = (
                    owner if owner and frappe.db.exists("User", owner) else None
                )

            nlog_data = {
                "doctype": "Notification Log",
                "subject": f"[{event}] {subject}"[:140],
                "email_content": detail or subject,
                "document_type": reference_doctype,
                "document_name": reference_name,
                "type": "Alert",
                "from_user": frappe.session.user or "Administrator",
            }
            if target_user:
                nlog_data["for_user"] = target_user
            nlog = frappe.get_doc(nlog_data)
            nlog.insert(ignore_permissions=True)
    except Exception as exc:
        import traceback

        _log("feed_notification_log_failed", f"{event}: {exc}\n{traceback.format_exc()}")

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
    """Create an open ToDo for the role pool (Assignment / Approval Queue)."""
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


def _verify_base() -> str:
    return (
        frappe.conf.get("eswasa_verify_base_url")
        or frappe.conf.get("hostname")
        and f"https://{frappe.conf.get('hostname')}/api/verify"
        or DEFAULT_VERIFY_BASE
    ).rstrip("/")


# Department → role mapping for application routing.
# When a scheme has responsible_department set, R-C1 additionally creates
# ToDos for the department-specific role so the right team sees it in
# their "Needs your attention" queue.
_DEPT_ROLE_MAP: dict[str, str] = {
    "Product Certification": "Certification Officer",
    "Management Systems Certification": "Certification Officer",
    "Metrology & Calibration": "Metrology Officer",
    "Standards Development": "Standards Officer",
    "TBT & Trade": "TBT Officer",
    "Finance & Administration": "Accounts Manager",
    "Certification": "Certification Officer",
}

# Department → notification email (internal department inbox).
# Override via site_config keys like `dept_email_product_certification`.
_DEPT_EMAIL_MAP: dict[str, str] = {
    "Product Certification": "certification@eswasa.org.sz",
    "Management Systems Certification": "systems@eswasa.org.sz",
    "Metrology & Calibration": "metrology@eswasa.org.sz",
    "Standards Development": "standards@eswasa.org.sz",
    "TBT & Trade": "tbt@eswasa.org.sz",
    "Finance & Administration": "finance@eswasa.org.sz",
    "Certification": "certification@eswasa.org.sz",
}


def _scheme_department(scheme: str | None) -> str:
    """Read responsible_department from the Certification Scheme."""
    if not scheme:
        return "Certification"
    try:
        dept = frappe.db.get_value("Certification Scheme", scheme, "responsible_department")
        return dept or "Certification"
    except Exception:
        return "Certification"


def _dept_notify_emails(dept: str) -> list[str]:
    """Department notification email(s), honouring site_config overrides."""
    config_key = f"dept_email_{dept.lower().replace(' ', '_').replace('&', 'and')}"
    override = frappe.conf.get(config_key)
    if override:
        return [override] if isinstance(override, str) else list(override)
    return [_DEPT_EMAIL_MAP.get(dept, "certification@eswasa.org.sz")]


# ---------------------------------------------------------------------------
# R-C1 — Application on_submit / Assessment entry
# ---------------------------------------------------------------------------


def rc1_application_submitted(doc, method: str | None = None) -> None:
    """Create Stage-1 Audit (+14d), assign Cert Officer pool, queue, notify."""
    if getattr(doc, "flags", None) and doc.flags.get("rc1_done"):
        return

    # Idempotent: one open Stage-1 audit per application
    existing = frappe.db.get_value(
        "Audit",
        {
            "application": doc.name,
            "audit_type": "Stage 1",
            "status": ("in", ["Planned", "In Progress", "Overdue"]),
        },
        "name",
    )
    audit_name = existing
    if not audit_name:
        due = add_days(getdate(nowdate()), 14)
        auditor = doc.get("assigned_auditor")
        audit = frappe.get_doc(
            {
                "doctype": "Audit",
                "application": doc.name,
                "scheme": doc.scheme,
                "auditor": auditor,
                "audit_type": "Stage 1",
                "status": "Planned",
                "due_date": due,
                "planned_date": due,
                "findings_summary": "R-C1: auto Stage-1 audit on application submit.",
            }
        )
        audit.insert(ignore_permissions=True)
        audit_name = audit.name

    _assign_role_todo(
        doctype=doc.doctype,
        name=doc.name,
        role="Certification Officer",
        description=f"R-C1: Assess application {doc.name} ({doc.applicant_name})",
    )
    _assign_role_todo(
        doctype=doc.doctype,
        name=doc.name,
        role="Certification Manager",
        description=f"R-C1: Approval queue — {doc.name}",
    )

    # Department-level routing: create a ToDo for the department-specific
    # role and notify the department inbox so the right team picks it up.
    dept = _scheme_department(doc.get("scheme"))
    dept_role = _DEPT_ROLE_MAP.get(dept, "Certification Officer")
    if dept_role not in ("Certification Officer", "Certification Manager"):
        _assign_role_todo(
            doctype=doc.doctype,
            name=doc.name,
            role=dept_role,
            description=f"R-C1: {dept} — review application {doc.name} ({doc.applicant_name})",
        )

    # Email the citizen / applicant
    email = doc.get("contact_email")
    _notify_email(
        [email] if email else [],
        subject=f"Application received: {doc.name}",
        message=(
            f"Dear {doc.applicant_name},\n\n"
            f"Your certification application {doc.name} for scheme {doc.scheme} "
            f"has been received and assigned to the {dept} department. "
            f"Stage-1 audit {audit_name} is scheduled.\n\n"
            f"You can track your application status on the EswasaOne service portal.\n"
        ),
    )

    # Notify the responsible department inbox
    dept_emails = _dept_notify_emails(dept)
    _notify_email(
        dept_emails,
        subject=f"[{dept}] New application: {doc.name}",
        message=(
            f"A new certification application has been submitted:\n\n"
            f"  Reference: {doc.name}\n"
            f"  Applicant: {doc.applicant_name}\n"
            f"  Organisation: {doc.get('applicant_org') or '—'}\n"
            f"  Scheme: {doc.scheme}\n"
            f"  Department: {dept}\n"
            f"  Stage-1 Audit: {audit_name}\n\n"
            f"Please review and assign resources for the upcoming assessment.\n"
        ),
    )
    publish_feed(
        event="R-C1",
        subject=f"Application submitted: {doc.name}",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        detail=f"Stage-1 audit={audit_name}; dept={dept}",
        status="SUBMITTED",
    )
    if getattr(doc, "flags", None) is not None:
        doc.flags.rc1_done = True


def rc1_on_application_update(doc, method: str | None = None) -> None:
    """Also fire R-C1 when workflow enters Assessment (API advance path)."""
    if doc.get("workflow_state") not in ("Assessment", "Audit Scheduled"):
        return
    # Only when newly entering assessment-ish states from draft Application path
    prior = None
    if not doc.is_new() and doc.has_value_changed("workflow_state"):
        prior = doc.get_doc_before_save()
        prior_state = prior.workflow_state if prior else None
        if prior_state not in (None, "Application", "Assessment"):
            # already past first trigger window unless audit missing
            pass
    if not frappe.db.exists(
        "Audit",
        {"application": doc.name, "audit_type": "Stage 1"},
    ):
        rc1_application_submitted(doc, method)


# ---------------------------------------------------------------------------
# R-C2 — Audit NC → findings, block cert
# ---------------------------------------------------------------------------


def application_has_open_nc(application: str | None) -> bool:
    if not application:
        return False
    if cint(frappe.db.get_value("Certification Application", application, "nc_open")):
        return True
    return bool(
        frappe.db.exists(
            "Audit Finding",
            {
                "application": application,
                "finding_type": ("in", ["Major NC", "Minor NC"]),
                "status": ("in", ["Open", "Under Review"]),
            },
        )
    )


def rc2_audit_nc(doc, method: str | None = None) -> None:
    """On Audit submit with outcome=NC: findings, block cert, CA due +30d."""
    outcome = (doc.get("outcome") or "").strip()
    if outcome != "NC":
        return

    application = doc.application
    if not application:
        return

    # Ensure at least one open NC finding
    has_finding = frappe.db.exists(
        "Audit Finding",
        {
            "audit": doc.name,
            "finding_type": ("in", ["Major NC", "Minor NC"]),
            "status": ("in", ["Open", "Under Review"]),
        },
    )
    finding_name = has_finding
    if not finding_name:
        due = add_days(getdate(nowdate()), 30)
        finding = frappe.get_doc(
            {
                "doctype": "Audit Finding",
                "audit": doc.name,
                "application": application,
                "finding_type": "Major NC",
                "status": "Open",
                "due_date": due,
                "description": (
                    doc.get("findings_summary")
                    or "R-C2: Nonconformity raised on audit submit."
                ),
                "corrective_action": "Corrective action due within 30 days.",
            }
        )
        finding.insert(ignore_permissions=True)
        finding_name = finding.name
    else:
        # Ensure CA due on existing open findings
        due = add_days(getdate(nowdate()), 30)
        for fname in frappe.get_all(
            "Audit Finding",
            filters={
                "audit": doc.name,
                "status": ("in", ["Open", "Under Review"]),
            },
            pluck="name",
        ):
            if not frappe.db.get_value("Audit Finding", fname, "due_date"):
                frappe.db.set_value("Audit Finding", fname, "due_date", due, update_modified=False)

    frappe.db.set_value(
        "Certification Application",
        application,
        {
            "nc_open": 1,
            "certificate_blocked": 1,
            "workflow_state": "NC Resolution",
        },
        update_modified=True,
    )

    app_email = frappe.db.get_value("Certification Application", application, "contact_email")
    applicant = frappe.db.get_value("Certification Application", application, "applicant_name")
    _notify_email(
        [app_email] if app_email else [],
        subject=f"Nonconformity raised: {application}",
        message=(
            f"Dear {applicant},\n\n"
            f"Audit {doc.name} raised NC. Finding {finding_name}. "
            f"Certificate issuance is blocked until NC is closed. "
            f"Corrective action due in 30 days.\n"
        ),
    )
    publish_feed(
        event="R-C2",
        subject=f"NC open on {application}",
        reference_doctype="Audit",
        reference_name=doc.name,
        detail=f"finding={finding_name}; certificate blocked",
        status="NC_OPEN",
    )


def rc2_on_finding_insert(doc, method: str | None = None) -> None:
    """Creating a Major/Minor NC finding also blocks certification."""
    if doc.finding_type not in ("Major NC", "Minor NC"):
        return
    if doc.status == "Closed":
        return
    application = doc.application or frappe.db.get_value("Audit", doc.audit, "application")
    if not application:
        return
    if not doc.due_date:
        doc.due_date = add_days(getdate(nowdate()), 30)
    frappe.db.set_value(
        "Certification Application",
        application,
        {
            "nc_open": 1,
            "certificate_blocked": 1,
            "workflow_state": "NC Resolution",
        },
        update_modified=False,
    )
    publish_feed(
        event="R-C2",
        subject=f"Finding {doc.name} blocks certificate",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        status="NC_OPEN",
    )


def rc2_on_finding_close(doc, method: str | None = None) -> None:
    """Clear block when no open NCs remain."""
    if doc.status != "Closed":
        return
    application = doc.application
    if not application:
        return
    still_open = frappe.db.exists(
        "Audit Finding",
        {
            "application": application,
            "finding_type": ("in", ["Major NC", "Minor NC"]),
            "status": ("in", ["Open", "Under Review"]),
            "name": ("!=", doc.name),
        },
    )
    if still_open:
        return
    frappe.db.set_value(
        "Certification Application",
        application,
        {"nc_open": 0, "certificate_blocked": 0},
        update_modified=False,
    )


# ---------------------------------------------------------------------------
# R-C3 — Certificate on_submit → invoice + QR + register + feed  (GATE)
# ---------------------------------------------------------------------------


def _ensure_selling_masters() -> None:
    """Create minimal UOM / Item Group / Customer Group / Territory if missing."""
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

        # Fiscal Year covering today (required for Sales Invoice posting_date)
        if frappe.db.exists("DocType", "Fiscal Year"):
            today_d = getdate(today())
            year_name = str(today_d.year)
            if not frappe.db.exists("Fiscal Year", year_name):
                # Check overlap via query
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

        # Selling Price List (mandatory on Sales Invoice)
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


def _ensure_cert_fee_item() -> str:
    _ensure_selling_masters()
    if frappe.db.exists("Item", CERT_FEE_ITEM):
        return CERT_FEE_ITEM
    if not frappe.db.exists("DocType", "Item"):
        return CERT_FEE_ITEM
    try:
        item = frappe.get_doc(
            {
                "doctype": "Item",
                "item_code": CERT_FEE_ITEM,
                "item_name": "Certification Fee",
                "item_group": _default_item_group(),
                "stock_uom": "Nos",
                "is_stock_item": 0,
                "is_sales_item": 1,
                "include_item_in_manufacturing": 0,
                "description": "ESWASA certification body fee (R-C3).",
            }
        )
        item.insert(ignore_permissions=True)
    except Exception as exc:
        _log("ensure_cert_fee_item_failed", f"{CERT_FEE_ITEM}: {exc}")
    return CERT_FEE_ITEM


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


def _create_sales_invoice(cert) -> str | None:
    """Auto Sales Invoice for cert fee. Returns invoice name or None."""
    if not frappe.db.exists("DocType", "Sales Invoice"):
        _comment(cert.doctype, cert.name, "[R-C3] Sales Invoice DocType missing — stub skipped")
        return None
    if cert.get("sales_invoice") and frappe.db.exists("Sales Invoice", cert.sales_invoice):
        return cert.sales_invoice

    # Idempotent by certificate reference in remarks
    existing = frappe.db.get_value(
        "Sales Invoice",
        {"remarks": ("like", f"%{cert.name}%"), "docstatus": ("<", 2)},
        "name",
    )
    if existing:
        return existing

    company = frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value(
        "Company", {}, "name"
    )
    if not company:
        _log("rc3_no_company", cert.name)
        return None

    email = None
    if cert.application:
        email = frappe.db.get_value("Certification Application", cert.application, "contact_email")
    customer = _ensure_customer(cert.holder_name or cert.certificate_number, email)
    if not customer:
        return None

    item_code = _ensure_cert_fee_item()
    if not frappe.db.exists("Item", item_code):
        _log("rc3_item_missing", item_code)
        return None

    fee = 0.0
    if cert.scheme:
        fee = float(
            frappe.db.get_value("Certification Scheme", cert.scheme, "certification_fee") or 0
        )
    if fee <= 0:
        fee = 5000.0  # default SZL stub fee

    income = _income_account(company)
    currency = frappe.db.get_value("Company", company, "default_currency") or "SZL"
    price_list = (
        "Standard Selling"
        if frappe.db.exists("Price List", "Standard Selling")
        else frappe.db.get_value("Price List", {"selling": 1}, "name")
    )
    try:
        item_row: dict[str, Any] = {
            "item_code": item_code,
            "qty": 1,
            "rate": fee,
            "description": f"Certification fee — {cert.certificate_number}",
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
            "remarks": f"R-C3 certification fee for {cert.name} / {cert.certificate_number}",
            "items": [item_row],
        }
        if price_list:
            payload["selling_price_list"] = price_list
            payload["price_list_currency"] = currency
            payload["plc_conversion_rate"] = 1
        sinv = frappe.get_doc(payload)
        sinv.insert(ignore_permissions=True)
        # Submit when possible; draft still counts as produced invoice
        try:
            sinv.submit()
        except Exception:
            pass
        return sinv.name
    except Exception as exc:
        _log("rc3_sales_invoice_failed", f"{cert.name}: {exc}")
        _comment(cert.doctype, cert.name, f"[R-C3] Sales Invoice failed: {exc}")
        return None


def _scheme_fee(scheme: str | None) -> float:
    fee = 0.0
    if scheme:
        fee = float(frappe.db.get_value("Certification Scheme", scheme, "certification_fee") or 0)
    return fee if fee > 0 else 5000.0


def _create_quotation(app) -> str | None:
    """Draft/submit ERPNext Quotation for the application certification fee. Idempotent."""
    if not frappe.db.exists("DocType", "Quotation"):
        _comment(app.doctype, app.name, "[quote] Quotation DocType missing — stub skipped")
        return None

    if app.get("quotation") and frappe.db.exists("Quotation", app.quotation):
        return app.quotation

    quote_title = f"Cert quote {app.name}"
    existing = frappe.db.get_value(
        "Quotation",
        {"title": quote_title, "docstatus": ("<", 2)},
        "name",
    )
    if existing:
        return existing

    company = frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value(
        "Company", {}, "name"
    )
    if not company:
        _log("quote_no_company", app.name)
        return None

    customer_name = app.get("applicant_org") or app.get("applicant_name") or app.name
    customer = _ensure_customer(customer_name, app.get("contact_email"))
    if not customer:
        return None

    item_code = _ensure_cert_fee_item()
    if not frappe.db.exists("Item", item_code):
        _log("quote_item_missing", item_code)
        return None

    fee = _scheme_fee(app.get("scheme"))
    currency = frappe.db.get_value("Company", company, "default_currency") or "SZL"
    price_list = (
        "Standard Selling"
        if frappe.db.exists("Price List", "Standard Selling")
        else frappe.db.get_value("Price List", {"selling": 1}, "name")
    )
    try:
        payload: dict[str, Any] = {
            "doctype": "Quotation",
            "quotation_to": "Customer",
            "party_name": customer,
            "company": company,
            "currency": currency,
            "transaction_date": nowdate(),
            "valid_till": add_days(nowdate(), 30),
            "order_type": "Sales",
            "title": quote_title,
            "terms": f"Certification quotation for {app.name} / {app.get('scheme') or ''}",
            "items": [
                {
                    "item_code": item_code,
                    "qty": 1,
                    "rate": fee,
                    "description": (
                        f"Certification fee — {app.get('scheme') or 'scheme'} "
                        f"({app.name})"
                    ),
                }
            ],
        }
        if price_list:
            payload["selling_price_list"] = price_list
            payload["price_list_currency"] = currency
            payload["plc_conversion_rate"] = 1
        quot = frappe.get_doc(payload)
        # Avoid inheriting Certification Application workflow/form context.
        quot.flags.ignore_permissions = True
        quot.insert()
        try:
            quot.submit()
        except Exception:
            pass
        return quot.name
    except Exception as exc:
        import traceback

        _log("quote_create_failed", f"{app.name}: {exc}\n{traceback.format_exc()}")
        _comment(app.doctype, app.name, f"[quote] Quotation failed: {exc}")
        return None


def rc_issue_quotation(doc, method: str | None = None) -> str | None:
    """Side effect for Assessment → Quoted: create Quotation + link on application."""
    qname = _create_quotation(doc)
    if not qname:
        return None
    updates: dict[str, Any] = {}
    if frappe.get_meta(doc.doctype).has_field("quotation"):
        updates["quotation"] = qname
    if updates:
        frappe.db.set_value(doc.doctype, doc.name, updates, update_modified=False)
        if hasattr(doc, "quotation"):
            doc.quotation = qname
    _comment(doc.doctype, doc.name, f"[quote] Quotation {qname} issued")
    return qname


def _create_register_and_token(cert) -> tuple[str | None, str | None, str | None]:
    """Create/refresh Register Entry + Verification Token. Returns (entry, token, qr)."""
    token = cert.get("verification_token") or secrets.token_urlsafe(24)
    entry_id = f"REG-{cert.certificate_number}"
    qr_payload = f"{_verify_base()}/{token}"

    register_name = None
    if frappe.db.exists("DocType", "Register Entry"):
        try:
            details = {
                "certificate_number": cert.certificate_number,
                "scheme": cert.scheme,
                "holder_name": cert.holder_name,
                "status": cert.status,
                "rule": "R-C3",
            }
            if frappe.db.exists("Register Entry", entry_id):
                re_doc = frappe.get_doc("Register Entry", entry_id)
                re_doc.subject = cert.holder_name or cert.certificate_number
                re_doc.reference_doctype = "Certificate"
                re_doc.reference_name = cert.name
                re_doc.issued_at = now_datetime()
                re_doc.expires_at = cert.valid_until
                re_doc.status = "Valid" if cert.status == "Active" else cert.status
                re_doc.details_json = json.dumps(details)
                re_doc.is_public = 1
                re_doc.save(ignore_permissions=True)
                register_name = re_doc.name
            else:
                re_doc = frappe.get_doc(
                    {
                        "doctype": "Register Entry",
                        "entry_id": entry_id,
                        "entry_type": "Certificate",
                        "subject": cert.holder_name or cert.certificate_number,
                        "reference_doctype": "Certificate",
                        "reference_name": cert.name,
                        "issued_at": now_datetime(),
                        "expires_at": cert.valid_until,
                        "status": "Valid",
                        "details_json": json.dumps(details),
                        "is_public": 1,
                    }
                )
                re_doc.insert(ignore_permissions=True)
                register_name = re_doc.name
        except Exception as exc:
            # Dependency on eswasa_verification — document and continue
            _log(
                "rc3_register_entry_failed",
                f"eswasa_verification Register Entry create failed for {cert.name}: {exc}",
            )
            _comment(
                cert.doctype,
                cert.name,
                f"[R-C3] Register Entry dependency (eswasa_verification) failed: {exc}",
            )
    else:
        _comment(
            cert.doctype,
            cert.name,
            "[R-C3] DocType Register Entry not installed (eswasa_verification) — stub noted",
        )

    if register_name and frappe.db.exists("DocType", "Verification Token"):
        try:
            if frappe.db.exists("Verification Token", token):
                pass
            else:
                # Reuse token field if certificate already had one linked
                existing_tok = frappe.db.get_value(
                    "Verification Token",
                    {"register_entry": register_name, "status": "Active"},
                    "name",
                )
                if existing_tok:
                    token = frappe.db.get_value("Verification Token", existing_tok, "token") or token
                    qr_payload = f"{_verify_base()}/{token}"
                else:
                    tok = frappe.get_doc(
                        {
                            "doctype": "Verification Token",
                            "token": token,
                            "register_entry": register_name,
                            "issued_at": now_datetime(),
                            "expires_at": cert.valid_until,
                            "qr_payload": qr_payload,
                            "status": "Active",
                        }
                    )
                    tok.insert(ignore_permissions=True)
        except Exception as exc:
            _log("rc3_verification_token_failed", f"{cert.name}: {exc}")
            _comment(cert.doctype, cert.name, f"[R-C3] Verification Token failed: {exc}")

    return register_name, token, qr_payload


def _schedule_surveillance(cert) -> str | None:
    months = 12
    if cert.scheme:
        months = cint(
            frappe.db.get_value(
                "Certification Scheme", cert.scheme, "surveillance_interval_months"
            )
            or 12
        )
    planned = add_months(getdate(cert.issued_on or nowdate()), months)
    existing = frappe.db.exists(
        "Surveillance Visit",
        {"certificate": cert.name, "status": ("in", ["Planned", "Missed"])},
    )
    if existing:
        return existing
    try:
        visit = frappe.get_doc(
            {
                "doctype": "Surveillance Visit",
                "certificate": cert.name,
                "application": cert.application,
                "scheme": cert.scheme,
                "status": "Planned",
                "planned_date": planned,
                "notes": "R-C3: auto-scheduled surveillance.",
            }
        )
        visit.insert(ignore_permissions=True)
        return visit.name
    except Exception as exc:
        _log("rc3_surveillance_failed", f"{cert.name}: {exc}")
        return None


def rc3_certificate_submitted(doc, method: str | None = None) -> dict[str, Any]:
    """GATE: invoice + QR/token + register + surveillance + APPROVED feed.

    Safe to call repeatedly; returns produced artefact names.
    """
    if application_has_open_nc(doc.application):
        frappe.throw(
            "Cannot submit Certificate while application has open nonconformities (R-C2).",
            frappe.ValidationError,
        )

    # Default validity +3y if missing
    if not doc.valid_until and doc.issued_on:
        doc.valid_until = add_months(getdate(doc.issued_on), 36)
        frappe.db.set_value(
            doc.doctype, doc.name, "valid_until", doc.valid_until, update_modified=False
        )

    register_name, token, qr_payload = _create_register_and_token(doc)
    invoice_name = _create_sales_invoice(doc)
    visit_name = _schedule_surveillance(doc)

    updates = {
        "verification_token": token,
        "qr_payload": qr_payload,
    }
    if register_name:
        updates["register_entry"] = register_name
    if invoice_name:
        updates["sales_invoice"] = invoice_name
    frappe.db.set_value(doc.doctype, doc.name, updates, update_modified=False)
    for key, val in updates.items():
        if hasattr(doc, key):
            doc.set(key, val)

    # Flip application to Certified when appropriate
    if doc.application and frappe.db.exists("Certification Application", doc.application):
        ws = frappe.db.get_value("Certification Application", doc.application, "workflow_state")
        if ws not in ("Certified", "Surveillance", "Renewal", "Withdraw"):
            frappe.db.set_value(
                "Certification Application",
                doc.application,
                {
                    "workflow_state": "Certified",
                    "nc_open": 0,
                    "certificate_blocked": 0,
                },
                update_modified=False,
            )

    email = None
    if doc.application:
        email = frappe.db.get_value(
            "Certification Application", doc.application, "contact_email"
        )
    _notify_email(
        [email] if email else [],
        subject=f"Certificate APPROVED: {doc.certificate_number}",
        message=(
            f"Dear {doc.holder_name},\n\n"
            f"Your certificate {doc.certificate_number} has been APPROVED.\n"
            f"Verify at: {qr_payload}\n"
            f"Valid until: {doc.valid_until}\n"
        ),
    )
    publish_feed(
        event="R-C3",
        subject=f"Certificate APPROVED: {doc.certificate_number}",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        detail=(
            f"invoice={invoice_name}; register={register_name}; "
            f"token={token}; surveillance={visit_name}"
        ),
        status="APPROVED",
    )
    _comment(
        doc.doctype,
        doc.name,
        (
            f"[R-C3] APPROVED artefacts: invoice={invoice_name}, "
            f"register={register_name}, token={token}, qr={qr_payload}, "
            f"surveillance={visit_name}"
        ),
    )
    return {
        "certificate": doc.name,
        "sales_invoice": invoice_name,
        "register_entry": register_name,
        "verification_token": token,
        "qr_payload": qr_payload,
        "surveillance_visit": visit_name,
    }


# ---------------------------------------------------------------------------
# R-C4 — Certificate expiry within 42d
# ---------------------------------------------------------------------------


def rc4_certificate_expiry_reminders() -> int:
    """Daily: certificates expiring within 42 days → RENEWAL DUE."""
    horizon = add_days(getdate(today()), 42)
    rows = frappe.get_all(
        "Certificate",
        filters={
            "status": "Active",
            "valid_until": ("between", [today(), horizon]),
            "renewal_notice_sent": 0,
        },
        fields=["name", "certificate_number", "application", "holder_name", "valid_until"],
    )
    count = 0
    for row in rows:
        email = None
        if row.application:
            email = frappe.db.get_value(
                "Certification Application", row.application, "contact_email"
            )
        _notify_email(
            [email] if email else [],
            subject=f"RENEWAL DUE: {row.certificate_number}",
            message=(
                f"Certificate {row.certificate_number} expires on {row.valid_until}. "
                f"Please start renewal."
            ),
        )
        _assign_role_todo(
            doctype="Certificate",
            name=row.name,
            role="Certification Officer",
            description=f"R-C4: RENEWAL DUE {row.certificate_number} by {row.valid_until}",
        )
        publish_feed(
            event="R-C4",
            subject=f"RENEWAL DUE: {row.certificate_number}",
            reference_doctype="Certificate",
            reference_name=row.name,
            status="RENEWAL_DUE",
        )
        frappe.db.set_value(
            "Certificate", row.name, "renewal_notice_sent", 1, update_modified=False
        )
        count += 1
    return count


# ---------------------------------------------------------------------------
# R-C5 — Surveillance due ≤30d
# ---------------------------------------------------------------------------


def rc5_surveillance_due() -> int:
    """Daily: planned surveillance within 30d → assign; overdue → SLA breach."""
    horizon = add_days(getdate(today()), 30)
    rows = frappe.get_all(
        "Surveillance Visit",
        filters={"status": "Planned", "planned_date": ("<=", horizon)},
        fields=["name", "certificate", "planned_date", "auditor"],
    )
    count = 0
    for row in rows:
        overdue = getdate(row.planned_date) < getdate(today())
        if overdue:
            frappe.db.set_value(
                "Surveillance Visit", row.name, "status", "Missed", update_modified=False
            )
            publish_feed(
                event="R-C5",
                subject=f"SLA breach: surveillance {row.name}",
                reference_doctype="Surveillance Visit",
                reference_name=row.name,
                status="SLA_BREACH",
            )
            _assign_role_todo(
                doctype="Surveillance Visit",
                name=row.name,
                role="Certification Manager",
                description=f"R-C5 SLA breach: overdue surveillance {row.name}",
            )
        else:
            _assign_role_todo(
                doctype="Surveillance Visit",
                name=row.name,
                role="Certification Officer",
                description=f"R-C5: Surveillance due {row.planned_date} for {row.certificate}",
            )
            publish_feed(
                event="R-C5",
                subject=f"Surveillance due: {row.name}",
                reference_doctype="Surveillance Visit",
                reference_name=row.name,
                status="DUE",
            )
        count += 1
    return count


# ---------------------------------------------------------------------------
# R-C6 — Assessment SLA sweep
# ---------------------------------------------------------------------------


def rc6_assessment_sla_sweep() -> int:
    """Applications stuck in Assessment beyond scheme turnaround → SLA BREACH."""
    rows = frappe.get_all(
        "Certification Application",
        filters={"workflow_state": "Assessment", "sla_breached": 0},
        fields=["name", "scheme", "application_date", "applicant_name", "modified"],
    )
    count = 0
    for row in rows:
        turnaround = 14
        if row.scheme:
            turnaround = cint(
                frappe.db.get_value(
                    "Certification Scheme", row.scheme, "assessment_turnaround_days"
                )
                or 14
            )
        anchor = getdate(row.application_date or row.modified)
        if getdate(today()) <= add_days(anchor, turnaround):
            continue
        frappe.db.set_value(
            "Certification Application",
            row.name,
            "sla_breached",
            1,
            update_modified=False,
        )
        _assign_role_todo(
            doctype="Certification Application",
            name=row.name,
            role="Certification Manager",
            description=f"R-C6 SLA BREACH: Assessment overdue for {row.name}",
        )
        publish_feed(
            event="R-C6",
            subject=f"SLA BREACH: {row.name}",
            reference_doctype="Certification Application",
            reference_name=row.name,
            status="SLA_BREACH",
        )
        count += 1
    return count


# ---------------------------------------------------------------------------
# R-C7 — Auditor competence expiry
# ---------------------------------------------------------------------------


def auditor_competence_valid(auditor: str | None, scheme: str | None = None) -> bool:
    if not auditor:
        return True
    if cint(frappe.db.get_value("Auditor", auditor, "assignment_blocked")):
        return False
    filters: dict[str, Any] = {"auditor": auditor}
    if scheme:
        filters["scheme"] = scheme
    rows = frappe.get_all(
        "Auditor Competence",
        filters=filters,
        fields=["name", "valid_to"],
    )
    if not rows:
        # No competence record → do not block (competence may be pending)
        return True
    today_d = getdate(today())
    for row in rows:
        if not row.valid_to or getdate(row.valid_to) >= today_d:
            return True
    return False


def rc7_auditor_competence_expiry() -> int:
    """Daily: expire competence → block auditor assignment; notify."""
    today_d = getdate(today())
    rows = frappe.get_all(
        "Auditor Competence",
        filters={"valid_to": ("<", today_d)},
        fields=["name", "auditor", "scheme", "valid_to"],
    )
    blocked: set[str] = set()
    for row in rows:
        if not row.auditor or row.auditor in blocked:
            continue
        # Only block when ALL competence rows for auditor are expired
        if auditor_competence_valid(row.auditor):
            continue
        frappe.db.set_value(
            "Auditor", row.auditor, "assignment_blocked", 1, update_modified=False
        )
        blocked.add(row.auditor)
        publish_feed(
            event="R-C7",
            subject=f"Auditor competence expired: {row.auditor}",
            reference_doctype="Auditor",
            reference_name=row.auditor,
            status="COMPETENCE_EXPIRED",
        )
        _assign_role_todo(
            doctype="Auditor",
            name=row.auditor,
            role="Certification Manager",
            description=f"R-C7: Competence expired for {row.auditor} — renew before assignment",
        )
        _notify_email(
            ["hr@eswasa.org.sz"],
            subject=f"Auditor competence expired: {row.auditor}",
            message=f"Auditor {row.auditor} blocked from new audit assignment (R-C7).",
        )
    return len(blocked)


def validate_auditor_assignment(doc, method: str | None = None) -> None:
    """R-C7 validate: block Audit save when auditor competence expired."""
    auditor = doc.get("auditor")
    if not auditor:
        return
    if not auditor_competence_valid(auditor, doc.get("scheme")):
        frappe.throw(
            f"Auditor {auditor} cannot be assigned — competence expired or blocked (R-C7).",
            frappe.ValidationError,
        )
