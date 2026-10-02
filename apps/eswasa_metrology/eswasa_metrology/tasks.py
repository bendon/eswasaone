"""Scheduled tasks for the metrology app (R-M3 daily sweep)."""

from __future__ import annotations

import frappe

from eswasa_metrology.rules import rm3_calibration_due_sweep


def run_daily_metro_rules() -> None:
    """Daily sweep: instrument calibration due / overdue block (R-M3)."""
    try:
        rm3_calibration_due_sweep()
    except Exception:
        frappe.log_error(title="eswasa_metrology R-M3 failed")
