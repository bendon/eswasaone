# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Approval queue: Workflow Action + ToDo aggregate and workflow act."""

from __future__ import annotations

import re
from typing import Any

import frappe
from frappe import _
from frappe.model.workflow import (
	WorkflowTransitionError,
	apply_workflow,
	get_transitions,
	get_workflow_name,
)
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

# Default SLA window for Workflow Actions without an explicit due date (R-A2 signal).
_DEFAULT_SLA_DAYS = 3

_DOCTYPE_MODULE: dict[str, str] = {
	"Certification Application": "certification",
	"Certificate": "certification",
	"Audit": "certification",
	"Calibration Job": "metrology",
	"Instrument": "metrology",
	"Work Item": "standards",
	"Draft": "standards",
	"Ballot": "standards",
	"TBT Notification": "tbt",
	"Board Resolution": "governance",
	"Board Pack": "governance",
	"Risk Register Entry": "governance",
	"Sales Invoice": "finance",
	"Purchase Order": "finance",
	"Payment Entry": "finance",
	"Journal Entry": "finance",
	"Employee": "hr",
	"Leave Application": "hr",
	"Appraisal": "hr",
	"CRM Lead": "crm",
	"Lead": "crm",
	"Opportunity": "crm",
	"LMS Course": "training",
	"Course": "training",
}

# Portal action → preferred Workflow Action Master labels (exact, case-insensitive).
_ACTION_PREFERENCE: dict[str, tuple[str, ...]] = {
	"approve": (
		"approve",
		"adopt",
		"certify",
		"issue certificate",
		"clear nc",
		"accept",
		"submit for review",
		"submit for assessment",
		"submit to committee",
		"schedule audit",
		"start audit",
		"start work",
		"start drafting",
		"start surveillance",
		"start renewal",
		"reassess",
		"tag",
		"notify subscribers",
		"open public review",
		"open ballot",
		"publish / gazette",
		"dispatch",
	),
	"reject": (
		"reject",
		"withdraw",
		"cancel",
		"decline",
		"deny",
	),
	"return": (
		"return to draft",
		"return",
		"send back",
		"revise",
	),
}

_REJECT_TOKENS = ("reject", "withdraw", "cancel", "decline", "deny")
_RETURN_TOKENS = ("return", "send back", "revise")
_HTML_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def _as_bool(value: Any) -> bool:
	if isinstance(value, bool):
		return value
	if value is None:
		return False
	return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _require_confirm(confirm: Any) -> None:
	if not _as_bool(confirm):
		frappe.throw(
			_("Mutation requires confirm=true (confirm-before-commit)."),
			frappe.ValidationError,
		)


def _strip_html(text: str | None) -> str:
	if not text:
		return ""
	plain = _HTML_TAG.sub(" ", text)
	return _WS.sub(" ", plain).replace("&nbsp;", " ").strip()


def _module_for(doctype: str) -> str:
	if doctype in _DOCTYPE_MODULE:
		return _DOCTYPE_MODULE[doctype]
	# Heuristic from module / app label
	lower = doctype.lower()
	for key, mod in (
		("certif", "certification"),
		("metrolog", "metrology"),
		("calibrat", "metrology"),
		("standard", "standards"),
		("tbt", "tbt"),
		("board", "governance"),
		("risk", "governance"),
		("invoice", "finance"),
		("payment", "finance"),
		("leave", "hr"),
		("employee", "hr"),
		("lead", "crm"),
		("deal", "crm"),
		("course", "training"),
		("enrol", "training"),
	):
		if key in lower:
			return mod
	return "governance"


def _queue_id(doctype: str, name: str) -> str:
	return f"{doctype}::{name}"


def _iso_due(value: Any) -> str | None:
	if value is None or value == "":
		return None
	try:
		dt = get_datetime(value)
	except Exception:
		return str(value)
	text = str(dt)
	if " " in text and "T" not in text:
		text = text.replace(" ", "T", 1)
	if len(text) == 19:
		text += "+00:00"
	return text


def _sla_breached(due_at: Any, created: Any = None) -> bool:
	today = getdate(nowdate())
	if due_at:
		try:
			return getdate(due_at) < today
		except Exception:
			pass
	if created:
		try:
			created_dt = get_datetime(created)
			age_days = (now_datetime() - created_dt).days
			return age_days > _DEFAULT_SLA_DAYS
		except Exception:
			pass
	return False


def _doc_title(doctype: str, name: str, fallback_state: str | None = None) -> str:
	if not frappe.db.exists(doctype, name):
		return name
	try:
		meta = frappe.get_meta(doctype)
		title_field = meta.get_title_field() or meta.title_field
		fields = ["name"]
		if title_field and title_field not in fields:
			fields.append(title_field)
		for candidate in ("title", "subject", "applicant_name", "customer", "description"):
			if meta.has_field(candidate) and candidate not in fields:
				fields.append(candidate)
		row = frappe.db.get_value(doctype, name, fields, as_dict=True) or {}
		for key in fields:
			if key == "name":
				continue
			val = row.get(key)
			if val:
				title = _strip_html(str(val))
				if title:
					if fallback_state:
						return f"{title} — {fallback_state}"
					return title
		return name
	except Exception:
		return name


def _user_can_see_workflow_action(wa_name: str, roles: set[str]) -> bool:
	if frappe.session.user == "Administrator" or "System Manager" in roles:
		return True
	permitted = {
		r.role
		for r in frappe.get_all(
			"Workflow Action Permitted Role",
			filters={"parent": wa_name},
			fields=["role"],
		)
	}
	if not permitted:
		# Legacy / unrestricted open actions — still require doc read below.
		return True
	return bool(permitted & roles)


def _collect_workflow_actions(limit: int) -> list[dict[str, Any]]:
	roles = set(frappe.get_roles())
	rows = frappe.get_all(
		"Workflow Action",
		filters={"status": "Open"},
		fields=[
			"name",
			"reference_doctype",
			"reference_name",
			"workflow_state",
			"creation",
			"modified",
			"user",
		],
		order_by="modified desc",
		limit_page_length=max(limit * 4, 80),
	)
	items: list[dict[str, Any]] = []
	seen: set[str] = set()
	for row in rows:
		doctype = row.reference_doctype
		docname = row.reference_name
		if not doctype or not docname:
			continue
		if not _user_can_see_workflow_action(row.name, roles):
			continue
		if not frappe.has_permission(doctype, "read", doc=docname):
			continue
		if not frappe.db.exists(doctype, docname):
			continue
		qid = _queue_id(doctype, docname)
		if qid in seen:
			continue
		seen.add(qid)
		state = row.workflow_state or "Pending"
		due = None
		# Prefer explicit due/date on the referenced document when present.
		meta = frappe.get_meta(doctype)
		for due_field in ("due_date", "date", "expiry_date", "meeting_date"):
			if meta.has_field(due_field):
				due = frappe.db.get_value(doctype, docname, due_field)
				if due:
					break
		items.append(
			{
				"id": qid,
				"doctype": doctype,
				"name": docname,
				"title": _doc_title(doctype, docname, state),
				"module": _module_for(doctype),
				"status": state,
				"due_at": _iso_due(due),
				"sla_breached": _sla_breached(due, row.creation),
			}
		)
		if len(items) >= limit:
			break
	return items


def _todo_rows_for_user(limit: int) -> list[Any]:
	"""Open ToDos with a document reference, scoped to the session user."""
	user = frappe.session.user
	fields = [
		"name",
		"description",
		"date",
		"reference_type",
		"reference_name",
		"allocated_to",
		"role",
		"priority",
		"creation",
		"modified",
	]
	base = {
		"status": "Open",
		"reference_type": ["is", "set"],
		"reference_name": ["is", "set"],
	}
	page = max(limit * 4, 80)
	if user == "Administrator" or "System Manager" in frappe.get_roles():
		return frappe.get_all(
			"ToDo",
			filters=base,
			fields=fields,
			order_by="date asc, modified desc",
			limit_page_length=page,
		)

	mine = frappe.get_all(
		"ToDo",
		filters={**base, "allocated_to": user},
		fields=fields,
		order_by="date asc, modified desc",
		limit_page_length=page,
	)
	roles = frappe.get_roles()
	by_role = frappe.get_all(
		"ToDo",
		filters={**base, "role": ["in", roles]},
		fields=fields,
		order_by="date asc, modified desc",
		limit_page_length=page,
	)
	by_name = {r.name: r for r in mine}
	for row in by_role:
		by_name.setdefault(row.name, row)
	return list(by_name.values())


def _collect_todos(limit: int, exclude: set[str]) -> list[dict[str, Any]]:
	"""Open ToDos that reference a real document — never APR-* facade ids."""
	items: list[dict[str, Any]] = []
	for row in _todo_rows_for_user(limit):
		doctype = row.reference_type
		docname = row.reference_name
		if not doctype or not docname:
			continue
		if str(docname).upper().startswith("APR-"):
			continue
		if not frappe.db.exists(doctype, docname):
			continue
		if not frappe.has_permission(doctype, "read", doc=docname):
			continue
		qid = _queue_id(doctype, docname)
		if qid in exclude:
			continue
		exclude.add(qid)
		desc = _strip_html(row.description)
		title = desc[:160] if desc else _doc_title(doctype, docname)
		if "A10_DEMOSEED" in (row.description or "") or title.lower().startswith("a10_"):
			title = _doc_title(doctype, docname)
		state = "Pending"
		if get_workflow_name(doctype) and frappe.get_meta(doctype).has_field("workflow_state"):
			state = frappe.db.get_value(doctype, docname, "workflow_state") or "Pending"
		items.append(
			{
				"id": qid,
				"doctype": doctype,
				"name": docname,
				"title": title or docname,
				"module": _module_for(doctype),
				"status": state,
				"due_at": _iso_due(row.date),
				"sla_breached": _sla_breached(row.date, row.creation),
			}
		)
		if len(items) >= limit:
			break
	return items


def list_approval_items(limit: int = 20) -> dict[str, Any]:
	"""Aggregate pending Workflow Actions + referenced ToDos for the session user."""
	if frappe.session.user in (None, "Guest"):
		frappe.throw(_("Authentication required"), frappe.PermissionError)

	cap = cint(limit) or 20
	cap = max(1, min(cap, 100))

	# Fetch a wider window so pending_count reflects the full visible queue.
	fetch_cap = max(cap, 100)
	wa_items = _collect_workflow_actions(fetch_cap)
	seen = {i["id"] for i in wa_items}
	todo_items = _collect_todos(max(0, fetch_cap - len(wa_items)), seen)

	items = wa_items + todo_items
	# Stable ordering: SLA breaches first, then due_at, then title
	items.sort(
		key=lambda i: (
			0 if i.get("sla_breached") else 1,
			i.get("due_at") or "9999",
			i.get("title") or "",
		)
	)
	return {"items": items[:cap], "pending_count": len(items)}


def _normalize_action_label(label: str) -> str:
	return " ".join(str(label).strip().lower().replace("_", " ").replace("-", " ").split())


def _classify_transition(action_label: str) -> str:
	norm = _normalize_action_label(action_label)
	for token in _RETURN_TOKENS:
		if token in norm:
			return "return"
	for token in _REJECT_TOKENS:
		if token in norm:
			return "reject"
	return "approve"


def _pick_workflow_action(transitions: list[dict], portal_action: str) -> str | None:
	"""Map approve|reject|return onto an available Workflow transition action label."""
	wanted = portal_action.strip().lower()
	if wanted not in _ACTION_PREFERENCE:
		return None

	classified = [(t, _classify_transition(t.get("action") or "")) for t in transitions]
	candidates = [t for t, kind in classified if kind == wanted]
	if not candidates:
		return None

	prefs = _ACTION_PREFERENCE[wanted]
	ranked: list[tuple[int, str]] = []
	for t in candidates:
		label = t.get("action") or ""
		norm = _normalize_action_label(label)
		rank = len(prefs)
		for idx, pref in enumerate(prefs):
			if norm == pref or pref in norm:
				rank = idx
				break
		ranked.append((rank, label))
	ranked.sort(key=lambda x: x[0])
	return ranked[0][1] if ranked else None


def _close_related_todos(doctype: str, name: str, comment: str | None = None) -> None:
	user = frappe.session.user
	todos = frappe.get_all(
		"ToDo",
		filters={
			"status": "Open",
			"reference_type": doctype,
			"reference_name": name,
		},
		fields=["name", "allocated_to"],
	)
	for row in todos:
		if row.allocated_to and row.allocated_to != user and user != "Administrator":
			continue
		try:
			todo = frappe.get_doc("ToDo", row.name)
			todo.status = "Closed"
			if comment:
				todo.description = (todo.description or "") + f"\n[{user}] {comment}"
			todo.save(ignore_permissions=False)
		except Exception:
			frappe.log_error(title="approvals.close_todo", message=frappe.get_traceback())


def _add_workflow_comment(doctype: str, name: str, comment: str) -> None:
	try:
		c = frappe.get_doc(
			{
				"doctype": "Comment",
				"comment_type": "Workflow",
				"reference_doctype": doctype,
				"reference_name": name,
				"content": comment,
			}
		)
		c.insert(ignore_permissions=False)
	except Exception:
		frappe.log_error(title="approvals.comment", message=frappe.get_traceback())


def on_workflow_action_insert(doc, method: str | None = None) -> None:
	"""R-A1: when a Workflow Action opens, ensure a referenced ToDo exists for the queue."""
	if getattr(doc, "status", None) != "Open":
		return
	doctype = getattr(doc, "reference_doctype", None)
	name = getattr(doc, "reference_name", None)
	if not doctype or not name:
		return
	exists = frappe.db.exists(
		"ToDo",
		{
			"reference_type": doctype,
			"reference_name": name,
			"status": "Open",
		},
	)
	if exists:
		return
	roles = [r.role for r in (getattr(doc, "permitted_roles", None) or []) if getattr(r, "role", None)]
	role = roles[0] if roles else None
	state = getattr(doc, "workflow_state", None) or "Pending"
	todo = frappe.get_doc(
		{
			"doctype": "ToDo",
			"description": f"Approval pending: {doctype} {name} ({state})",
			"reference_type": doctype,
			"reference_name": name,
			"status": "Open",
			"priority": "Medium",
			"role": role,
			"date": frappe.utils.add_days(nowdate(), _DEFAULT_SLA_DAYS),
		}
	)
	todo.insert(ignore_permissions=True)


def act_on_approval_item(
	doctype: str,
	name: str,
	action: str,
	comment: str | None = None,
	confirm: Any = False,
) -> dict[str, Any]:
	"""Apply a portal approve|reject|return as a Frappe Workflow action."""
	_require_confirm(confirm)

	if frappe.session.user in (None, "Guest"):
		frappe.throw(_("Authentication required"), frappe.PermissionError)

	doctype = (doctype or "").strip()
	name = (name or "").strip()
	action = (action or "").strip().lower()

	if not doctype or not name:
		frappe.throw(_("doctype and name are required"), frappe.ValidationError)
	if action not in ("approve", "reject", "return"):
		frappe.throw(
			_("action must be approve, reject, or return"),
			frappe.ValidationError,
		)
	if str(name).upper().startswith("APR-"):
		frappe.throw(
			_("APR-* facade ids are not supported; use doctype + document name."),
			frappe.ValidationError,
		)

	if not frappe.db.exists(doctype, name):
		frappe.throw(_("{0} {1} not found").format(doctype, name), frappe.DoesNotExistError)

	if not frappe.has_permission(doctype, "write", doc=name):
		frappe.throw(
			_("Not permitted to update {0} {1}").format(doctype, name),
			frappe.PermissionError,
		)

	if not get_workflow_name(doctype):
		frappe.throw(
			_("No active workflow for {0}").format(doctype),
			frappe.ValidationError,
		)

	doc = frappe.get_doc(doctype, name)
	transitions = get_transitions(doc)

	# R-RA1: if the workflow is in a terminal state (no transitions) but there
	# are open ToDos linked to this document, treat approve/done/acknowledge as
	# "close the ToDo" rather than a workflow transition.  This handles task-type
	# approval queue items (e.g. "File gazette notice" after a resolution is Adopted).
	open_todos = frappe.get_all(
		"ToDo",
		filters={
			"status": "Open",
			"reference_type": doctype,
			"reference_name": name,
		},
		fields=["name", "allocated_to"],
	)

	if not transitions and open_todos:
		# No workflow action possible — just close the related ToDos.
		if action in ("approve", "return"):
			_close_related_todos(doctype, name, comment)
			frappe.db.commit()
			return {
				"ok": True,
				"doctype": doctype,
				"name": name,
				"action": action,
				"workflow_action": None,
				"status": getattr(doc, "workflow_state", None),
				"message": _("Closed {0} task(s) on {1} {2}").format(
					len(open_todos), doctype, name
				),
			}
		# reject on a terminal-state task → also just close
		_close_related_todos(doctype, name, comment)
		frappe.db.commit()
		return {
			"ok": True,
			"doctype": doctype,
			"name": name,
			"action": action,
			"workflow_action": None,
			"status": getattr(doc, "workflow_state", None),
			"message": _("Closed {0} task(s) on {1} {2}").format(
				len(open_todos), doctype, name
			),
		}

	if not transitions:
		frappe.throw(
			_("No permitted workflow transitions for {0} {1}").format(doctype, name),
			WorkflowTransitionError,
		)

	wf_action = _pick_workflow_action(transitions, action)
	if not wf_action:
		available = ", ".join(sorted({t.get("action") or "" for t in transitions})) or "(none)"
		frappe.throw(
			_(
				"Illegal transition: '{0}' is not available for {1} {2} in its current state. "
				"Available: {3}"
			).format(action, doctype, name, available),
			WorkflowTransitionError,
		)

	apply_workflow(doc, wf_action)

	if comment:
		_add_workflow_comment(doctype, name, comment)

	_close_related_todos(doctype, name, comment)

	# Mark matching open Workflow Actions completed if still open (apply_workflow usually does this).
	frappe.db.commit()
	doc.reload()
	state = None
	if hasattr(doc, "workflow_state"):
		state = doc.workflow_state

	return {
		"ok": True,
		"doctype": doctype,
		"name": name,
		"action": action,
		"workflow_action": wf_action,
		"status": state,
		"message": _("Applied {0} ({1}) on {2} {3}").format(action, wf_action, doctype, name),
	}
