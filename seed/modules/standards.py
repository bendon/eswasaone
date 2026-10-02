"""Standards catalogue volumes (abstracts only — no licensed full text)."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from seed.client import FrappeClient, FrappeError
from seed.config import A10_MARKER, KPI_TARGETS

log = logging.getLogger("seed.modules.standards")

_SECTORS = ["Food", "Textiles", "Construction", "Electrical", "Agriculture", "Environment"]


def ensure_standards_volume(
    client: FrappeClient,
    *,
    target: int | None = None,
    year: int = 2025,
) -> dict[str, Any]:
    if not client.doctype_exists("Standard"):
        return {"created": 0, "total": 0}

    target = target if target is not None else KPI_TARGETS["standards_published"]
    current = client.get_count("Standard", filters={"status": "Published"})
    if current >= target:
        log.info("Standards already at %s (target %s)", current, target)
        return {"created": 0, "total": current}

    need = target - current
    created = 0
    # Anchor codes reserved — skip collisions
    reserved = {"SZNS 1043:2024", "SZNS 987:2023"}
    start_n = 1000
    n = start_n
    while created < need and n < start_n + need + 50:
        code = f"SZNS {n}:2024" if n % 2 == 0 else f"SZNS {n}:2023"
        n += 1
        if code in reserved:
            continue
        if client.exists("Standard", code):
            continue
        try:
            client.insert(
                {
                    "doctype": "Standard",
                    "code": code,
                    "title": f"Demo standard {code} (paraphrase abstract only)",
                    "sector": _SECTORS[n % len(_SECTORS)],
                    "status": "Published",
                    "version": code.split(":")[-1],
                    "ics_code": "03.120",
                    "abstract": (
                        f"<p>{A10_MARKER}: Catalogue stub — title/sector only. "
                        "Licensed body text not stored; buy via e-store.</p>"
                    ),
                    "buy_url": "/estore",
                    "published_on": date(year, 1, 15).isoformat(),
                }
            )
            created += 1
        except FrappeError as exc:
            log.warning("standard %s: %s", code, exc)

    total = client.get_count("Standard", filters={"status": "Published"})
    log.info("Standards volume: created=%s total_published=%s", created, total)
    return {"created": created, "total": total}
