"""Workflow act pipeline — map §5.2 / L1–L4 / L7 (Certification first).

Guards live in Frappe so Desk buttons and Core `/act` share the same path.
Core only passes values through.
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from eswasa_certification.workflow_map import (
    normalize_action,
    next_state,
    serialize_application,
    workflow_action_label,
)

# Actions that require a non-empty reason (map §1.2 #4 / L*).
_REASON_ACTIONS = frozenset(
    {
        "withdraw",
        "reject",
        "return",
        "reassign",
        "suspend",
        "cancel",
        "override",
        "return to draft",
        "return_to_draft",
    }
)

_IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 3600  # L4 — 7 days

# DocTypes handled by this pipeline (expand as other apps adopt).
_SUPPORTED = frozenset(
    {
        "Certification Application",
        "Work Item",
        "Calibration Job",
        "TBT Notification",
        "Board Resolution",
        "Board Pack",
        "Field Visit",
        "Sample",
    }
)


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return bool(cint(value))


def _require_confirm(confirm: Any) -> None:
    if not _as_bool(confirm):
        frappe.throw(
            _("Mutation requires confirm=true (confirm-before-commit)."),
            frappe.ValidationError,
        )


def _idem_cache_key(doctype: str, name: str, user: str, key: str) -> str:
    return f"eswasa:idem:{user}:{doctype}:{name}:{key}"


def _load_idempotent(doctype: str, name: str, key: str | None) -> dict | None:
    if not key:
        return None
    user = frappe.session.user
    cached = frappe.cache().get_value(_idem_cache_key(doctype, name, user, key))
    if not cached:
        return None
    if isinstance(cached, (bytes, str)):
        return json.loads(cached)
    return cached


def _store_idempotent(doctype: str, name: str, key: str | None, result: dict) -> None:
    if not key:
        return
    user = frappe.session.user
    frappe.cache().set_value(
        _idem_cache_key(doctype, name, user, key),
        json.dumps(result),
        expires_in_sec=_IDEMPOTENCY_TTL_SECONDS,
    )


def _bump_transition_seq(doc) -> int:
    """Increment transition_seq if the field exists; else track via Comment count."""
    meta = frappe.get_meta(doc.doctype)
    if meta.has_field("transition_seq"):
        seq = cint(doc.get("transition_seq") or 0) + 1
        doc.transition_seq = seq
        return seq
    # Fallback: count prior workflow comments + 1
    n = frappe.db.count(
        "ToDo",
        {"reference_type": doc.doctype, "reference_name": doc.name},
    )
    return n + 1


def _close_open_todos(doctype: str, name: str) -> None:
    """L2 — close previous open ToDos for this document (same transaction)."""
    rows = frappe.get_all(
        "ToDo",
        filters={
            "reference_type": doctype,
            "reference_name": name,
            "status": "Open",
        },
        pluck="name",
    )
    for todo_name in rows:
        frappe.db.set_value("ToDo", todo_name, "status", "Closed", update_modified=False)


def _create_todo(
    doctype: str,
    name: str,
    state: str,
    transition_seq: int,
    role: str | None,
) -> None:
    """L1 — create the inbox ToDo in the same transaction as the state change."""
    key = f"{doctype}:{name}:{state}:{transition_seq}"
    exists = frappe.db.exists(
        "ToDo",
        {
            "reference_type": doctype,
            "reference_name": name,
            "status": "Open",
            "description": ("like", f"%[{key}]%"),
        },
    )
    if exists:
        return
    todo = frappe.get_doc(
        {
            "doctype": "ToDo",
            "description": f"[{key}] Workflow: {doctype} {name} → {state}",
            "reference_type": doctype,
            "reference_name": name,
            "status": "Open",
            "priority": "Medium",
            "role": role,
            "date": frappe.utils.add_days(frappe.utils.nowdate(), 3),
        }
    )
    todo.flags.ignore_permissions = True
    todo.insert(ignore_permissions=True)


def _outbox_row(doctype: str, name: str, state: str, rule: str, payload: dict) -> None:
    """L1 — write an outbox row in-txn; external delivery after commit (L5)."""
    try:
        from eswasa_governance.outbox import enqueue, schedule_delivery

        entry = enqueue(doctype, name, state, rule, payload)
        # Stash for after-commit schedule (same request).
        frappe.flags.eswasa_outbox_entry = entry
    except Exception:
        # Fallback Comment marker if governance outbox unavailable.
        feed_key = f"{doctype}:{name}:{state}:{rule}"
        comment = frappe.get_doc(
            {
                "doctype": "Comment",
                "comment_type": "Info",
                "reference_doctype": doctype,
                "reference_name": name,
                "content": f"[eswasa_outbox] {feed_key} {json.dumps(payload)[:500]}",
            }
        )
        comment.set_new_name()
        comment.db_insert()


def _reason_required(action: str) -> bool:
    return normalize_action(action) in _REASON_ACTIONS or normalize_action(action).startswith(
        "withdraw"
    )


def validate_transition_guards(
    *,
    doctype: str,
    current_state: str,
    action: str,
    expected_state: str | None,
    reason: str | None,
) -> None:
    """Pure-ish guards (also used from unit tests with no DB)."""
    if doctype not in _SUPPORTED:
        frappe.throw(
            _("Workflow act not supported for {0}").format(doctype),
            frappe.ValidationError,
        )
    if expected_state is not None and expected_state != "" and expected_state != current_state:
        frappe.throw(
            _(
                "expected_state mismatch: document is {0}, client sent {1}"
            ).format(current_state, expected_state),
            frappe.ValidationError,
        )
    if _reason_required(action) and not (reason or "").strip():
        frappe.throw(
            _("reason is required for action {0}").format(action),
            frappe.ValidationError,
        )


def _owner_role_for_state(state: str) -> str | None:
    # Mirrors registry port owner roles (Certification Application).
    mapping = {
        "Application": "Certification Officer",
        "Assessment": "Certification Officer",
        "Audit Scheduled": "Certification Officer",
        "Audit": "Certification Auditor",
        "NC Resolution": "Certification Officer",
        "Certified": "Certification Manager",
        "Surveillance": "Certification Officer",
        "Renewal": "Certification Officer",
        "Withdraw": None,
    }
    return mapping.get(state)


def _apply_side_effects(doc, target: str) -> None:
    """Best-effort domain side effects (existing advance_state behaviour)."""
    if target == "Assessment":
        from eswasa_certification.rules import rc1_application_submitted

        try:
            rc1_application_submitted(doc)
        except Exception:
            frappe.log_error(title="eswasa_certification R-C1 from act failed")
    if target == "Audit Scheduled" and doc.get("assigned_auditor"):
        from eswasa_certification.api import _ensure_planned_audit

        _ensure_planned_audit(doc)
    if target == "NC Resolution":
        frappe.db.set_value(
            doc.doctype,
            doc.name,
            {"nc_open": 1, "certificate_blocked": 1},
            update_modified=False,
        )
    if target == "Certified":
        from eswasa_certification.api import _ensure_certificate_stub

        _ensure_certificate_stub(doc)


def _persist(doc, *, insert: bool = False):
    from eswasa_certification.api import _persist as api_persist

    return api_persist(doc, insert=insert)


@frappe.whitelist()
def act(
    doctype: str | None = None,
    name: str | None = None,
    action: str | None = None,
    expected_state: str | None = None,
    idempotency_key: str | None = None,
    reason: str | None = None,
    comment: str | None = None,
    confirm: bool | int | str = False,
    payload: str | dict | None = None,
) -> dict:
    """Generic workflow act (map §1.2 / §5.2). Certification Application first."""
    _ensure_wrapped()
    _require_confirm(confirm)
    doctype = (doctype or "Certification Application").strip()
    name = (name or "").strip()
    action = (action or "").strip()
    if not name:
        frappe.throw(_("name is required"), frappe.ValidationError)
    if not action:
        frappe.throw(_("action is required"), frappe.ValidationError)

    if not frappe.has_permission(doctype, "write"):
        frappe.throw(_("Not permitted to update {0}").format(doctype), frappe.PermissionError)

    if not frappe.db.exists(doctype, name):
        frappe.throw(_("{0} {1} not found").format(doctype, name), frappe.DoesNotExistError)

    # L4 — replay returns original result
    prior = _load_idempotent(doctype, name, idempotency_key)
    if prior is not None:
        return prior

    doc = frappe.get_doc(doctype, name)
    current = doc.get("workflow_state") or "Application"

    validate_transition_guards(
        doctype=doctype,
        current_state=current,
        action=action,
        expected_state=expected_state,
        reason=reason,
    )

    try:
        if doctype == "Certification Application":
            target = next_state(current, action)
            label = workflow_action_label(action)
        else:
            from frappe.model.workflow import get_transitions

            label = action
            transitions = get_transitions(doc) or []
            match = None
            for t in transitions:
                ta = (t.get("action") or "").strip()
                if ta.lower() == action.lower() or ta.lower() == action.lower().replace(
                    "_", " "
                ):
                    match = t
                    label = ta
                    break
            if not match:
                # try apply with raw action label
                match = next(
                    (
                        t
                        for t in transitions
                        if (t.get("action") or "").lower().replace(" ", "_")
                        == normalize_action(action)
                    ),
                    None,
                )
                if match:
                    label = match.get("action")
            if not match:
                frappe.throw(
                    _("Action {0} not available from state {1}").format(action, current),
                    frappe.ValidationError,
                )
            target = match.get("next_state") or current
    except ValueError as exc:
        frappe.throw(str(exc), frappe.ValidationError)

    # Prefer real Frappe apply_workflow (Desk-compatible); fall back to direct set.
    applied = False
    try:
        from frappe.model.workflow import apply_workflow as _fw_apply

        # apply_workflow expects the Workflow Action Master label
        _fw_apply(doc, label)
        applied = True
        doc.reload()
    except Exception:
        doc.workflow_state = target
        doc = _persist(doc, insert=False)

    if not applied and doc.get("workflow_state") != target:
        doc.workflow_state = target
        doc = _persist(doc, insert=False)

    seq = _bump_transition_seq(doc)
    if hasattr(doc, "transition_seq") and frappe.get_meta(doctype).has_field("transition_seq"):
        frappe.db.set_value(doctype, name, "transition_seq", seq, update_modified=False)

    note = comment or reason
    if note:
        try:
            c = frappe.get_doc(
                {
                    "doctype": "Comment",
                    "comment_type": "Workflow",
                    "reference_doctype": doctype,
                    "reference_name": name,
                    "content": note,
                }
            )
            c.set_new_name()
            c.db_insert()
        except Exception:
            pass

    _close_open_todos(doctype, name)
    if target != "Withdraw" and target != "Adopted":
        role = _owner_role_for_state(target) if doctype == "Certification Application" else None
        _create_todo(doctype, name, target, seq, role)

    _outbox_row(
        doctype,
        name,
        target,
        "act",
        {"action": action, "from": current, "to": target, "at": str(now_datetime())},
    )

    if doctype == "Certification Application":
        _apply_side_effects(doc, target)

    try:
        from eswasa_certification.api import _audit_log

        _audit_log(
            "act",
            doctype,
            name,
            f"{current} --{action}--> {target}"
            + (f" | {note}" if note else "")
            + (f" | idem={idempotency_key}" if idempotency_key else ""),
        )
    except Exception:
        pass

    # Commit once; external side effects enqueue after commit (L1/L5).
    frappe.db.commit()

    try:
        from eswasa_governance.outbox import schedule_delivery

        schedule_delivery(
            frappe.flags.get("eswasa_outbox_entry"),
            after_commit=False,
        )
    except Exception:
        try:
            frappe.enqueue(
                "eswasa_certification.workflow_act.deliver_outbox_stub",
                doctype=doctype,
                name=name,
                state=target,
            )
        except Exception:
            pass

    try:
        frappe.publish_realtime(
            "eswasa_feed",
            {
                "doctype": doctype,
                "name": name,
                "state": target,
                "action": action,
            },
        )
    except Exception:
        pass

    doc.reload()
    if doctype == "Certification Application":
        result = serialize_application(doc.as_dict())
    else:
        result = doc.as_dict()

    _store_idempotent(doctype, name, idempotency_key, result)
    return result


def deliver_outbox_stub(doctype: str, name: str, state: str) -> None:
    """L5 placeholder — real email/PDF/Pastel handlers plug in here."""
    frappe.logger("eswasa_certification").info(
        f"outbox deliver {doctype}:{name}:{state}"
    )


# --- Desk path: wrap apply_workflow so buttons hit the same guards ----------

_original_apply_workflow = None


def _ensure_wrapped() -> None:
    global _original_apply_workflow
    if _original_apply_workflow is not None:
        return
    import frappe.model.workflow as wf

    _original_apply_workflow = wf.apply_workflow

    def _guarded(doc, action):
        doctype = getattr(doc, "doctype", None) or doc.get("doctype")
        if doctype in _SUPPORTED:
            current = doc.get("workflow_state")
            # Desk has no expected_state; still require reason on withdraw.
            if _reason_required(action):
                reason = frappe.flags.get("workflow_action_reason") or frappe.form_dict.get(
                    "reason"
                )
                if not (reason or "").strip():
                    frappe.throw(
                        _("reason is required for action {0}").format(action),
                        frappe.ValidationError,
                    )
            result = _original_apply_workflow(doc, action)
            # Sync ToDo after Desk transition
            try:
                name = doc.get("name")
                new_state = frappe.db.get_value(doctype, name, "workflow_state")
                _close_open_todos(doctype, name)
                if new_state and new_state != "Withdraw":
                    seq = _bump_transition_seq(doc)
                    _create_todo(doctype, name, new_state, seq, _owner_role_for_state(new_state))
            except Exception:
                frappe.log_error(title="eswasa_certification desk ToDo sync failed")
            return result
        return _original_apply_workflow(doc, action)

    wf.apply_workflow = _guarded


def boot_workflow_guards() -> None:
    """Called from hooks after_migrate / after_install."""
    try:
        _ensure_wrapped()
    except Exception:
        frappe.log_error(title="eswasa_certification workflow guard wrap failed")
