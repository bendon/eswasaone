"""Whitelisted RPC for EswasaOne Core / agent tools.

Contract shapes: CertificationApplication, AuditSummary
(see contracts/openapi.yaml).

Methods:
  - list_overdue(auditor=None, scheme=None)
  - list_applications(status=None, limit=20)
  - get_application(name)
  - create_application(scheme, applicant_name, contact_email=None, confirm=False)
  - advance_state(...) — alias of workflow_act.act
  - patch_audit(name, action, payload=None, confirm=False, idempotency_key=None)
  - workflow_act.act(doctype, name, action, expected_state, idempotency_key, reason, …)
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, getdate, nowdate, today

from eswasa_certification.workflow_map import (
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


def _parse_payload(payload: Any) -> dict[str, Any]:
    if payload is None:
        return {}
    if isinstance(payload, str):
        text = payload.strip()
        if not text:
            return {}
        try:
            data = json.loads(text)
        except Exception:
            frappe.throw(_("payload must be a JSON object"), frappe.ValidationError)
        if not isinstance(data, dict):
            frappe.throw(_("payload must be a JSON object"), frappe.ValidationError)
        return data
    if isinstance(payload, dict):
        return payload
    frappe.throw(_("payload must be an object"), frappe.ValidationError)
    return {}


def _resolve_auditor(raw: str | None) -> str | None:
    """Map portal staff pick / Auditor name → Auditor primary key.

    Accepts Auditor code, linked User (email/name), email, display name, or
    User.full_name / username. Staff pickers list Users; assignment needs an
    Auditor master linked to that User.
    """
    value = (raw or "").strip()
    if not value:
        return None
    if frappe.db.exists("Auditor", value):
        return value
    for filters in (
        {"user": value},
        {"email": value},
        {"auditor_name": value},
        {"auditor_code": value},
    ):
        found = frappe.db.get_value("Auditor", filters, "name")
        if found:
            return found

    # Staff picker may send User.full_name or username — resolve User first.
    user_name = None
    if frappe.db.exists("User", value):
        user_name = value
    else:
        user_name = (
            frappe.db.get_value("User", {"email": value}, "name")
            or frappe.db.get_value("User", {"username": value}, "name")
            or frappe.db.get_value("User", {"full_name": value}, "name")
        )
    if user_name:
        for filters in ({"user": user_name}, {"email": user_name}):
            found = frappe.db.get_value("Auditor", filters, "name")
            if found:
                return found
        email = frappe.db.get_value("User", user_name, "email")
        if email:
            found = frappe.db.get_value("Auditor", {"email": email}, "name")
            if found:
                return found

    frappe.throw(
        _(
            "No auditor profile for {0}. Create an Auditor master linked to that "
            "user (or pick someone who already has one)."
        ).format(value),
        frappe.ValidationError,
    )
    return None


def _allowed_audit_actions(status: str | None) -> list[dict[str, Any]]:
    s = (status or "").lower()
    if "cancel" in s:
        return []
    if "complete" in s or "done" in s or "closed" in s:
        return [
            {"action": "assign", "label": "Reassign auditor"},
        ]
    return [
        {"action": "reschedule", "label": "Reschedule"},
        {"action": "assign", "label": "Assign auditor"},
        {"action": "complete", "label": "Mark complete"},
        {"action": "submit_outcome", "label": "Submit outcome"},
    ]


@frappe.whitelist()
def patch_audit(
    name: str | None = None,
    action: str | None = None,
    payload: Any = None,
    confirm: bool | int | str = False,
    idempotency_key: str | None = None,
) -> dict:
    """Wave-1 PATCH /certification/audits/{id} — schedule, assign, complete, submit_outcome.

    Actions: schedule | reschedule | assign | complete | submit_outcome
    """
    _require_confirm(confirm)
    name = (name or "").strip()
    action = (action or "").strip().lower()
    data = _parse_payload(payload)

    if not name:
        frappe.throw(_("name is required"), frappe.ValidationError)
    if action not in ("schedule", "reschedule", "assign", "complete", "submit_outcome"):
        frappe.throw(
            _("action must be schedule, reschedule, assign, complete, or submit_outcome"),
            frappe.ValidationError,
        )
    if not frappe.db.exists("Audit", name):
        frappe.throw(_("Audit {0} not found").format(name), frappe.DoesNotExistError)
    if not frappe.has_permission("Audit", "write", doc=name):
        frappe.throw(_("Not permitted to update Audit {0}").format(name), frappe.PermissionError)

    # Soft idempotency: same key + already Completed for complete/submit → return current.
    cache_key = None
    if idempotency_key:
        cache_key = f"eswasa_patch_audit:{name}:{action}:{idempotency_key}"
        cached = frappe.cache().get_value(cache_key)
        if cached:
            return cached

    doc = frappe.get_doc("Audit", name)
    if cint(doc.docstatus) == 2:
        frappe.throw(_("Audit {0} is cancelled").format(name), frappe.ValidationError)

    if action in ("schedule", "reschedule"):
        due = data.get("due_date") or data.get("planned_date") or data.get("date")
        if not due:
            frappe.throw(_("due_date is required for {0}").format(action), frappe.ValidationError)
        due_d = getdate(due)
        doc.due_date = due_d
        doc.planned_date = getdate(data["planned_date"]) if data.get("planned_date") else due_d
        if data.get("audit_type"):
            doc.audit_type = data["audit_type"]
        if data.get("auditor"):
            doc.auditor = _resolve_auditor(str(data["auditor"]))
        # Future date clears Overdue back to Planned.
        if due_d >= getdate(nowdate()) and doc.status in ("Overdue", "Planned"):
            doc.status = "Planned"
        if cint(doc.docstatus) == 0:
            doc.save(ignore_permissions=False)
        else:
            frappe.throw(
                _("Cannot reschedule a submitted Audit — amend or create a new visit"),
                frappe.ValidationError,
            )

    elif action == "assign":
        auditor = data.get("auditor") or data.get("auditor_id")
        if not auditor:
            frappe.throw(_("auditor is required for assign"), frappe.ValidationError)
        doc.auditor = _resolve_auditor(str(auditor))
        if cint(doc.docstatus) == 0:
            doc.save(ignore_permissions=False)
        else:
            frappe.db.set_value("Audit", name, "auditor", doc.auditor)
            doc.reload()

    elif action in ("complete", "submit_outcome"):
        if cint(doc.docstatus) == 1 and doc.status == "Completed":
            result = {
                **serialize_audit_summary(doc.as_dict()),
                "ok": True,
                "action": action,
                "allowed_actions": _allowed_audit_actions(doc.status),
                "idempotency_key": idempotency_key,
            }
            if cache_key:
                frappe.cache().set_value(cache_key, result, expires_in_sec=86400)
            return result
        if cint(doc.docstatus) == 1:
            frappe.throw(_("Audit {0} is already submitted").format(name), frappe.ValidationError)

        outcome = (data.get("outcome") or doc.outcome or "").strip()
        if action == "submit_outcome" and not outcome:
            frappe.throw(
                _("outcome is required for submit_outcome (Pass, NC, or Conditional)"),
                frappe.ValidationError,
            )
        if outcome:
            if outcome not in ("Pass", "NC", "Conditional"):
                frappe.throw(
                    _("outcome must be Pass, NC, or Conditional"),
                    frappe.ValidationError,
                )
            doc.outcome = outcome
        if data.get("findings_summary"):
            doc.findings_summary = data["findings_summary"]
        if data.get("audit_type"):
            doc.audit_type = data["audit_type"]
        doc.status = "Completed"
        doc.completed_date = getdate(data["completed_date"]) if data.get("completed_date") else getdate(nowdate())
        doc.save(ignore_permissions=False)
        # Submit to fire R-C2 (NC → findings). Fall back to direct rule if hooks fail.
        try:
            doc.submit()
        except Exception:
            frappe.db.set_value("Audit", doc.name, "docstatus", 1, update_modified=False)
            doc.docstatus = 1
            try:
                from eswasa_certification.rules import rc2_audit_nc

                rc2_audit_nc(doc)
            except Exception:
                frappe.log_error(title="eswasa_certification.patch_audit.rc2")

    else:  # pragma: no cover
        frappe.throw(_("Unsupported action {0}").format(action), frappe.ValidationError)

    frappe.db.commit()
    doc.reload()
    _audit_log(action, "Audit", name, json.dumps(data)[:400] if data else "")

    result = {
        **serialize_audit_summary(doc.as_dict()),
        "ok": True,
        "action": action,
        "status": doc.status,
        "allowed_actions": _allowed_audit_actions(doc.status),
        "idempotency_key": idempotency_key,
    }
    if cache_key:
        frappe.cache().set_value(cache_key, result, expires_in_sec=86400)
    return result


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
    expected_state: str | None = None,
    idempotency_key: str | None = None,
    reason: str | None = None,
) -> dict:
    """Advance a Certification Application — thin alias of workflow_act.act."""
    from eswasa_certification.workflow_act import act

    return act(
        doctype="Certification Application",
        name=name,
        action=action,
        expected_state=expected_state,
        idempotency_key=idempotency_key,
        reason=reason,
        comment=comment,
        confirm=confirm,
    )


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
