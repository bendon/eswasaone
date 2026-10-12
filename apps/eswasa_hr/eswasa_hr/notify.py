"""
HR notification outbox (plan 04): the bridge from Frappe to Core messaging.

HR code calls ``queue(key, users, template, context)``; it inserts one ``HR Notification`` per recipient, once per
key. Core (``core/app/events/hr_notify.py``, cron ``POST /events/hr-notify``) pulls ``pending``, sends through its
messaging adapter (console fallback when SMTP/SMS is unset) and calls ``mark``. Frappe never sends itself, and
the sender address and SMS sender ID live in Core's ``.env`` (ESWASA ICT), never here.

Opt-out: ``User.custom_hr_email_opt_out`` (Desk only) skips non-essential templates; decisions and offers always
send. A failed send is retried until ``MAX_ATTEMPTS``.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from eswasa_hr.notify_templates import TEMPLATES, clean, essential, render

DOCTYPE = "HR Notification"
OPT_OUT = "custom_hr_email_opt_out"
MAX_ATTEMPTS = 3
KEY_MAX = 140
STATUSES = ("Sent", "Failed", "Skipped")


# ---------------------------------------------------------------- pure rules


def row_key(key: str, recipient: str) -> str:
    """Unique per event and recipient; long keys keep a readable head and a hash tail."""
    k = f"{key}:{recipient}"
    if len(k) <= KEY_MAX:
        return k
    return f"{k[:KEY_MAX - 17]}#{hashlib.sha1(k.encode()).hexdigest()[:16]}"


def initial_status(template: str, opted_out: bool) -> tuple[str, str | None]:
    if opted_out and not essential(template):
        return "Skipped", "Opted out of HR email"
    return "Queued", None


def after_mark(status: str, attempts: int) -> tuple[str, int]:
    """(new status, attempts). A failure stays Queued for another try until MAX_ATTEMPTS."""
    if status == "Failed":
        attempts += 1
        return ("Failed" if attempts >= MAX_ATTEMPTS else "Queued"), attempts
    return status, attempts


# ---------------------------------------------------------------- Frappe glue


def _ready() -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", DOCTYPE))


def _opted_out(user: str) -> bool:
    import frappe

    if not frappe.get_meta("User").has_field(OPT_OUT):  # not migrated yet: nobody has opted out
        return False
    return bool(frappe.db.get_value("User", user, OPT_OUT))


def queue(key: str, users: list[str] | None, template: str, context: dict[str, Any] | None, to_address: str | None = None, channel: str = "email") -> int:
    """Queue one message per named user (and/or one external address), once per key. Returns how many were added."""
    import frappe

    from eswasa_hr.alerts import recipients

    if template not in TEMPLATES:
        raise ValueError(f"Unknown HR notification template: {template}")
    if not _ready():
        return 0
    ctx = json.dumps(clean(template, context), sort_keys=True)
    targets: list[tuple[str | None, str | None]] = [(u, None) for u in recipients(users or []) if u != "Guest"]
    if to_address:
        targets.append((None, to_address.strip()))
    n = 0
    for user, address in targets:
        k = row_key(key, user or address)
        if frappe.db.exists(DOCTYPE, {"key": k}):
            continue
        status, error = initial_status(template, bool(user) and _opted_out(user))
        frappe.get_doc({"doctype": DOCTYPE, "key": k, "to_user": user, "to_address": address, "channel": channel,
                        "template": template, "context": ctx, "status": status, "attempts": 0, "error": error}).insert(ignore_permissions=True)
        n += 1
    return n


def _require_system_manager() -> None:
    import frappe

    if "System Manager" not in frappe.get_roles():
        frappe.throw("Only a System Manager can read or update the HR outbox.", frappe.PermissionError)


def _address(row: dict[str, Any]) -> str | None:
    import frappe

    if row.get("to_address"):
        return row["to_address"]
    if not row.get("to_user"):
        return None
    u = frappe.db.get_value("User", row["to_user"], ["email", "mobile_no", "enabled"], as_dict=True) or {}
    if not u or not int(u.get("enabled") or 0):
        return None
    return u.get("mobile_no") if row.get("channel") == "sms" else u.get("email")


def pending_impl(limit: int = 50) -> list[dict[str, Any]]:
    """Queued messages, oldest first, rendered, with the address resolved (None when there is nowhere to send)."""
    import frappe

    _require_system_manager()
    if not _ready():
        return []
    rows = frappe.get_all(DOCTYPE, filters={"status": "Queued"}, fields=["name", "to_user", "to_address", "channel", "template", "context"],
                          order_by="creation asc", limit=max(1, min(int(limit or 50), 200)))
    out = []
    for r in rows:
        if r.get("template") not in TEMPLATES:
            continue
        ctx = r.get("context")
        msg = render(r["template"], json.loads(ctx) if isinstance(ctx, str) and ctx else ctx or {})
        out.append({"name": r["name"], "channel": r.get("channel") or "email", "to": _address(r), **msg})
    return out


def mark_impl(name: str, status: str, error: str | None = None) -> dict[str, Any]:
    import frappe
    from frappe.utils import now_datetime

    _require_system_manager()
    if status not in STATUSES:
        frappe.throw("Status is Sent, Failed or Skipped.", frappe.ValidationError)
    row = frappe.db.get_value(DOCTYPE, name, ["name", "status", "attempts"], as_dict=True)
    if not row:
        frappe.throw("No such notification.", frappe.DoesNotExistError)
    new, attempts = after_mark(status, int(row.get("attempts") or 0))
    values: dict[str, Any] = {"status": new, "attempts": attempts, "error": (error or "")[:500] or None}
    if new == "Sent":
        values["sent_on"] = now_datetime()
    frappe.db.set_value(DOCTYPE, name, values)
    return {"name": name, "status": new, "attempts": attempts}


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def pending(limit: Any = 50) -> list[dict[str, Any]]:
    return pending_impl(int(limit or 50))


@_whitelist
def mark(name: str, status: str, error: str | None = None) -> dict[str, Any]:
    return mark_impl(name, status, error)
