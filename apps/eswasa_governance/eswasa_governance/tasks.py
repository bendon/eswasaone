"""Scheduler entrypoints for eswasa_governance (R-G1 daily, L5 outbox, L1 reconcile)."""

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


def process_outbox() -> None:
	"""L5 — drain due Pending outbox rows (retries → dead-letter)."""
	from eswasa_governance.outbox import process_pending

	try:
		result = process_pending(limit=50)
		frappe.logger("eswasa_governance").info(f"outbox: {result}")
	except Exception:
		frappe.log_error(title="eswasa_governance outbox process failed")


def reconcile_owner_todos() -> None:
	"""L1 reconciler — docs in owner-requiring states with no open ToDo."""
	from eswasa_governance.reconcile import backfill_missing_todos

	try:
		result = backfill_missing_todos()
		frappe.logger("eswasa_governance").info(f"reconcile todos: {result}")
	except Exception:
		frappe.log_error(title="eswasa_governance reconcile todos failed")
