"""
Module access requests (plan 02): a staff member who opens a module they can't use asks for access; HR reviews.

The portal's AccessDeniedPanel submits, AccessRequestsView lists and reviews, and the same review also shows as a
*do* card in Approvals (``decide`` below, registered in ``eswasa_approval_handlers``). Both paths call
``review_impl``. Responses use the screen's camelCase ``ModuleAccessRequest`` shape (hr/accessRequests.ts).

- ``MODULE_ROLES`` mirrors ``staff.ts`` ``ROUTE_ACCESS``; a test compares the two so they can't drift.
- Approval grants one role: the narrowest for the module (``GRANT_ROLE`` where the first listed role is a
  manager, else the first listed), never System Manager, Administrator or Desk User. **Provisional**: ESWASA
  hasn't confirmed which role each module should grant.
- Reviewers are HR Manager, HR User, System Manager or Administrator (the screen's ``canReviewAccessRequests``),
  never the requester. Rejecting needs a note.
- One ToDo per named HR Manager, never a role pool (brief §12.1).

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any

DOCTYPE = "Module Access Request"
ANY_STAFF = None
ADMIN_ROLES = ("System Manager", "Administrator", "Desk User")
REVIEWER_ROLES = ("HR Manager", "HR User", "System Manager", "Administrator")
STATUSES = {"pending": "Pending", "approved": "Approved", "rejected": "Rejected"}

# Mirrors portals/institution-portal/src/staff.ts ROUTE_ACCESS (None = any staff can open it).
MODULE_ROLES: dict[str, list[str] | None] = {
    "dashboard": ANY_STAFF,
    "approvals": ANY_STAFF,
    "me": ANY_STAFF,
    "team": ANY_STAFF,
    "field": ANY_STAFF,
    "board": ["Eswasa Board Secretary", "Eswasa Board Member", "Eswasa Risk Officer", "System Manager", "Administrator", "Desk User"],
    "crm": ["Sales User", "Sales Manager", "Certification Manager", "Certification Officer", "System Manager", "Administrator", "Desk User"],
    "certification": ["Certification Manager", "Certification Officer", "Certification Auditor", "System Manager", "Administrator", "Desk User"],
    "standards": ["Eswasa Standards Manager", "Eswasa Standards Officer", "Eswasa TC Member", "System Manager", "Administrator", "Desk User"],
    "metrology": ["Eswasa Metrology Manager", "Eswasa Metrology Officer", "Eswasa Metrology Reviewer", "System Manager", "Administrator", "Desk User"],
    "lms": ANY_STAFF,
    "tbt": ["Eswasa TBT Officer", "Eswasa TBT Analyst", "Eswasa Standards Officer", "System Manager", "Administrator", "Desk User"],
    "finance": ["Accounts User", "Accounts Manager", "System Manager", "Administrator"],
    "hr": ANY_STAFF,
    "marketing": ["Sales User", "Sales Manager", "System Manager", "Administrator", "Desk User"],
    "reports": ANY_STAFF,
    "admin": ["System Manager", "Administrator"],
}

# Provisional: where the first role listed is a manager or secretary, approval grants the officer/member role.
GRANT_ROLE = {
    "board": "Eswasa Board Member",
    "certification": "Certification Officer",
    "standards": "Eswasa Standards Officer",
    "metrology": "Eswasa Metrology Officer",
}


# ---------------------------------------------------------------- pure rules


def grant_role(module_id: str) -> str | None:
    """The one role approval adds, or None when the module can't be granted here."""
    roles = MODULE_ROLES.get(module_id)
    if not roles:
        return None
    pick = GRANT_ROLE.get(module_id)
    if pick in roles and pick not in ADMIN_ROLES:
        return pick
    return next((r for r in roles if r not in ADMIN_ROLES), None)


def submit_error(module_id: str, module_label: str | None, requester_roles: list[str]) -> str | None:
    label = (module_label or module_id or "").strip() or "this module"
    if module_id not in MODULE_ROLES:
        return "That module doesn't exist."
    roles = MODULE_ROLES[module_id]
    if roles is ANY_STAFF:
        return f"Everyone can open {label}."
    if set(requester_roles or ()) & set(roles):
        return f"You can already open {label}."
    if grant_role(module_id) is None:
        return f"Access to {label} is given by a System Manager, not by request."
    return None


def reviewer_error(reviewer: str, reviewer_roles: list[str], requester: str | None) -> str | None:
    """Who may review: HR or a System Manager, never the requester (four-eyes)."""
    if not set(reviewer_roles or ()) & set(REVIEWER_ROLES):
        return "Only HR or a System Manager can review access requests."
    if reviewer and reviewer == requester:
        return "You can't review your own access request."
    return None


def decision_error(decision: str, note: str | None) -> str | None:
    if decision not in ("approved", "rejected"):
        return "Approve or reject."
    if decision == "rejected" and not (note or "").strip():
        return "Say why you're not giving access. The requester sees your note."
    return None


def review_error(reviewer: str, reviewer_roles: list[str], requester: str | None, decision: str, note: str | None) -> str | None:
    return reviewer_error(reviewer, reviewer_roles, requester) or decision_error(decision, note)


def _iso(v: Any) -> str | None:
    if v in (None, ""):
        return None
    return str(v).replace(" ", "T", 1)


def to_api(r: dict[str, Any]) -> dict[str, Any]:
    """The screen's ModuleAccessRequest (camelCase); optional fields are left out when empty."""
    out: dict[str, Any] = {
        "id": r.get("name"),
        "moduleId": r.get("module_id"),
        "moduleLabel": r.get("module_label") or r.get("module_id"),
        "requesterUsername": r.get("requester"),
        "requesterName": r.get("requester_name") or r.get("requester"),
        "requesterEmail": r.get("requester_email") or "",
        "note": r.get("note") or "",
        "status": (r.get("status") or "Pending").lower(),
        "createdAt": _iso(r.get("creation")),
    }
    for key, src in (("reviewedAt", "reviewed_at"), ("reviewedBy", "reviewed_by"), ("reviewNote", "review_note"), ("rolesGranted", "roles_granted")):
        v = r.get(src)
        if v not in (None, ""):
            out[key] = _iso(v) if key == "reviewedAt" else v
    return out


# ---------------------------------------------------------------- Frappe glue

FIELDS = ["name", "module_id", "module_label", "requester", "requester_name", "requester_email", "note", "status",
          "creation", "reviewed_by", "reviewed_at", "review_note", "roles_granted"]


def _is_reviewer(roles: list[str] | None = None) -> bool:
    import frappe

    return bool(set(roles if roles is not None else frappe.get_roles()) & set(REVIEWER_ROLES))


def _get(name: str) -> dict[str, Any]:
    import frappe

    row = frappe.db.get_value(DOCTYPE, name, FIELDS, as_dict=True)
    if not row:
        frappe.throw("That access request doesn't exist.", frappe.DoesNotExistError)
    return dict(row)


def list_impl(status: str | None = None, module: str | None = None) -> list[dict[str, Any]]:
    """Reviewers get every request; everyone else gets their own."""
    import frappe

    filters: dict[str, Any] = {}
    if not _is_reviewer():
        filters["requester"] = frappe.session.user
    if status:
        key = str(status).strip().lower()
        if key not in STATUSES:
            frappe.throw("Status is pending, approved or rejected.", frappe.ValidationError)
        filters["status"] = STATUSES[key]
    if module:
        filters["module_id"] = module
    rows = frappe.get_all(DOCTYPE, filters=filters, fields=FIELDS, order_by="creation desc", limit=0)
    return [to_api(dict(r)) for r in rows]


def submit_impl(module_id: str, module_label: str | None = None, note: str | None = None) -> dict[str, Any]:
    """The requester is the session user. A pending request for the same module is returned, not duplicated."""
    import frappe
    from frappe.utils import add_days, nowdate

    from eswasa_hr.lifecycle import _route

    user = frappe.session.user
    if not user or user == "Guest":
        frappe.throw("Sign in to ask for access.", frappe.PermissionError)
    module_id = (module_id or "").strip()
    pending = frappe.db.get_value(DOCTYPE, {"requester": user, "module_id": module_id, "status": "Pending"}, "name")
    if pending:
        return to_api(_get(pending))
    err = submit_error(module_id, module_label, frappe.get_roles(user))
    if err:
        frappe.throw(err, frappe.ValidationError)
    u = frappe.db.get_value("User", user, ["full_name", "email"], as_dict=True) or {}
    label = (module_label or "").strip() or module_id
    doc = frappe.get_doc(
        {
            "doctype": DOCTYPE,
            "module_id": module_id,
            "module_label": label,
            "requester": user,
            "requester_name": u.get("full_name") or user,
            "requester_email": u.get("email") or "",
            "note": (note or "").strip(),
            "status": "Pending",
        }
    )
    doc.insert(ignore_permissions=True)
    _route(doc, f"Review access to {label} for {doc.requester_name}", add_days(nowdate(), 3))  # provisional SLA
    return to_api(_get(doc.name))


def review_impl(name: str, decision: str, note: str | None = None) -> dict[str, Any]:
    """Approve (grant the module's role) or reject. Used by the HR page (PATCH) and by Approvals (``decide``)."""
    import frappe
    from frappe.utils import now_datetime

    from eswasa_hr.lifecycle import _close

    row = _get(name)
    decision = (decision or "").strip().lower()
    err = reviewer_error(frappe.session.user, frappe.get_roles(), row["requester"])
    if err:
        frappe.throw(err, frappe.PermissionError)
    err = decision_error(decision, note)
    if err:
        frappe.throw(err, frappe.ValidationError)
    if row["status"] != "Pending":
        return to_api(row)  # already decided: unchanged, as the screen expects
    granted = ""
    if decision == "approved":
        role = grant_role(row["module_id"])
        if not role:
            frappe.throw(submit_error(row["module_id"], row["module_label"], []) or "This module can't be granted here.", frappe.ValidationError)
        user = frappe.get_doc("User", row["requester"])
        if role not in {r.role for r in user.get("roles", [])}:
            user.flags.ignore_permissions = True
            user.add_roles(role)
            granted = role
    clean = (note or "").strip()
    frappe.db.set_value(
        DOCTYPE,
        name,
        {
            "status": STATUSES[decision],
            "reviewed_by": frappe.session.user,
            "reviewed_at": now_datetime(),
            "review_note": clean or None,
            "roles_granted": granted or None,
        },
        update_modified=True,
    )
    _close(DOCTYPE, name)
    doc = frappe.get_doc(DOCTYPE, name)
    what = f"approved; granted {granted}" if granted else ("approved" if decision == "approved" else "rejected")
    doc.add_comment("Comment", f"Access to {row['module_label']} {what} by {frappe.session.user}." + (f" {clean}" if clean else ""))
    return to_api(_get(name))


def decide(name: str, action: str, comment: str | None = None) -> dict[str, Any]:
    """Approvals handler (hook ``eswasa_approval_handlers``)."""
    import frappe

    key = (action or "").strip().lower()
    decision = {"approve": "approved", "approved": "approved", "reject": "rejected", "rejected": "rejected"}.get(key)
    if not decision:
        frappe.throw("Approve or reject.", frappe.ValidationError)
    row = review_impl(name, decision, comment)
    status = STATUSES[row["status"]]
    return {"ok": True, "doctype": DOCTYPE, "name": name, "action": action, "workflow_action": None, "status": status, "message": f"{DOCTYPE}: {status}"}


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def list_requests(status: str | None = None, module: str | None = None) -> list[dict[str, Any]]:
    return list_impl(status, module)


@_whitelist
def submit(module_id: str, module_label: str | None = None, note: str | None = None, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return submit_impl(module_id, module_label, note)


@_whitelist
def review(name: str, decision: str, note: str | None = None, confirm: Any = False) -> dict[str, Any]:
    from eswasa_hr.lifecycle import _confirm

    _confirm(confirm)
    return review_impl(name, decision, note)
