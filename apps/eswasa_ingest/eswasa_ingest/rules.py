"""Ingest business rule R-T3 — curation gate.

Ingested Document status = needs-review (Pending Review) → Curation Task
assigned to Ingest Curator / Info Officer pool. Not authoritative until
Approved (blocks public surfacing).
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import now_datetime

FEED_REALTIME_EVENT = "eswasa_feed"

# Status values that mean "needs review" (OpenAPI / pipeline wording varies).
_NEEDS_REVIEW = {"pending review", "needs-review", "needs review", "needs_review"}
_CURATOR_ROLES = (
    "Ingest Curator",
    "Info & Documentation Officer",
    "Info Officer",
)


def _log(title: str, detail: str = "") -> None:
    try:
        frappe.logger("eswasa_ingest").info(f"{title}: {detail}")
    except Exception:
        pass
    try:
        frappe.log_error(message=detail or title, title=f"[ingest] {title}"[:140])
    except Exception:
        pass


def _comment(doctype: str, name: str, content: str) -> None:
    try:
        comment = frappe.get_doc(
            {
                "doctype": "Comment",
                "comment_type": "Info",
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
        "source": "eswasa_ingest",
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


def needs_review(status: str | None) -> bool:
    return (status or "").strip().lower() in _NEEDS_REVIEW


def is_authoritative(status: str | None) -> bool:
    """Public surfacing only when Approved."""
    return (status or "").strip().lower() == "approved"


def _pick_assignee() -> str | None:
    """First enabled user with a curator / Info Officer role."""
    for role in _CURATOR_ROLES:
        if not frappe.db.exists("Role", role):
            continue
        rows = frappe.get_all(
            "Has Role",
            filters={"role": role, "parenttype": "User"},
            fields=["parent"],
            limit_page_length=20,
        )
        for row in rows:
            user = row.parent
            if user in ("Administrator", "Guest"):
                continue
            enabled = frappe.db.get_value("User", user, "enabled")
            if enabled:
                return user
    return None


def _assign_role_todo(*, doctype: str, name: str, role: str, description: str) -> None:
    if not frappe.db.exists("Role", role):
        return
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
        frappe.get_doc(
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
        ).insert(ignore_permissions=True)
    except Exception:
        _log("assign_todo_failed", f"{doctype} {name} → {role}")


def _ensure_curation_task(doc) -> str | None:
    if not frappe.db.exists("DocType", "Curation Task"):
        return None
    existing = frappe.db.get_value(
        "Curation Task",
        {"document": doc.name, "status": ("in", ["Open", "In Progress"])},
        "name",
    )
    if existing:
        return existing

    assignee = _pick_assignee()
    try:
        task = frappe.get_doc(
            {
                "doctype": "Curation Task",
                "title": f"Review: {(doc.get('title') or doc.name)[:100]}",
                "document": doc.name,
                "task_type": "Review",
                "priority": "Medium",
                "status": "Open",
                "assignee": assignee,
                "notes": (
                    "R-T3: auto-queued — document is not authoritative until Approved. "
                    "Blocks public surfacing in applicability / guides."
                ),
            }
        )
        task.insert(ignore_permissions=True)
        return task.name
    except Exception as exc:
        _log("curation_task_failed", f"{doc.name}: {exc}")
        return None


def rt3_needs_review(doc, method: str | None = None) -> dict[str, Any]:
    """R-T3: needs-review → Curation Task + role assignment; gate authoritative."""
    if not needs_review(doc.get("status")):
        return {"skipped": True, "reason": "not_needs_review"}

    task_name = _ensure_curation_task(doc)
    for role in _CURATOR_ROLES:
        _assign_role_todo(
            doctype=doc.doctype,
            name=doc.name,
            role=role,
            description=f"R-T3 curation: review {doc.name} before public surfacing",
        )

    # Marker comment for idempotent feed (only once)
    marker = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": doc.doctype,
            "reference_name": doc.name,
            "content": ("like", "%[rule:R-T3]%"),
        },
        limit_page_length=1,
    )
    if not marker:
        publish_feed(
            event="R-T3",
            subject=f"Curation queued: {doc.get('title') or doc.name}",
            reference_doctype=doc.doctype,
            reference_name=doc.name,
            detail=f"task={task_name}; status={doc.get('status')}",
            status="NEEDS_REVIEW",
        )
        _comment(
            doc.doctype,
            doc.name,
            f"[rule:R-T3] curation_task={task_name}; not authoritative until Approved",
        )

    return {"task": task_name, "authoritative": False}


def rt3_on_status_change(doc, method: str | None = None) -> None:
    """When Approved: close open curation tasks; when needs-review: queue."""
    if needs_review(doc.get("status")):
        rt3_needs_review(doc, method)
        return

    if not is_authoritative(doc.get("status")):
        return

    # Close open curation tasks for this document
    if frappe.db.exists("DocType", "Curation Task"):
        for name in frappe.get_all(
            "Curation Task",
            filters={"document": doc.name, "status": ("in", ["Open", "In Progress"])},
            pluck="name",
        ):
            frappe.db.set_value(
                "Curation Task", name, "status", "Done", update_modified=False
            )

    # Activate linked Market Requirements that were Draft from this doc
    if frappe.db.exists("DocType", "Market Requirement"):
        for mr in frappe.get_all(
            "Market Requirement",
            filters={"source_document": doc.name, "status": "Draft"},
            pluck="name",
        ):
            frappe.db.set_value(
                "Market Requirement", mr, "status", "Active", update_modified=False
            )

    publish_feed(
        event="R-T3",
        subject=f"Authoritative: {doc.get('title') or doc.name}",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        detail="Approved — public surfacing allowed",
        status="APPROVED",
    )


def validate_authoritative_gate(doc, method: str | None = None) -> None:
    """Ensure default status is Pending Review (never silently authoritative)."""
    if not doc.get("status"):
        doc.status = "Pending Review"
