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


_PUBLIC_APPLY_ROLES = frozenset(
    {
        "Citizen",
        "Customer",
        "Certification Applicant",
    }
)

# Service Portal marketing slugs → Certification Scheme.name (scheme_code).
_SCHEME_ALIASES = {
    "iso9001": "ISO9001-QMS",
    "iso-9001": "ISO9001-QMS",
    "iso9001-qms": "ISO9001-QMS",
    "iso22000": "ISO22000-FSMS",
    "iso-22000": "ISO22000-FSMS",
    "haccp": "HACCP-SZNS",
    "product": "SZNS-PRODUCT",
    "szns-product": "SZNS-PRODUCT",
    "ingelo": "INGELO-MSME",
    "iso14001": "ISO14001-EMS",
    "iso-14001": "ISO14001-EMS",
    "iso45001": "ISO45001-OHS",
    "iso-45001": "ISO45001-OHS",
}


def _ensure_certification_applicant_role() -> None:
    """Staff/citizen accounts used on the Service Portal often lack this role — grant it."""
    user = frappe.session.user
    if not user or user in ("Guest",):
        return
    if "Certification Applicant" in frappe.get_roles(user):
        return
    if frappe.db.exists("Has Role", {"parent": user, "role": "Certification Applicant"}):
        frappe.clear_cache(user=user)
        return
    frappe.get_doc(
        {
            "doctype": "Has Role",
            "parent": user,
            "parenttype": "User",
            "parentfield": "roles",
            "role": "Certification Applicant",
        }
    ).insert(ignore_permissions=True)
    frappe.clear_cache(user=user)


def _can_create_certification_application() -> bool:
    """Desk DocPerm create, or signed-in public self-service audience."""
    _ensure_certification_applicant_role()
    if frappe.has_permission("Certification Application", "create"):
        return True
    user = frappe.session.user
    if not user or user in ("Guest",):
        return False
    return bool(_PUBLIC_APPLY_ROLES & set(frappe.get_roles(user)))


def _resolve_scheme(scheme: str) -> str:
    """Map portal slug / loose code to Certification Scheme name."""
    raw = (scheme or "").strip()
    if not raw:
        return raw
    if frappe.db.exists("Certification Scheme", raw):
        return raw
    key = raw.lower().replace(" ", "").replace("_", "-")
    alias = _SCHEME_ALIASES.get(key) or _SCHEME_ALIASES.get(raw.lower())
    if alias and frappe.db.exists("Certification Scheme", alias):
        return alias
    # scheme_code is stored uppercased
    upper = raw.upper()
    if frappe.db.exists("Certification Scheme", upper):
        return upper
    return raw


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


@frappe.whitelist(allow_guest=True)
def list_schemes() -> dict:
    """Public catalogue for GET /api/certification/schemes."""
    from eswasa_certification.schemes import active_schemes

    return {"items": active_schemes()}


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

    # Self-service: Citizen / Certification Applicant may open their own application.
    # Desk roles keep full DocPerm create. Guest never. Missing applicant role is granted.
    if not _can_create_certification_application():
        frappe.throw(
            _("Not permitted to create Certification Application"),
            frappe.PermissionError,
        )

    scheme = _resolve_scheme(scheme)
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

    # _persist uses db_insert which bypasses on_submit / on_update lifecycle.
    # Fire R-C1 explicitly so ToDos + email + feed are emitted immediately.
    from eswasa_certification.rules import rc1_application_submitted

    if not getattr(doc, "flags", None):
        doc.flags = frappe._dict()
    rc1_application_submitted(doc, "create_application")
    doc.flags["rc1_done"] = True  # guard so a later on_submit won't double-fire
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
    out = serialize_application(doc.as_dict())
    quote = None
    if doc.get("quotation") or doc.workflow_state in ("Quoted", "Assessment"):
        try:
            quote = _quote_for_app(doc.name)
        except Exception:
            quote = None
    if quote:
        if doc.get("quotation_pdf_url"):
            quote["pdf_url"] = doc.quotation_pdf_url
        if doc.get("quotation_pdf_key"):
            quote["pdf_key"] = doc.quotation_pdf_key
        out["quote"] = quote
    return out


@frappe.whitelist()
def set_quotation_pdf(
    name: str,
    media_key: str,
    pdf_url: str | None = None,
) -> dict:
    """Persist S3 media key/URL on the application after Core uploads the PDF."""
    if not name or not media_key or str(media_key).strip() in ("", "NULL", "None"):
        frappe.throw(_("name and media_key are required"), frappe.ValidationError)
    if not frappe.db.exists("Certification Application", name):
        frappe.throw(_("Application {0} not found").format(name), frappe.DoesNotExistError)
    updates: dict[str, Any] = {}
    meta = frappe.get_meta("Certification Application")
    if meta.has_field("quotation_pdf_key"):
        updates["quotation_pdf_key"] = media_key
    if meta.has_field("quotation_pdf_url") and pdf_url:
        updates["quotation_pdf_url"] = pdf_url
    if updates:
        frappe.db.set_value("Certification Application", name, updates, update_modified=False)
        frappe.db.commit()
    return {"id": name, **updates}


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

    # Scope to the user's own applications when they are a citizen / applicant
    # and NOT a staff role (Officer, Manager, Auditor, System Manager).
    user = frappe.session.user
    if user and user not in ("Guest", "Administrator"):
        roles = set(frappe.get_roles(user))
        staff_roles = {
            "Certification Officer",
            "Certification Manager",
            "Certification Auditor",
            "System Manager",
        }
        if not (roles & staff_roles):
            filters["owner"] = user

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


def _flow_for_scheme(scheme: str | None) -> str:
    s = (scheme or "").lower()
    if "ingelo" in s:
        return "ingelo"
    if "combined" in s or "+" in s:
        return "combined"
    if "product" in s or "mark" in s or "permit" in s or "sans" in s:
        return "product"
    return "ms"


def _iso(val) -> str | None:
    if not val:
        return None
    try:
        return str(val)
    except Exception:
        return None


def _quotation_lines(quot_name: str) -> tuple[list[dict[str, Any]], float]:
    if not quot_name or not frappe.db.exists("Quotation", quot_name):
        return [], 0.0
    rows = frappe.get_all(
        "Quotation Item",
        filters={"parent": quot_name},
        fields=["description", "item_name", "rate", "amount", "qty"],
        order_by="idx asc",
    )
    lines = [
        {
            "label": (r.description or r.item_name or "Fee").strip(),
            "amount": float(r.amount or (float(r.rate or 0) * float(r.qty or 1))),
        }
        for r in rows
    ]
    total = float(frappe.db.get_value("Quotation", quot_name, "grand_total") or 0)
    if not total:
        total = sum(l["amount"] for l in lines)
    return lines, total


def _serialize_desk_quote(
    *,
    qid: str,
    status: str,
    flow: str,
    org: str,
    contact: str,
    contact_email: str,
    standards: str,
    scope: str,
    requested_at: str | None,
    phone: str | None = None,
    employees: str | None = None,
    sites: str | None = None,
    issued_at: str | None = None,
    valid_until: str | None = None,
    lines: list[dict[str, Any]] | None = None,
    total: float | None = None,
    application_id: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": qid,
        "status": status,
        "flow": flow if flow in ("ms", "product", "ingelo", "combined") else "ms",
        "org": org or contact or qid,
        "contact": contact or org or "",
        "contact_email": contact_email or "",
        "standards": standards or "",
        "scope": scope or "",
        "requested_at": requested_at or str(nowdate()),
    }
    if phone:
        out["phone"] = phone
    if employees:
        out["employees"] = employees
    if sites:
        out["sites"] = sites
    if issued_at:
        out["issued_at"] = issued_at
    if valid_until:
        out["valid_until"] = valid_until
    if lines is not None:
        out["lines"] = lines
    if total is not None:
        out["total"] = total
    if application_id:
        out["application_id"] = application_id
    if notes:
        out["notes"] = notes
    return out


@frappe.whitelist()
def list_quotes(limit: int = 100) -> dict:
    """Desk Quotes queue: Assessment apps awaiting quote + issued Quotation links + RFQ drafts."""
    if not frappe.has_permission("Certification Application", "read") and not frappe.has_permission(
        "Quotation", "read"
    ):
        frappe.throw(_("Not permitted to read quotes"), frappe.PermissionError)

    lim = cint(limit) or 100
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    # Assessment / Quoted (normal path) plus Audit Scheduled with no Quotation yet
    # (legacy checklist skipped Quote → schedule_audit).
    app_filters = [
        ["workflow_state", "in", ["Assessment", "Quoted", "Audit Scheduled"]],
    ]
    apps = frappe.get_all(
        "Certification Application",
        filters=app_filters,
        fields=[
            "name",
            "scheme",
            "standard_ref",
            "applicant_name",
            "applicant_org",
            "contact_email",
            "contact_phone",
            "site_address",
            "workflow_state",
            "quotation",
            "creation",
            "modified",
            "assessment_notes",
        ],
        order_by="modified desc",
        limit_page_length=lim,
    )
    # Also surface apps that already have a Quotation but moved past Quoted.
    extra = frappe.get_all(
        "Certification Application",
        filters=[["quotation", "!=", ""]],
        fields=[
            "name",
            "scheme",
            "standard_ref",
            "applicant_name",
            "applicant_org",
            "contact_email",
            "contact_phone",
            "site_address",
            "workflow_state",
            "quotation",
            "creation",
            "modified",
            "assessment_notes",
        ],
        order_by="modified desc",
        limit_page_length=lim,
    )
    by_name = {a.name: a for a in apps}
    for a in extra:
        by_name.setdefault(a.name, a)

    for a in by_name.values():
        org = a.applicant_org or a.applicant_name or a.name
        standards = a.standard_ref or a.scheme or ""
        qname = a.quotation
        if qname and frappe.db.exists("Quotation", qname):
            lines, total = _quotation_lines(qname)
            valid = frappe.db.get_value("Quotation", qname, "valid_till")
            status = "issued"
            if a.workflow_state not in ("Assessment", "Quoted", "Application"):
                status = "accepted"
            qid = qname
            item = _serialize_desk_quote(
                qid=qid,
                status=status,
                flow=_flow_for_scheme(a.scheme),
                org=org,
                contact=a.applicant_name or org,
                contact_email=a.contact_email or "",
                phone=a.contact_phone,
                standards=standards,
                scope=a.site_address or "",
                requested_at=_iso(a.creation),
                issued_at=_iso(a.modified),
                valid_until=_iso(valid),
                lines=lines,
                total=total,
                application_id=a.name,
                notes=a.assessment_notes,
            )
            pdf_url = frappe.db.get_value("Certification Application", a.name, "quotation_pdf_url")
            pdf_key = frappe.db.get_value("Certification Application", a.name, "quotation_pdf_key")
            if pdf_url:
                item["pdf_url"] = pdf_url
            if pdf_key:
                item["pdf_key"] = pdf_key
        elif a.workflow_state == "Quoted":
            item = _serialize_desk_quote(
                qid=a.name,
                status="issued",
                flow=_flow_for_scheme(a.scheme),
                org=org,
                contact=a.applicant_name or org,
                contact_email=a.contact_email or "",
                phone=a.contact_phone,
                standards=standards,
                scope=a.site_address or "",
                requested_at=_iso(a.creation),
                issued_at=_iso(a.modified),
                application_id=a.name,
            )
        else:
            # Assessment — awaiting staff quote
            item = _serialize_desk_quote(
                qid=a.name,
                status="requested",
                flow=_flow_for_scheme(a.scheme),
                org=org,
                contact=a.applicant_name or org,
                contact_email=a.contact_email or "",
                phone=a.contact_phone,
                standards=standards,
                scope=a.site_address or "",
                requested_at=_iso(a.creation),
                application_id=a.name,
            )
        if item["id"] not in seen:
            seen.add(item["id"])
            items.append(item)

    # Citizen RFQs stored as draft Quotation with title "Cert RFQ …"
    if frappe.db.exists("DocType", "Quotation") and frappe.has_permission("Quotation", "read"):
        rfqs = frappe.get_all(
            "Quotation",
            filters={"title": ("like", "Cert RFQ%"), "docstatus": ("<", 2)},
            fields=[
                "name",
                "title",
                "party_name",
                "customer_name",
                "transaction_date",
                "valid_till",
                "grand_total",
                "terms",
                "docstatus",
                "creation",
                "modified",
            ],
            order_by="modified desc",
            limit_page_length=lim,
        )
        for q in rfqs:
            if q.name in seen:
                continue
            # Prefer public QTE id embedded in title: "Cert RFQ QTE-… — Org"
            qid = q.name
            title = q.title or ""
            for part in title.split():
                if part.startswith("QTE-"):
                    qid = part
                    break
            lines, total = _quotation_lines(q.name)
            status = "issued" if cint(q.docstatus) == 1 else "requested"
            meta: dict[str, Any] = {}
            if q.terms and q.terms.strip().startswith("{"):
                try:
                    meta = json.loads(q.terms)
                except Exception:
                    meta = {}
            item = _serialize_desk_quote(
                qid=qid,
                status=status,
                flow=str(meta.get("flow") or "ms"),
                org=str(meta.get("org") or q.customer_name or q.party_name or qid),
                contact=str(meta.get("contact") or meta.get("org") or ""),
                contact_email=str(meta.get("email") or ""),
                phone=str(meta.get("phone") or "") or None,
                standards=str(meta.get("standards") or ""),
                scope=str(meta.get("scope") or ""),
                employees=str(meta.get("employees") or "") or None,
                sites=str(meta.get("sites") or "") or None,
                requested_at=_iso(q.creation),
                issued_at=_iso(q.modified) if status == "issued" else None,
                valid_until=_iso(q.valid_till),
                lines=lines or None,
                total=total or float(q.grand_total or 0) or None,
                notes=str(meta.get("comments") or "") or None,
            )
            # Keep ERPNext name discoverable for issue
            item["quotation"] = q.name
            seen.add(qid)
            seen.add(q.name)
            items.append(item)

    items.sort(key=lambda x: x.get("requested_at") or "", reverse=True)
    return {"items": items[:lim]}


@frappe.whitelist()
def create_quote_request(
    org: str,
    email: str,
    confirm: bool | int | str = False,
    flow: str = "ms",
    contact: str | None = None,
    phone: str | None = None,
    standards: str | None = None,
    scope: str | None = None,
    employees: str | None = None,
    sites: str | None = None,
    comments: str | None = None,
    **extra: Any,
) -> dict:
    """Citizen RFQ from /certification/quote — draft ERPNext Quotation titled Cert RFQ QTE-…"""
    _require_confirm(confirm)
    if not org or not email:
        frappe.throw(_("org and email are required"), frappe.ValidationError)
    if not frappe.db.exists("DocType", "Quotation"):
        frappe.throw(_("Quotation DocType missing"), frappe.ValidationError)

    from eswasa_certification.rules import _ensure_customer, _ensure_cert_fee_item
    from frappe.utils import add_days

    qte_id = f"QTE-{frappe.generate_hash(length=5).upper()}"
    customer = _ensure_customer(org, email)
    if not customer:
        frappe.throw(_("Could not create customer for quote request"), frappe.ValidationError)

    company = frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value(
        "Company", {}, "name"
    )
    currency = (frappe.db.get_value("Company", company, "default_currency") if company else None) or "SZL"
    meta = {
        "flow": flow or "ms",
        "org": org,
        "contact": contact or org,
        "email": email,
        "phone": phone or "",
        "standards": standards or "",
        "scope": scope or "",
        "employees": employees or "",
        "sites": sites or "",
        "comments": comments or "",
        **{k: v for k, v in extra.items() if isinstance(v, (str, int, float, bool))},
    }
    item_code = _ensure_cert_fee_item()
    payload: dict[str, Any] = {
        "doctype": "Quotation",
        "quotation_to": "Customer",
        "party_name": customer,
        "company": company,
        "currency": currency,
        "transaction_date": nowdate(),
        "valid_till": add_days(nowdate(), 30),
        "order_type": "Sales",
        "title": f"Cert RFQ {qte_id} — {org}"[:140],
        "terms": json.dumps(meta),
        "items": [
            {
                "item_code": item_code,
                "qty": 1,
                "rate": 0,
                "description": f"RFQ placeholder — {standards or flow}",
            }
        ],
    }
    price_list = (
        "Standard Selling"
        if frappe.db.exists("Price List", "Standard Selling")
        else frappe.db.get_value("Price List", {"selling": 1}, "name")
    )
    if price_list:
        payload["selling_price_list"] = price_list
        payload["price_list_currency"] = currency
        payload["plc_conversion_rate"] = 1
    quot = frappe.get_doc(payload)
    quot.flags.ignore_permissions = True
    quot.insert(ignore_permissions=True)

    return _serialize_desk_quote(
        qid=qte_id,
        status="requested",
        flow=str(flow or "ms"),
        org=org,
        contact=contact or org,
        contact_email=email,
        phone=phone,
        standards=standards or "",
        scope=scope or "",
        employees=employees,
        sites=sites,
        requested_at=_iso(quot.creation),
        notes=comments,
    )


@frappe.whitelist()
def issue_quote(
    name: str,
    confirm: bool | int | str = False,
    lines: list | str | None = None,
    valid_days: int = 30,
    notes: str | None = None,
) -> dict:
    """Issue fees: Application → issue_quotation act, or RFQ Quotation → update lines + submit."""
    _require_confirm(confirm)
    from frappe.utils import add_days

    if isinstance(lines, str):
        try:
            lines = json.loads(lines)
        except Exception:
            lines = []
    lines = lines or []

    # Resolve QTE-… title back to Quotation name
    quot_name = None
    app_name = None
    if frappe.db.exists("Certification Application", name):
        app_name = name
    elif frappe.db.exists("Quotation", name):
        quot_name = name
    else:
        quot_name = frappe.db.get_value("Quotation", {"title": ("like", f"%{name}%")}, "name")

    if app_name:
        from eswasa_certification.workflow_act import act

        doc = frappe.get_doc("Certification Application", app_name)
        if doc.workflow_state == "Assessment":
            act(
                doctype="Certification Application",
                name=app_name,
                action="issue_quotation",
                expected_state="Assessment",
                confirm=True,
            )
            doc.reload()
        elif not doc.get("quotation"):
            from eswasa_certification.rules import rc_issue_quotation

            rc_issue_quotation(doc)
            doc.reload()
        # Optionally overlay custom lines onto the Quotation
        if lines and doc.get("quotation"):
            _replace_quotation_lines(doc.quotation, lines, valid_days, notes)
        return _quote_for_app(doc.name)

    if not quot_name:
        frappe.throw(_("Quote {0} not found").format(name), frappe.DoesNotExistError)

    _replace_quotation_lines(quot_name, lines, valid_days, notes)
    quot = frappe.get_doc("Quotation", quot_name)
    if cint(quot.docstatus) == 0:
        try:
            quot.flags.ignore_permissions = True
            quot.submit()
        except Exception:
            pass
    # Re-list single
    for item in list_quotes(limit=200)["items"]:
        if item.get("id") == name or item.get("quotation") == quot_name or item.get("id") == quot_name:
            return item
    lines_out, total = _quotation_lines(quot_name)
    return _serialize_desk_quote(
        qid=name,
        status="issued",
        flow="ms",
        org=quot.customer_name or quot.party_name or name,
        contact=quot.customer_name or "",
        contact_email="",
        standards="",
        scope="",
        requested_at=_iso(quot.creation),
        issued_at=_iso(nowdate()),
        valid_until=_iso(quot.valid_till),
        lines=lines_out,
        total=total,
        notes=notes,
    )


def _replace_quotation_lines(
    quot_name: str,
    lines: list,
    valid_days: int = 30,
    notes: str | None = None,
) -> None:
    from eswasa_certification.rules import _ensure_cert_fee_item
    from frappe.utils import add_days

    if not lines:
        return
    quot = frappe.get_doc("Quotation", quot_name)
    if cint(quot.docstatus) == 1:
        try:
            quot.cancel()
            quot = frappe.copy_doc(quot)
            quot.insert(ignore_permissions=True)
            quot_name = quot.name
            quot = frappe.get_doc("Quotation", quot_name)
        except Exception:
            return
    item_code = _ensure_cert_fee_item()
    quot.set("items", [])
    for row in lines:
        label = (row.get("label") if isinstance(row, dict) else "") or "Fee"
        amount = float((row.get("amount") if isinstance(row, dict) else 0) or 0)
        quot.append(
            "items",
            {
                "item_code": item_code,
                "qty": 1,
                "rate": amount,
                "description": label,
            },
        )
    quot.valid_till = add_days(nowdate(), cint(valid_days) or 30)
    if notes:
        # Preserve RFQ meta JSON in terms if present
        if quot.terms and quot.terms.strip().startswith("{"):
            try:
                meta = json.loads(quot.terms)
                meta["staff_notes"] = notes
                quot.terms = json.dumps(meta)
            except Exception:
                quot.terms = notes
        else:
            quot.terms = notes
    quot.flags.ignore_permissions = True
    quot.save(ignore_permissions=True)


def _quote_for_app(app_name: str) -> dict:
    for item in list_quotes(limit=200)["items"]:
        if item.get("application_id") == app_name:
            return item
    doc = frappe.get_doc("Certification Application", app_name)
    return _serialize_desk_quote(
        qid=doc.get("quotation") or doc.name,
        status="issued",
        flow=_flow_for_scheme(doc.scheme),
        org=doc.applicant_org or doc.applicant_name or doc.name,
        contact=doc.applicant_name or "",
        contact_email=doc.contact_email or "",
        standards=doc.standard_ref or doc.scheme or "",
        scope=doc.site_address or "",
        requested_at=_iso(doc.creation),
        application_id=doc.name,
    )


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
