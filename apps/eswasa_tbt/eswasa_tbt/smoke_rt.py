# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Live-site smoke for R-T1 / R-T2.

Run:
  cd /srv/projects/eswasaone/engine/frappe-bench
  bench --site eswasaone.localhost execute eswasa_tbt.smoke_rt.run
"""

from __future__ import annotations

from typing import Any


def run() -> dict[str, Any]:
    import frappe

    from eswasa_tbt.rules import impact_for, match_subscriptions, rt1_notification_ingested
    from eswasa_tbt.seed import ensure_demo_subscriptions

    ensure_demo_subscriptions()

    nid = "TBT-SMOKE-RT1"
    if frappe.db.exists("TBT Notification", nid):
        frappe.delete_doc("TBT Notification", nid, force=True, ignore_permissions=True)

    doc = frappe.get_doc(
        {
            "doctype": "TBT Notification",
            "notification_id": nid,
            "symbol": "G/TBT/N/EU/891-SMOKE",
            "title": "Smoke: high-impact textiles labelling",
            "country": "European Union",
            "sectors": "Textiles",
            "hs_codes": "6203",
            "published_on": "2026-09-20",
            "source_url": "https://eping.wto.org/",
            "summary": "R-T1/R-T2 smoke notification.",
            "rights": "open",
            "workflow_state": "Ingested",
        }
    )
    # insert triggers after_insert → R-T1 (+ R-T2 for high)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()

    doc.reload()
    impact = impact_for(["Textiles"], doc.symbol)
    matched = match_subscriptions(
        {"sectors": ["Textiles"], "jurisdiction": "European Union", "hs_codes": ["6203"]}
    )

    # Idempotent re-run
    again = rt1_notification_ingested(doc)
    assert again.get("skipped"), "R-T1 should be idempotent"

    feed_rt1 = frappe.db.exists(
        "Comment",
        {"reference_doctype": "TBT Notification", "reference_name": nid, "content": ("like", "%[rule:R-T1]%")},
    )
    feed_rt2 = frappe.db.exists(
        "Comment",
        {"reference_doctype": "TBT Notification", "reference_name": nid, "content": ("like", "%[rule:R-T2]%")},
    )
    guidance = frappe.db.exists("Market Requirement", {"title": ("like", f"%{doc.symbol}%")})
    api = frappe.call("eswasa_tbt.api.list_notifications", limit=50)
    api_ids = [i["id"] for i in api.get("items", [])]

    result = {
        "ok": bool(feed_rt1 and impact == "high" and matched and nid in api_ids),
        "impact": impact,
        "workflow_state": doc.workflow_state,
        "subscribers_matched": len(matched),
        "rule_rt1": bool(feed_rt1),
        "rule_rt2": bool(feed_rt2),
        "export_guidance": guidance or None,
        "list_notifications_has_smoke": nid in api_ids,
        "api_new_count": api.get("new_count"),
    }
    print(result)
    if not result["ok"]:
        raise AssertionError(f"R-T1/R-T2 smoke failed: {result}")
    return result
