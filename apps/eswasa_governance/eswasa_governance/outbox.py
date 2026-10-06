# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""L5 side-effect outbox — in-txn enqueue, after-commit delivery, retry → dead-letter.

Feed key: ``{doctype}:{name}:{state}:{rule}``. Handlers are idempotent on it.
A gate submit never rolls back because delivery failed (map §5.4 L5).
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, now_datetime

_MAX_ATTEMPTS = 5
# Backoff minutes: attempt 1→2, 2→3, … (capped)
_BACKOFF_MINUTES = (1, 5, 15, 60, 180)


def feed_key(doctype: str, name: str, state: str, rule: str) -> str:
	return f"{doctype}:{name}:{state}:{rule}"


def enqueue(
	doctype: str,
	name: str,
	state: str,
	rule: str,
	payload: dict[str, Any] | None = None,
	*,
	max_attempts: int = _MAX_ATTEMPTS,
) -> str | None:
	"""Write an outbox row in the **current** transaction (L1). Idempotent on feed_key."""
	if not frappe.db.exists("DocType", "Eswasa Outbox Entry"):
		# DocType not migrated yet — fall back to Comment marker (legacy).
		_legacy_comment(doctype, name, state, rule, payload or {})
		return None

	key = feed_key(doctype, name, state, rule)
	existing = frappe.db.get_value(
		"Eswasa Outbox Entry",
		{"feed_key": key},
		["name", "status"],
		as_dict=True,
	)
	if existing:
		if existing.status in ("Delivered", "Pending", "Processing"):
			return existing.name
		# Dead Letter re-enqueue: reset for another cycle.
		frappe.db.set_value(
			"Eswasa Outbox Entry",
			existing.name,
			{
				"status": "Pending",
				"attempts": 0,
				"last_error": None,
				"next_retry_at": now_datetime(),
				"payload": json.dumps(payload or {}),
			},
			update_modified=False,
		)
		return existing.name

	doc = frappe.get_doc(
		{
			"doctype": "Eswasa Outbox Entry",
			"feed_key": key,
			"status": "Pending",
			"reference_doctype": doctype,
			"reference_name": name,
			"state": state,
			"rule": rule,
			"attempts": 0,
			"max_attempts": max_attempts or _MAX_ATTEMPTS,
			"next_retry_at": now_datetime(),
			"payload": payload or {},
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert(ignore_permissions=True)
	return doc.name


def _legacy_comment(
	doctype: str, name: str, state: str, rule: str, payload: dict
) -> None:
	key = feed_key(doctype, name, state, rule)
	comment = frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Info",
			"reference_doctype": doctype,
			"reference_name": name,
			"content": f"[eswasa_outbox] {key} {json.dumps(payload)[:500]}",
		}
	)
	comment.set_new_name()
	comment.db_insert()


def schedule_delivery(entry_name: str | None = None, *, after_commit: bool = True) -> None:
	"""Enqueue worker (external effects only). Set after_commit=False if already committed."""
	try:
		frappe.enqueue(
			"eswasa_governance.outbox.process_one",
			entry_name=entry_name,
			enqueue_after_commit=after_commit,
			queue="short",
		)
	except Exception:
		frappe.log_error(title="eswasa_outbox.schedule_delivery")


def process_one(entry_name: str | None = None) -> None:
	"""Deliver a single Pending row (or the next due row)."""
	if not frappe.db.exists("DocType", "Eswasa Outbox Entry"):
		return
	if entry_name:
		row = frappe.get_doc("Eswasa Outbox Entry", entry_name)
	else:
		name = frappe.db.get_value(
			"Eswasa Outbox Entry",
			{
				"status": "Pending",
				"next_retry_at": ["<=", now_datetime()],
			},
			"name",
			order_by="next_retry_at asc",
		)
		if not name:
			return
		row = frappe.get_doc("Eswasa Outbox Entry", name)

	if row.status == "Delivered":
		return
	if row.status == "Dead Letter":
		return

	row.status = "Processing"
	row.save(ignore_permissions=True)
	frappe.db.commit()

	try:
		_deliver(row)
		row.reload()
		row.status = "Delivered"
		row.delivered_at = now_datetime()
		row.last_error = None
		row.save(ignore_permissions=True)
		frappe.db.commit()
	except Exception as exc:
		_fail(row, exc)


def _deliver(row) -> None:
	"""Idempotent handler stub — plug email/PDF/Pastel/feed here by rule."""
	payload = row.payload
	if isinstance(payload, str):
		try:
			payload = json.loads(payload)
		except Exception:
			payload = {}
	frappe.logger("eswasa_outbox").info(
		f"deliver {row.feed_key} attempts={row.attempts} payload_keys="
		f"{list((payload or {}).keys())}"
	)
	# Real handlers register by rule prefix; default is log-only success.
	handler = _HANDLERS.get(row.rule) or _HANDLERS.get((row.rule or "").split(":")[0])
	if handler:
		handler(row, payload or {})


def _fail(row, exc: BaseException) -> None:
	attempts = cint(row.attempts) + 1
	max_a = cint(row.max_attempts) or _MAX_ATTEMPTS
	err = frappe.get_traceback() or str(exc)
	row.reload()
	row.attempts = attempts
	row.last_error = err[:2000]
	if attempts >= max_a:
		row.status = "Dead Letter"
		row.next_retry_at = None
		row.save(ignore_permissions=True)
		frappe.db.commit()
		_notify_dead_letter(row)
	else:
		backoff = _BACKOFF_MINUTES[min(attempts - 1, len(_BACKOFF_MINUTES) - 1)]
		row.status = "Pending"
		row.next_retry_at = add_to_date(now_datetime(), minutes=backoff)
		row.save(ignore_permissions=True)
		frappe.db.commit()


def _notify_dead_letter(row) -> None:
	"""L5 — surface dead-letter to System Admin via ToDo."""
	try:
		todo = frappe.get_doc(
			{
				"doctype": "ToDo",
				"description": (
					f"[eswasa_outbox dead-letter] {row.feed_key}\n"
					f"{(row.last_error or '')[:400]}"
				),
				"reference_type": "Eswasa Outbox Entry",
				"reference_name": row.name,
				"status": "Open",
				"priority": "High",
				"role": "System Manager",
				"date": frappe.utils.nowdate(),
			}
		)
		todo.flags.ignore_permissions = True
		todo.insert(ignore_permissions=True)
		frappe.db.commit()
	except Exception:
		frappe.log_error(title="eswasa_outbox.dead_letter_todo")


def process_pending(limit: int = 50) -> dict[str, Any]:
	"""Cron / scheduler: drain due Pending rows."""
	if not frappe.db.exists("DocType", "Eswasa Outbox Entry"):
		return {"processed": 0, "skipped": "no DocType"}
	names = frappe.get_all(
		"Eswasa Outbox Entry",
		filters={
			"status": "Pending",
			"next_retry_at": ["<=", now_datetime()],
		},
		pluck="name",
		order_by="next_retry_at asc",
		limit_page_length=cint(limit) or 50,
	)
	ok = 0
	for name in names:
		try:
			process_one(name)
			ok += 1
		except Exception:
			frappe.log_error(title=f"eswasa_outbox.process {name}")
	return {"processed": ok, "queued": len(names)}


# Optional rule handlers (email/PDF/Pastel plug-ins).
_HANDLERS: dict[str, Any] = {}


def register_handler(rule: str, fn) -> None:
	_HANDLERS[rule] = fn
