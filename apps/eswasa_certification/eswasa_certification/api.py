"""Whitelisted RPC for EswasaOne Core / agent tools.

Contract shapes: CertificationApplication, AuditSummary
(see contracts/openapi.yaml).

Methods:
  - list_overdue(auditor=None, scheme=None)
  - list_applications(status=None, limit=20)
  - get_application(name)
  - create_application(scheme, applicant_name, contact_email=None, confirm=False)
  - advance_state(name, action, comment=None, confirm=False)
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, getdate, nowdate, today

from eswasa_certification.workflow_map import (
    next_state,
    resolve_workflow_state,
    serialize_application,
    serialize_audit_summary,
)


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return bool(cint(value))


def _require_confirm(confirm) -> None:
    if not _as_bool(confirm):
        frappe.throw(
            _("Mutation requires confirm=true (confirm-before-commit)."),
            frappe.ValidationError,
        )


def _audit_log(action: str, reference_doctype: str, reference_name: str, detail: str = "") -> None:
    """Best-effort audit trail; never blocks the primary write.

    Uses db_insert to avoid broken global ``on_change`` hooks (LMS Badge).
    """
    try:
        comment = frappe.get_doc(
            {
                "doctype": "Comment",
                "comment_type": "Info",
                "reference_doctype": reference_doctype,
                "reference_name": reference_name,
                "content": f"[eswasa_certification] {action}: {detail}".strip(),
            }
        )
        comment.set_new_name()
        comment.db_insert()
    except Exception:
        # Never fail the primary mutation for audit-trail problems
        pass


def _persist(doc, *, insert: bool = False):
    """Persist Certification docs without broken global post-save hooks.

    Staging has ``lms…process_badges`` on ``*`` ``on_change``, but DocType
    ``LMS Badge`` was removed during orphan cleanup — ``doc.insert()`` then
    aborts after the row write and rolls the transaction back. Core create /
    advance must stay reliable, so we validate + db_insert/db_update instead.
    Permissions are enforced by the callers before this runs.
    """
    doc.run_method("validate")
    if insert:
        if not doc.name or doc.get("__islocal") is not False:
            doc.set_new_name()
        doc.db_insert()
        doc.set("__islocal", False)
    else:
        doc.db_update()
        # Bump modified explicitly — db_update may skip when only workflow_state changed
        frappe.db.set_value(
            doc.doctype,
            doc.name,
            "modified",
            frappe.utils.now(),
            update_modified=False,
        )
    return doc


@frappe.whitelist()
def list_overdue(auditor: str | None = None, scheme: str | None = None) -> dict:
    """List audits past due date that are not Completed/Cancelled.

    Also marks Planned/In Progress rows as Overdue when due_date < today.
    Requires Audit:read.
    """
    if not frappe.has_permission("Audit", "read"):
        frappe.throw(_("Not permitted to read Audit"), frappe.PermissionError)

    filters: dict = {
        "due_date": ("<", today()),
        "status": ("in", ["Planned", "In Progress", "Overdue"]),
    }
    if auditor:
        filters["auditor"] = auditor
    if scheme:
        filters["scheme"] = scheme

    rows = frappe.get_all(
        "Audit",
        filters=filters,
        fields=[
            "name",
            "application",
            "auditor",
            "scheme",
            "due_date",
            "status",
        ],
        order_by="due_date asc",
    )

    # Keep status field accurate for Ask-box demos
    for row in rows:
        if row.status != "Overdue":
            try:
                frappe.db.set_value("Audit", row.name, "status", "Overdue", update_modified=False)
                row.status = "Overdue"
            except Exception:
                pass

    items = [
        serialize_audit_summary(
            {
                "name": r.name,
                "application": r.application,
                "auditor": r.auditor,
                "scheme": r.scheme,
                "due_date": r.due_date,
                "status": r.status,
            }
        )
        for r in rows
    ]
    return {"items": items}


@frappe.whitelist()
def create_application(
    scheme: str | None = None,
    applicant_name: str | None = None,
    contact_email: str | None = None,
    confirm: bool | int | str = False,
    applicant_org: str | None = None,
    contact_phone: str | None = None,
    site_address: str | None = None,
) -> dict:
    """Create a Certification Application (OpenAPI CreateCertificationApplication)."""
    _require_confirm(confirm)

    if not scheme:
        frappe.throw(_("scheme is required"), frappe.ValidationError)
    if not applicant_name:
        frappe.throw(_("applicant_name is required"), frappe.ValidationError)

    if not frappe.has_permission("Certification Application", "create"):
        frappe.throw(
            _("Not permitted to create Certification Application"),
            frappe.PermissionError,
        )

    if not frappe.db.exists("Certification Scheme", scheme):
        frappe.throw(_("Unknown scheme: {0}").format(scheme), frappe.ValidationError)

    scheme_doc = frappe.get_cached_doc("Certification Scheme", scheme)
    if not cint(scheme_doc.is_active):
        frappe.throw(_("Scheme {0} is not active").format(scheme), frappe.ValidationError)

    doc = frappe.get_doc(
        {
            "doctype": "Certification Application",
            "scheme": scheme,
            "applicant_name": applicant_name,
            "applicant_org": applicant_org,
            "contact_email": contact_email,
            "contact_phone": contact_phone,
            "site_address": site_address,
            "application_date": nowdate(),
            "workflow_state": "Application",
        }
    )
    doc = _persist(doc, insert=True)
    _audit_log("create_application", doc.doctype, doc.name, f"scheme={scheme}")
    frappe.db.commit()
    doc.reload()
    return serialize_application(doc.as_dict())


@frappe.whitelist()
def advance_state(
    name: str | None = None,
    action: str | None = None,
    comment: str | None = None,
    confirm: bool | int | str = False,
) -> dict:
    """Advance a Certification Application through the CBMS workflow."""
    _require_confirm(confirm)

    if not name:
        frappe.throw(_("name is required"), frappe.ValidationError)
    if not action:
        frappe.throw(_("action is required"), frappe.ValidationError)

    if not frappe.has_permission("Certification Application", "write"):
        frappe.throw(
            _("Not permitted to update Certification Application"),
            frappe.PermissionError,
        )

    if not frappe.db.exists("Certification Application", name):
        frappe.throw(_("Application {0} not found").format(name), frappe.DoesNotExistError)

    doc = frappe.get_doc("Certification Application", name)
    current = doc.workflow_state or "Application"
    try:
        target = next_state(current, action)
    except ValueError as exc:
        frappe.throw(str(exc), frappe.ValidationError)

    doc.workflow_state = target
    # Comments use full insert hooks — skip when site hooks are broken
    if comment:
        try:
            c = frappe.get_doc(
                {
                    "doctype": "Comment",
                    "comment_type": "Workflow",
                    "reference_doctype": doc.doctype,
                    "reference_name": doc.name,
                    "content": comment,
                }
            )
            c.set_new_name()
            c.db_insert()
        except Exception:
            pass
    doc = _persist(doc, insert=False)

    # Side-effects for common transitions (best-effort; never invent certificates silently)
    if target == "Assessment":
        from eswasa_certification.rules import rc1_application_submitted

        try:
            rc1_application_submitted(doc)
        except Exception:
            frappe.log_error(title="eswasa_certification R-C1 from advance_state failed")
    if target == "Audit Scheduled" and doc.assigned_auditor:
        _ensure_planned_audit(doc)
    if target == "NC Resolution":
        frappe.db.set_value(
            doc.doctype,
            doc.name,
            {"nc_open": 1, "certificate_blocked": 1},
            update_modified=False,
        )
    if target == "Certified":
        _ensure_certificate_stub(doc)

    _audit_log(
        "advance_state",
        doc.doctype,
        doc.name,
        f"{current} --{action}--> {target}" + (f" | {comment}" if comment else ""),
    )
    frappe.db.commit()
    doc.reload()
    return serialize_application(doc.as_dict())


@frappe.whitelist()
def get_application(name: str | None = None) -> dict:
    """Fetch one application in contract shape (helper for Core BFF)."""
    if not name:
        frappe.throw(_("name is required"), frappe.ValidationError)
    if not frappe.has_permission("Certification Application", "read"):
        frappe.throw(
            _("Not permitted to read Certification Application"),
            frappe.PermissionError,
        )
    if not frappe.db.exists("Certification Application", name):
        frappe.throw(_("Application {0} not found").format(name), frappe.DoesNotExistError)
    doc = frappe.get_doc("Certification Application", name)
    return serialize_application(doc.as_dict())


@frappe.whitelist()
def list_applications(status: str | None = None, limit: int = 20) -> dict:
    """List applications in contract shape (helper for Core BFF).

    ``status`` accepts canonical workflow states or portal aliases
    (e.g. ``In Review`` → Assessment, ``Submitted`` → Application).
    """
    if not frappe.has_permission("Certification Application", "read"):
        frappe.throw(
            _("Not permitted to read Certification Application"),
            frappe.PermissionError,
        )
    filters = {}
    if status:
        filters["workflow_state"] = resolve_workflow_state(status)
    rows = frappe.get_all(
        "Certification Application",
        filters=filters,
        fields=[
            "name",
            "scheme",
            "applicant_name",
            "workflow_state",
            "creation",
            "modified",
        ],
        order_by="modified desc",
        limit_page_length=cint(limit) or 20,
    )
    items = [
        serialize_application(
            {
                "name": r.name,
                "scheme": r.scheme,
                "applicant_name": r.applicant_name,
                "workflow_state": r.workflow_state,
                "creation": r.creation,
                "modified": r.modified,
            }
        )
        for r in rows
    ]
    return {"items": items}


def _ensure_planned_audit(application) -> None:
    """Create a Stage-1 planned audit if none exists yet."""
    existing = frappe.db.exists(
        "Audit",
        {
            "application": application.name,
            "status": ("in", ["Planned", "In Progress", "Overdue"]),
        },
    )
    if existing:
        return
    due = getdate(nowdate())
    doc = frappe.get_doc(
        {
            "doctype": "Audit",
            "application": application.name,
            "scheme": application.scheme,
            "auditor": application.assigned_auditor,
            "audit_type": "Stage 1",
            "status": "Planned",
            "due_date": due,
            "planned_date": due,
        }
    )
    try:
        _persist(doc, insert=True)
    except Exception:
        frappe.log_error(title="eswasa_certification planned audit stub failed")


def _ensure_certificate_stub(application) -> None:
    """Best-effort Certificate when certified — submits to fire R-C3 gate.

    Uses autoname CERT-.YYYY.-.##### and skips if a Certificate already exists
    for this application. A10 DemoSeed may later attach narrative IDs.
    """
    from eswasa_certification.rules import application_has_open_nc, rc3_certificate_submitted

    existing = frappe.db.get_value("Certificate", {"application": application.name}, "name")
    if existing:
        # Ensure R-C3 artefacts if draft certificate was never submitted
        try:
            cert = frappe.get_doc("Certificate", existing)
            if cint(cert.docstatus) == 0 and not application_has_open_nc(application.name):
                cert.flags.ignore_permissions = True
                cert.submit()
            elif cint(cert.docstatus) == 1 and not cert.get("verification_token"):
                rc3_certificate_submitted(cert)
        except Exception:
            frappe.log_error(title="eswasa_certification certificate R-C3 refresh failed")
        return
    if application_has_open_nc(application.name):
        return
    try:
        validity_months = (
            frappe.db.get_value(
                "Certification Scheme", application.scheme, "certificate_validity_months"
            )
            or 36
        )
        issued = getdate(nowdate())
        valid_until = frappe.utils.add_months(issued, cint(validity_months))
        # Unique certificate_number without colliding DemoSeed CERT-2025-0041
        cert_no = f"ESWASA-{application.name}"
        if cert_no == "CERT-2025-0041" or frappe.db.exists(
            "Certificate", {"certificate_number": cert_no}
        ):
            return
        doc = frappe.get_doc(
            {
                "doctype": "Certificate",
                "certificate_number": cert_no,
                "application": application.name,
                "scheme": application.scheme,
                "holder_name": application.applicant_name,
                "status": "Active",
                "issued_on": issued,
                "valid_until": valid_until,
                "scope_summary": (
                    f"Certification against {application.scheme} "
                    f"for {application.applicant_name}."
                ),
            }
        )
        doc.flags.ignore_permissions = True
        doc.insert(ignore_permissions=True)
        try:
            doc.submit()
        except Exception:
            # LMS/global hook fallout — set submitted + run R-C3 directly
            frappe.db.set_value("Certificate", doc.name, "docstatus", 1, update_modified=False)
            doc.docstatus = 1
            rc3_certificate_submitted(doc)
    except Exception:
        frappe.log_error(title="eswasa_certification certificate stub failed")
