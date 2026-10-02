"""WTO/TBT notification stubs — badge target 4; coexist with eswasa_tbt seed."""

from __future__ import annotations

import logging
from typing import Any

from seed.client import FrappeClient, FrappeError
from seed.config import A10_MARKER, ANCHORS, KPI_TARGETS

log = logging.getLogger("seed.modules.tbt")

# Prefer stable notification_id; symbol carries the WTO id shown in mocks.
# Avoid setting workflow_state on insert (TBT Notification Flow rejects jumps).
_DEMO = [
    {
        "notification_id": "G/TBT/N/EU/891",
        "symbol": "G/TBT/N/EU/891",
        "title": "EU draft regulation on textile labelling and fibre composition",
        "country": "European Union",
        "sectors": "Textiles",
        "published_on": "2025-09-15",
        "source_url": "https://epingalert.org/",
        "summary": f"<p>{A10_MARKER}: Open WTO/TBT notification (demo). High impact on textiles.</p>",
        "rights": "open",
        "desired_state": "Tagged",
    },
    {
        "notification_id": "G/TBT/N/USA/2145",
        "symbol": "G/TBT/N/USA/2145",
        "title": "Proposed energy-efficiency rules for household refrigerators",
        "country": "United States",
        "sectors": "Electrical,Energy",
        "published_on": "2025-09-12",
        "source_url": "https://epingalert.org/",
        "summary": f"<p>{A10_MARKER}: Open WTO/TBT notification (demo).</p>",
        "rights": "open",
        "desired_state": "Ingested",
    },
    {
        "notification_id": "G/TBT/N/ZAF/312",
        "symbol": "G/TBT/N/ZAF/312",
        "title": "Draft food contact materials and packaging requirements",
        "country": "South Africa",
        "sectors": "Food,Packaging",
        "published_on": "2025-09-10",
        "source_url": "https://epingalert.org/",
        "summary": f"<p>{A10_MARKER}: Open WTO/TBT notification (demo).</p>",
        "rights": "open",
        "desired_state": "Tagged",
    },
    {
        "notification_id": "G/TBT/N/CHN/1780",
        "symbol": "G/TBT/N/CHN/1780",
        "title": "Update to conformity assessment for low-voltage electrical equipment",
        "country": "China",
        "sectors": "Electrical",
        "published_on": "2025-09-08",
        "source_url": "https://epingalert.org/",
        "summary": f"<p>{A10_MARKER}: Open WTO/TBT notification (demo).</p>",
        "rights": "open",
        "desired_state": "Ingested",
    },
]


def ensure_tbt(client: FrappeClient) -> list[str]:
    if not client.doctype_exists("TBT Notification"):
        return []

    ensured: list[str] = []
    for row in _DEMO[: KPI_TARGETS["tbt_badge"]]:
        symbol = row["symbol"]
        desired = row.get("desired_state")
        payload = {k: v for k, v in row.items() if k != "desired_state"}

        existing = client.get_list(
            "TBT Notification",
            filters={"symbol": symbol},
            fields=["name", "notification_id", "symbol"],
            limit=1,
        )
        if existing:
            name = existing[0]["name"]
            try:
                patch: dict[str, Any] = {"summary": payload["summary"]}
                if desired:
                    patch["workflow_state"] = desired
                client.resource_update("TBT Notification", name, patch)
            except FrappeError as exc:
                log.warning("TBT refresh %s: %s", name, exc)
            ensured.append(name)
            log.info("TBT symbol %s present as %s (absorbed)", symbol, name)
            continue

        nid = payload["notification_id"]
        try:
            name = client.upsert("TBT Notification", nid, payload)
            if desired:
                try:
                    client.resource_update(
                        "TBT Notification", name, {"workflow_state": desired}
                    )
                except FrappeError:
                    pass
            ensured.append(name)
        except FrappeError as exc:
            # Fallback stable id without slashes (matches eswasa_tbt seed style)
            alt = "TBT-" + symbol.split("/")[-2] + "-" + symbol.split("/")[-1]
            try:
                payload2 = dict(payload)
                payload2["notification_id"] = alt
                name = client.upsert("TBT Notification", alt, payload2)
                ensured.append(name)
                log.info("TBT %s stored as %s", symbol, alt)
            except FrappeError as exc2:
                log.warning("TBT %s failed: %s / %s", nid, exc, exc2)

    anchor = ANCHORS["tbt_symbol"]
    if not any(anchor in n or n == anchor for n in ensured):
        found = client.get_list(
            "TBT Notification",
            filters={"symbol": anchor},
            fields=["name"],
            limit=1,
        )
        if found:
            ensured.append(found[0]["name"])

    log.info("TBT ensured (%s): %s", len(ensured), ensured)
    return ensured
