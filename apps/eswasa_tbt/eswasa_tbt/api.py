# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Whitelisted TBT API — Institution rail / badge (OpenAPI `/tbt/alerts`).

Discoverable methods (A4 / Core):
  - eswasa_tbt.api.list_notifications(unread_only=False, limit=20, sector=None)
  - eswasa_tbt.api.list_subscriptions()
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, get_datetime

from eswasa_tbt.rules import csv_list, impact_for

SMOKE_METHODS = ["list_notifications", "list_subscriptions"]

# States not yet pushed to subscribers → treat as "new" / unread for badge.
_UNREAD_STATES = {"", "Ingested", "Tagged"}


def _is_unread(workflow_state: str | None) -> bool:
    return (workflow_state or "") in _UNREAD_STATES


def _published_at(value: Any) -> str | None:
    if not value:
        return None
    dt = get_datetime(value)
    if not dt:
        return None
    # Date fields become midnight; expose as ISO for contract date-time.
    return dt.isoformat()


def _serialize_notification(row: Any) -> dict[str, Any]:
    sectors = csv_list(getattr(row, "sectors", None))
    symbol = row.symbol or row.notification_id or row.name
    return {
        "id": row.notification_id or row.name,
        "symbol": symbol,
        "title": row.title,
        "impact": impact_for(sectors, symbol),
        "unread": _is_unread(row.workflow_state),
        "published_at": _published_at(row.published_on),
        # Extra fields Core may ignore; useful for richer UIs
        "country": row.country,
        "sectors": sectors,
        "status": row.workflow_state or "Ingested",
        "source_url": row.source_url,
    }


@frappe.whitelist()
def list_notifications(
    unread_only: int | bool | str | None = False,
    limit: int = 20,
    sector: str | None = None,
) -> dict[str, Any]:
    """List TBT notifications for Institution badge (TbtNotificationSummary[]).

    Returns ``items`` plus ``new_count`` (unread / not-yet-Notified rows).
    Seeds demo rows (incl. G/TBT/N/EU/891) when the table is empty.
    """
    if not frappe.has_permission("TBT Notification", "read"):
        frappe.throw(_("Not permitted to read TBT Notification"), frappe.PermissionError)

    # Lazy idempotent seed when empty (migrate may not have run yet).
    if not frappe.db.count("TBT Notification"):
        try:
            from eswasa_tbt.seed import ensure_demo_notifications

            ensure_demo_notifications()
        except Exception:
            frappe.log_error(title="eswasa_tbt lazy seed failed")

    unread_flag = bool(cint(unread_only)) if not isinstance(unread_only, bool) else unread_only
    page_len = cint(limit) or 20

    rows = frappe.get_all(
        "TBT Notification",
        fields=[
            "name",
            "notification_id",
            "title",
            "country",
            "symbol",
            "sectors",
            "published_on",
            "source_url",
            "workflow_state",
        ],
        order_by="published_on desc, modified desc",
        limit_page_length=200,
    )

    items = [_serialize_notification(r) for r in rows]
    if sector:
        sl = sector.lower()
        items = [i for i in items if sl in [s.lower() for s in i.get("sectors", [])]]

    new_count = sum(1 for i in items if i.get("unread"))
    if unread_flag:
        items = [i for i in items if i.get("unread")]

    return {"items": items[:page_len], "new_count": new_count}


@frappe.whitelist()
def list_subscriptions() -> dict[str, Any]:
    """List active TBT Subscriptions for the current user (or all if permitted)."""
    if not frappe.has_permission("Subscription", "read"):
        frappe.throw(_("Not permitted to read Subscription"), frappe.PermissionError)

    filters: dict[str, Any] = {"active": 1}
    user = frappe.session.user
    if user and user != "Administrator" and "System Manager" not in frappe.get_roles():
        filters["subscriber_user"] = user

    rows = frappe.get_all(
        "Subscription",
        filters=filters,
        fields=[
            "name",
            "subscription_id",
            "subscriber_email",
            "sectors",
            "countries",
            "channel",
            "active",
        ],
        order_by="modified desc",
        limit_page_length=50,
    )
    items = [
        {
            "id": r.subscription_id or r.name,
            "email": r.subscriber_email,
            "sectors": csv_list(r.sectors),
            "countries": csv_list(r.countries),
            "channel": r.channel,
            "active": bool(r.active),
        }
        for r in rows
    ]
    return {"items": items}
