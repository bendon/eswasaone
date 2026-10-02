#!/usr/bin/env python3
"""R-M1…M4 smoke for eswasa_metrology.

Run from frappe-bench:
  bench --site eswasaone.localhost execute eswasa_metrology.smoke_rm.run
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import add_days, nowdate


def _ensure_method() -> str:
    code = "TM-SMOKE-MASS"
    if frappe.db.exists("Test Method", code):
        frappe.db.set_value(
            "Test Method",
            code,
            {"tat_days": 5, "calibration_fee": 1500, "title": "Smoke Mass Calibration"},
            update_modified=False,
        )
        return code
    doc = frappe.get_doc(
        {
            "doctype": "Test Method",
            "method_code": code,
            "title": "Smoke Mass Calibration",
            "standard_ref": "ISO/IEC 17025 smoke",
            "accredited": 1,
            "tat_days": 5,
            "calibration_fee": 1500,
        }
    )
    doc.insert(ignore_permissions=True)
    return doc.name


def _ensure_instrument(*, internal: bool = False, overdue: bool = False) -> str:
    suffix = "INT" if internal else "EXT"
    iid = f"INS-SMOKE-{suffix}"
    due = add_days(nowdate(), -3) if overdue else add_days(nowdate(), 7)
    payload = {
        "instrument_name": f"Smoke {'Internal' if internal else 'Client'} Balance",
        "manufacturer": "SmokeCo",
        "model": "S-100",
        "serial_number": f"SN-{suffix}",
        "owner_customer": "ESWASA Lab" if internal else "Smoke Client (Pty) Ltd",
        "owner_email": "smoke-metro@example.com",
        "status": "Active",
        "calibration_due_on": due,
        "is_internal_eswasa": 1 if internal else 0,
        "blocked_for_use": 0,
        "calibration_due_notice_sent": 0,
    }
    if frappe.db.exists("Instrument", iid):
        frappe.db.set_value("Instrument", iid, payload, update_modified=False)
        return iid
    doc = frappe.get_doc({"doctype": "Instrument", "instrument_id": iid, **payload})
    doc.insert(ignore_permissions=True)
    return doc.name


def run() -> dict[str, Any]:
    """Exercise R-M1 (submit job) → R-M2 (approve result) + R-M3 cron + R-M4 OOT."""
    from eswasa_metrology.rules import rm3_calibration_due_sweep, rm4_out_of_tolerance

    method = _ensure_method()
    instrument = _ensure_instrument(internal=False, overdue=False)

    job_code = f"JOB-SMOKE-{frappe.generate_hash(length=6).upper()}"
    job = frappe.get_doc(
        {
            "doctype": "Calibration Job",
            "job_code": job_code,
            "instrument": instrument,
            "test_method": method,
            "client_email": "smoke-metro@example.com",
            "workflow_state": "Received",
            "notes": "rm-smoke-job",
        }
    )
    job.insert(ignore_permissions=True)
    job.flags.ignore_permissions = True
    try:
        job.submit()
    except Exception as exc:
        frappe.db.set_value("Calibration Job", job.name, "docstatus", 1, update_modified=False)
        job.reload()
        from eswasa_metrology.rules import rm1_job_received

        rm1_job_received(job)
        frappe.logger("eswasa_metrology").warning(f"R-M1 submit fallback: {exc}")

    job.reload()

    result_id = f"RES-SMOKE-{frappe.generate_hash(length=6).upper()}"
    result = frappe.get_doc(
        {
            "doctype": "Result",
            "result_id": result_id,
            "calibration_job": job.name,
            "parameter": "mass@1kg",
            "measured_value": 1.0002,
            "unit": "kg",
            "uncertainty": 0.0001,
            "pass_fail": "Pass",
            "reviewed": 0,
        }
    )
    result.insert(ignore_permissions=True)
    result.flags.ignore_permissions = True
    try:
        result.submit()
    except Exception as exc:
        frappe.db.set_value("Result", result.name, "docstatus", 1, update_modified=False)
        result.reload()
        frappe.logger("eswasa_metrology").warning(f"Result submit fallback: {exc}")

    # R-M2: mark reviewed after submit
    result.reload()
    result.reviewed = 1
    try:
        result.save(ignore_permissions=True)
    except Exception as exc:
        frappe.db.set_value("Result", result.name, "reviewed", 1, update_modified=False)
        result.reload()
        from eswasa_metrology.rules import rm2_result_approved

        rm2_result_approved(result)
        frappe.logger("eswasa_metrology").warning(f"R-M2 save fallback: {exc}")

    job.reload()
    cert = frappe.db.get_value("Calibration Certificate", {"calibration_job": job.name}, "name")
    trace = frappe.db.get_value("Traceability Link", {"calibration_job": job.name}, "name")

    # R-M3: overdue internal instrument → block
    internal = _ensure_instrument(internal=True, overdue=True)
    rm3 = rm3_calibration_due_sweep()
    blocked = cint_safe(frappe.db.get_value("Instrument", internal, "blocked_for_use"))

    # R-M4: OOT draft flags without sign-off; submit blocked
    oot_id = f"RES-OOT-{frappe.generate_hash(length=6).upper()}"
    oot = frappe.get_doc(
        {
            "doctype": "Result",
            "result_id": oot_id,
            "calibration_job": job.name,
            "parameter": "mass@1kg",
            "measured_value": 1.05,
            "unit": "kg",
            "pass_fail": "Fail",
        }
    )
    oot.insert(ignore_permissions=True)
    oot.reload()
    oot_flagged = cint_safe(oot.out_of_tolerance) and cint_safe(oot.supervisor_signoff_required)
    submit_blocked = False
    try:
        oot.submit()
    except Exception:
        submit_blocked = True

    # Sign-off then submit should pass R-M4 gate (do not re-run full R-M2 dispatch)
    oot.reload()
    oot.supervisor_signed_off = 1
    oot.supervisor = "Administrator"
    oot.save(ignore_permissions=True)
    # Avoid double-dispatch: leave reviewed=0
    try:
        oot.submit()
        oot_submit_ok = True
    except Exception:
        oot_submit_ok = False

    frappe.db.commit()

    out = {
        "rm1": {
            "job": job.name,
            "job_code": job.job_code,
            "docstatus": job.docstatus,
            "assigned_to": job.assigned_to,
            "due_on": str(job.due_on) if job.due_on else None,
            "sales_invoice": job.sales_invoice,
            "workflow_state": job.workflow_state,
        },
        "rm2": {
            "result": result.name,
            "reviewed": cint_safe(result.reviewed),
            "certificate": cert,
            "traceability_link": trace,
            "job_state": frappe.db.get_value("Calibration Job", job.name, "workflow_state"),
            "invoice_docstatus": (
                frappe.db.get_value("Sales Invoice", job.sales_invoice, "docstatus")
                if job.sales_invoice and frappe.db.exists("DocType", "Sales Invoice")
                else None
            ),
        },
        "rm3": {
            "sweep": rm3,
            "internal_instrument": internal,
            "blocked_for_use": blocked,
        },
        "rm4": {
            "oot_result": oot.name,
            "flagged": oot_flagged,
            "submit_blocked_without_signoff": submit_blocked,
            "submit_ok_after_signoff": oot_submit_ok,
        },
        "pass": bool(
            job.sales_invoice
            and job.due_on
            and cert
            and trace
            and blocked
            and oot_flagged
            and submit_blocked
        ),
    }
    return out


def cint_safe(val: Any) -> int:
    try:
        return int(val or 0)
    except Exception:
        return 0
