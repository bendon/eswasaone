"""Scheduler entrypoints for eswasa_governance (R-G1 daily)."""

from __future__ import annotations

import frappe


def run_daily_governance_rules() -> None:
	"""Daily sweep: R-G1 board packs due in 7 days."""
	from eswasa_governance.rules import rg1_board_meetings_in_7d

	try:
		result = rg1_board_meetings_in_7d()
		frappe.logger("eswasa_governance").info(f"R-G1 daily: {result}")
	except Exception:
		frappe.log_error(title="eswasa_governance daily R-G1 failed")
