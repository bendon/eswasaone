# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""L1 reconciler — backfill missing owner ToDos for workflow documents."""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import add_days, nowdate

# DocTypes + states that require an open owner ToDo (map §5.6 / ports).
_OWNER_STATES: dict[str, set[str]] = {
	"Certification Application": {
		"Application",
		"Assessment",
		"Audit Scheduled",
		"Audit",
		"NC Resolution",
		"Surveillance",
		"Renewal",
	},
	"Work Item": {
		"Proposed",
		"Drafting",
		"Committee",
		"Public Review",
		"Ballot",
	},
	"Calibration Job": {
		"Received",
		"In Progress",
		"Reviewed",
	},
	"TBT Notification": {
		"Ingested",
		"Tagged",
	},
	"Board Resolution": {
		"Draft",
		"Review",
	},
	"Board Pack": {
		"Draft",
		"Review",
	},
	"Field Visit": {
		"Planned",
		"Assigned",
		"Confirmed",
		"In Progress",
		"Submitted",
		"Submitted (conflict)",
		"Returned",
	},
}


def backfill_missing_todos(limit: int = 100) -> dict[str, Any]:
	"""Find docs in owner states with no open ToDo; create one."""
	created = 0
	scanned = 0
	for doctype, states in _OWNER_STATES.items():
		if not frappe.db.exists("DocType", doctype):
			continue
		meta = frappe.get_meta(doctype)
		if not meta.has_field("workflow_state"):
			continue
		rows = frappe.get_all(
			doctype,
			filters={"workflow_state": ["in", list(states)]},
			fields=["name", "workflow_state"],
			limit_page_length=limit,
		)
		for row in rows:
			scanned += 1
			open_todo = frappe.db.exists(
				"ToDo",
				{
					"reference_type": doctype,
					"reference_name": row.name,
					"status": "Open",
				},
			)
			if open_todo:
				continue
			todo = frappe.get_doc(
				{
					"doctype": "ToDo",
					"description": (
						f"[reconcile] {doctype} {row.name} @ {row.workflow_state}"
					),
					"reference_type": doctype,
					"reference_name": row.name,
					"status": "Open",
					"priority": "Medium",
					"date": add_days(nowdate(), 3),
				}
			)
			todo.flags.ignore_permissions = True
			todo.insert(ignore_permissions=True)
			created += 1
	if created:
		frappe.db.commit()
	return {"scanned": scanned, "created": created}
