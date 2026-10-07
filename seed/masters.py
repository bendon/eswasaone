"""Thin master data: schemes, auditors, era-A narrative, staff scale note."""

from __future__ import annotations

import logging
from typing import Any

from seed.client import FrappeClient, FrappeError
from seed.config import (
    A10_MARKER,
    AUDITOR_CODE,
    ERA_A_END,
    ERA_A_START,
    KPI_TARGETS,
    OPERATIONAL_EPOCH,
    OPERATIONAL_EPOCH_DATE,
    SCHEME_CODE,
)

log = logging.getLogger("seed.masters")

ERA_A_NARRATIVE = (
    f"{A10_MARKER}: Era A ({ERA_A_START}–{ERA_A_END}): Standards & Quality Act "
    f"assent narrative only. No certification/metrology DocType volumes before "
    f"{OPERATIONAL_EPOCH_DATE} (OPERATIONAL_EPOCH={OPERATIONAL_EPOCH})."
)


def ensure_masters(client: FrappeClient) -> dict[str, Any]:
    """Idempotent scheme + auditor + governance narrative stub."""
    out: dict[str, Any] = {"scheme": None, "auditor": None, "era_a": ERA_A_NARRATIVE}

    if client.doctype_exists("Certification Scheme"):
        out["scheme"] = client.upsert(
            "Certification Scheme",
            SCHEME_CODE,
            {
                "scheme_code": SCHEME_CODE,
                "scheme_name": "Quality Management Systems: Requirements",
                "standard_ref": "SZNS ISO 9001:2015",
                "scheme_type": "Management System",
                "accreditation_basis": "ISO/IEC 17021",
                "surveillance_interval_months": 12,
                "certificate_validity_months": 36,
                "is_active": 1,
                "description": f"{A10_MARKER}: primary demo scheme for KPI volumes.",
            },
        )

    if client.doctype_exists("Auditor"):
        out["auditor"] = client.upsert(
            "Auditor",
            AUDITOR_CODE,
            {
                "auditor_code": AUDITOR_CODE,
                "auditor_name": "Sipho Dlamini",
                "employment_type": "Internal",
                "email": "sipho.dlamini@eswasa.org.sz",
                "is_active": 1,
            },
        )
        if out["scheme"] and client.doctype_exists("Auditor Competence"):
            existing = client.get_list(
                "Auditor Competence",
                filters={
                    "auditor": AUDITOR_CODE,
                    "scheme": SCHEME_CODE,
                    "competence_level": "Lead Auditor",
                },
                limit=1,
            )
            if not existing:
                try:
                    client.insert(
                        {
                            "doctype": "Auditor Competence",
                            "auditor": AUDITOR_CODE,
                            "scheme": SCHEME_CODE,
                            "standard_ref": "ISO 9001:2015",
                            "competence_level": "Lead Auditor",
                            "valid_from": OPERATIONAL_EPOCH_DATE,
                            "evidence_notes": f"{A10_MARKER}: lead auditor competence.",
                        }
                    )
                except FrappeError as exc:
                    log.warning("Auditor Competence skipped: %s", exc)

    # Soft staff-scale marker via Board Pack (no HR Employee flood)
    if client.doctype_exists("Board Pack"):
        out["staff_pack"] = client.upsert(
            "Board Pack",
            "BP-DEMO-HR-SCALE",
            {
                "pack_code": "BP-DEMO-HR-SCALE",
                "title": f"Demo HR scale note (~{KPI_TARGETS['staff_headcount']} staff)",
                "meeting_date": "2025-04-02",
                "agenda": (
                    f"{A10_MARKER}: Synthetic demo headcount target "
                    f"{KPI_TARGETS['staff_headcount']} (not full Employee rows). "
                    f"{ERA_A_NARRATIVE}"
                ),
                "workflow_state": "Draft",
            },
        )

    log.info("Masters ready (scheme=%s auditor=%s)", out.get("scheme"), out.get("auditor"))
    return out
