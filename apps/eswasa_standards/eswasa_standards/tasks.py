"""Scheduled tasks for the standards app (R-S2 daily sweep)."""

from __future__ import annotations

import frappe

from eswasa_standards.rules import rs2_review_closing_sweep


def run_daily_standards_rules() -> None:
    """Daily sweep: R-S2 public-review reminders + close → Ballot."""
    try:
        rs2_review_closing_sweep()
    except Exception:
        frappe.log_error(title="eswasa_standards R-S2 failed")
