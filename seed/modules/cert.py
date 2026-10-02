"""Certification volumes + pending/SLA applications."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from seed.client import FrappeClient, FrappeError
from seed.config import A10_MARKER, AUDITOR_CODE, KPI_TARGETS, SCHEME_CODE

log = logging.getLogger("seed.modules.cert")

_HOLDERS = [
    "Swazi Fresh Produce Ltd",
    "Lusoti Foods (Pty) Ltd",
    "Matsapha Packaging Co",
    "Ngwenya Mining Services",
    "Ezulwini Hospitality Group",
    "Manzini Agro Processors",
    "Simunye Sugar Refinery",
    "Hhohho Timber Products",
]


def _holder(i: int) -> str:
    return f"{_HOLDERS[i % len(_HOLDERS)]} #{i:03d}" if i >= len(_HOLDERS) else _HOLDERS[i]


def ensure_pending_applications(client: FrappeClient, *, count: int | None = None) -> list[str]:
    """Create/refresh pending applications to approach KPI (23 pending, 7 SLA)."""
    if not client.doctype_exists("Certification Application"):
        return []

    target = count if count is not None else KPI_TARGETS["pending_applications"]
    sla_n = min(KPI_TARGETS["pending_sla_overdue"], target)
    names: list[str] = []

    existing = client.get_list(
        "Certification Application",
        filters=[["assessment_notes", "like", f"%{A10_MARKER}:pending%"]],
        fields=["name", "workflow_state", "assessment_notes"],
        limit=200,
    )
    by_marker = {r["name"]: r for r in existing}

    for i, name in enumerate(sorted(by_marker)):
        if len(names) >= target:
            break
        overdue = i < sla_n
        notes = (
            f"{A10_MARKER}:pending:{i:02d} "
            + ("SLA_OVERDUE " if overdue else "")
            + "seeded pending application."
        )
        state = "Assessment" if overdue else "Application"
        try:
            client.set_value(
                "Certification Application", name, "assessment_notes", notes
            )
            if overdue:
                from seed.anchors import advance_application

                advance_application(client, name, "Assessment")
            else:
                # leave at Application
                pass
        except FrappeError as exc:
            log.warning("pending refresh %s: %s", name, exc)
        names.append(name)

    need = target - len(names)
    today = date.today()
    for i in range(len(names), len(names) + need):
        overdue = i < sla_n
        app_date = today - timedelta(days=40 if overdue else 5)
        notes = (
            f"{A10_MARKER}:pending:{i:02d} "
            + ("SLA_OVERDUE " if overdue else "")
            + "seeded pending application."
        )
        try:
            doc = client.insert(
                {
                    "doctype": "Certification Application",
                    "scheme": SCHEME_CODE,
                    "applicant_name": _holder(100 + i),
                    "applicant_org": _holder(100 + i),
                    "contact_email": f"pending{i:02d}@example.sz",
                    "application_date": app_date.isoformat(),
                    # Insert at default Application — then PUT desired state
                    "assigned_auditor": AUDITOR_CODE if overdue else None,
                    "assessment_notes": notes,
                }
            )
            app_name = doc.get("name") or ""
            if app_name and overdue:
                from seed.anchors import advance_application

                advance_application(client, app_name, "Assessment")
            names.append(app_name)
        except FrappeError as exc:
            log.warning("pending insert %s: %s", i, exc)

    log.info("Pending applications ensured: %s (SLA slots %s)", len(names), sla_n)
    return [n for n in names if n]


def ensure_certified_volume(
    client: FrappeClient,
    *,
    target: int | None = None,
    year: int = 2025,
) -> dict[str, Any]:
    """Bulk Active certificates toward YTD KPI (skips exact anchor names)."""
    if not client.doctype_exists("Certificate"):
        return {"created": 0, "total": 0}

    target = target if target is not None else KPI_TARGETS["companies_certified_ytd"]
    current = client.get_count("Certificate", filters={"status": "Active"})
    if current >= target:
        log.info("Certified volume already at %s (target %s)", current, target)
        return {"created": 0, "total": current}

    need = target - current
    created = 0
    issued = date(year, 3, 1)
    for i in range(need):
        holder = _holder(200 + current + i)
        try:
            app = client.insert(
                {
                    "doctype": "Certification Application",
                    "scheme": SCHEME_CODE,
                    "applicant_name": holder,
                    "applicant_org": holder,
                    "contact_email": f"cert{current + i:03d}@example.sz",
                    "application_date": issued.isoformat(),
                    "assigned_auditor": AUDITOR_CODE,
                    "assessment_notes": f"{A10_MARKER}:volume-cert:{current + i}",
                }
            )
            app_name = app.get("name")
            if not app_name:
                continue
            try:
                from seed.anchors import advance_application

                advance_application(client, app_name, "Certified")
            except FrappeError as exc:
                log.warning("volume app state %s: %s", app_name, exc)
            client.insert(
                {
                    "doctype": "Certificate",
                    "naming_series": "CERT-.YYYY.-.#####",
                    "certificate_number": f"CERT-{year}-V{current + i:04d}",
                    "application": app_name,
                    "scheme": SCHEME_CODE,
                    "holder_name": holder,
                    "status": "Active",
                    "issued_on": issued.isoformat(),
                    "valid_until": date(year + 3, 3, 1).isoformat(),
                    "scope_summary": f"{A10_MARKER}: volume certificate for KPI.",
                }
            )
            created += 1
        except FrappeError as exc:
            log.warning("volume cert %s: %s", i, exc)
            if created == 0 and i > 5:
                break

    total = client.get_count("Certificate", filters={"status": "Active"})
    log.info("Certified volume: created=%s total_active=%s", created, total)
    return {"created": created, "total": total}
