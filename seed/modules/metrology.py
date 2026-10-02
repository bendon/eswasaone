"""Metrology thin stubs (operational epoch onward)."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from seed.client import FrappeClient, FrappeError
from seed.config import A10_MARKER

log = logging.getLogger("seed.modules.metrology")

METHOD_CODE = "TM-DEMO-MASS"


def ensure_metrology_stubs(client: FrappeClient, *, years: int = 2) -> dict[str, Any]:
    out: dict[str, Any] = {"instruments": [], "jobs": [], "method": None}
    if not client.doctype_exists("Instrument"):
        return out

    if client.doctype_exists("Test Method"):
        try:
            out["method"] = client.upsert(
                "Test Method",
                METHOD_CODE,
                {
                    "method_code": METHOD_CODE,
                    "title": "Demo mass calibration method",
                    "standard_ref": "ISO/IEC 17025",
                    "accredited": 1,
                    "notes": f"{A10_MARKER}: thin metrology stub ({years}y window).",
                },
            )
        except FrappeError as exc:
            log.warning("Test Method skipped: %s", exc)

    for i, label in enumerate(["Mass comparator M1", "Temperature bath T2", "Balance E3"]):
        code = f"INST-DEMO-{i + 1:03d}"
        try:
            name = client.upsert(
                "Instrument",
                code,
                {
                    "instrument_id": code,
                    "instrument_name": label,
                    "manufacturer": "Demo Instruments",
                    "status": "Active",
                    "owner_customer": "ESWASA Lab",
                },
            )
            out["instruments"].append(name)
        except FrappeError as exc:
            log.warning("Instrument %s skipped: %s", code, exc)

    if (
        client.doctype_exists("Calibration Job")
        and out["instruments"]
        and out["method"]
    ):
        due = (date.today() + timedelta(days=14)).isoformat()
        for i, inst in enumerate(out["instruments"][:2]):
            job_code = f"CAL-DEMO-{i + 1:03d}"
            try:
                name = client.upsert(
                    "Calibration Job",
                    job_code,
                    {
                        "job_code": job_code,
                        "instrument": inst,
                        "test_method": out["method"],
                        "due_on": due,
                        "notes": f"{A10_MARKER}:cal:{i} thin metrology stub.",
                    },
                )
                out["jobs"].append(name)
            except FrappeError as exc:
                log.warning("Calibration Job %s skipped: %s", job_code, exc)

    return out
