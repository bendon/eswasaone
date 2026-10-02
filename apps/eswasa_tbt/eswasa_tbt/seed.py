# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Idempotent demo TBT notifications + subscriptions for Institution badge."""

from __future__ import annotations

import frappe

# Stable keys — re-running after_migrate must not duplicate.
DEMO_NOTIFICATIONS = [
    {
        "notification_id": "TBT-EU-891",
        "symbol": "G/TBT/N/EU/891",
        "title": "EU draft regulation on textile labelling and fibre composition",
        "country": "European Union",
        "sectors": "Textiles",
        "hs_codes": "6203,6204",
        "published_on": "2026-09-15",
        "source_url": "https://epingalert.org/",
        "summary": "Open WTO/TBT notification (demo). High impact on textiles exports.",
        "workflow_state": "Tagged",
        "rights": "open",
    },
    {
        "notification_id": "TBT-USA-2145",
        "symbol": "G/TBT/N/USA/2145",
        "title": "Proposed energy-efficiency rules for household refrigerators",
        "country": "United States",
        "sectors": "Electrical,Energy",
        "published_on": "2026-09-12",
        "source_url": "https://epingalert.org/",
        "summary": "Open WTO/TBT notification (demo).",
        "workflow_state": "Ingested",
        "rights": "open",
    },
    {
        "notification_id": "TBT-ZAF-312",
        "symbol": "G/TBT/N/ZAF/312",
        "title": "Draft food contact materials and packaging requirements",
        "country": "South Africa",
        "sectors": "Food,Packaging",
        "published_on": "2026-09-10",
        "source_url": "https://epingalert.org/",
        "summary": "Open WTO/TBT notification (demo).",
        "workflow_state": "Tagged",
        "rights": "open",
    },
    {
        "notification_id": "TBT-CHN-1780",
        "symbol": "G/TBT/N/CHN/1780",
        "title": "Update to conformity assessment for low-voltage electrical equipment",
        "country": "China",
        "sectors": "Electrical",
        "published_on": "2026-09-08",
        "source_url": "https://epingalert.org/",
        "summary": "Open WTO/TBT notification (demo).",
        "workflow_state": "Ingested",
        "rights": "open",
    },
]

DEMO_SECTOR_TAGS = [
    {
        "tag": "Textiles",
        "label": "Textiles & apparel",
        "hs_prefix": "62",
        "description": "Clothing / textiles",
    },
    {
        "tag": "Electrical",
        "label": "Electrical equipment",
        "hs_prefix": "85",
        "description": "Electrical / electronics",
    },
    {
        "tag": "Food",
        "label": "Food products",
        "hs_prefix": "16",
        "description": "Processed foods",
    },
]

DEMO_SUBSCRIPTIONS = [
    {
        "subscription_id": "SUB-TEXTILES-DEMO",
        "subscriber_email": "exporter.textiles@example.com",
        "sectors": "Textiles",
        "countries": "European Union,EU",
        "channel": "email",
        "active": 1,
    },
    {
        "subscription_id": "SUB-ELECTRICAL-DEMO",
        "subscriber_email": "exporter.electrical@example.com",
        "sectors": "Electrical",
        "countries": "",
        "channel": "email",
        "active": 1,
    },
]


def ensure_demo_sector_tags() -> list[str]:
    if not frappe.db.exists("DocType", "Sector Tag"):
        return []
    ensured: list[str] = []
    for row in DEMO_SECTOR_TAGS:
        if frappe.db.exists("Sector Tag", row["tag"]):
            ensured.append(row["tag"])
            continue
        doc = frappe.get_doc({"doctype": "Sector Tag", **row})
        doc.insert(ignore_permissions=True)
        ensured.append(doc.name)
    return ensured


def ensure_demo_subscriptions() -> list[str]:
    if not frappe.db.exists("DocType", "Subscription"):
        return []
    ensured: list[str] = []
    for row in DEMO_SUBSCRIPTIONS:
        sid = row["subscription_id"]
        if frappe.db.exists("Subscription", sid):
            ensured.append(sid)
            continue
        doc = frappe.get_doc({"doctype": "Subscription", **row})
        doc.insert(ignore_permissions=True)
        ensured.append(doc.name)
    return ensured


def ensure_demo_notifications() -> list[str]:
    """Insert demo TBT Notification rows if missing. Returns names created/ensured."""
    if not frappe.db.exists("DocType", "TBT Notification"):
        return []

    ensure_demo_sector_tags()
    ensure_demo_subscriptions()

    ensured: list[str] = []
    for row in DEMO_NOTIFICATIONS:
        nid = row["notification_id"]
        if frappe.db.exists("TBT Notification", nid):
            ensured.append(nid)
            continue
        # Also skip if same WTO symbol already present under another id
        if frappe.db.exists("TBT Notification", {"symbol": row["symbol"]}):
            existing = frappe.db.get_value(
                "TBT Notification", {"symbol": row["symbol"]}, "name"
            )
            ensured.append(existing or nid)
            continue
        doc = frappe.get_doc({"doctype": "TBT Notification", **row})
        doc.insert(ignore_permissions=True)
        ensured.append(doc.name)
    frappe.db.commit()
    return ensured
