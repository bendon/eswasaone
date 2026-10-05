"""Governance business rules R-G1…R-G3.

Triggered from hooks.doc_events / scheduler_events and the assemble_board_pack
whitelist. Side-effects are idempotent. Feed pattern cloned from certification.
"""

from __future__ import annotations

import re
from typing import Any

import frappe
from frappe.utils import add_days, cint, getdate, now_datetime, nowdate, strip_html

FEED_REALTIME_EVENT = "eswasa_feed"
BOARD_SECRETARY_ROLE = "Eswasa Board Secretary"
RISK_OFFICER_ROLE = "Eswasa Risk Officer"
BOARD_MEMBER_ROLE = "Eswasa Board Member"

# Likelihood / impact ranks for severity derivation
_SEVERITY_RANK = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}

_ACTION_LINE = re.compile(
	r"^\s*(?:action(?:\s*item)?|ai|todo|owner)\s*[:\-–]\s*(.+)$",
	re.I | re.M,
)


# ---------------------------------------------------------------------------
# Shared helpers (cert publish_feed pattern)
# ---------------------------------------------------------------------------


def _log(title: str, detail: str = "") -> None:
	try:
		frappe.logger("eswasa_governance").info(f"{title}: {detail}")
	except Exception:
		pass
	try:
		frappe.log_error(message=detail or title, title=f"[gov] {title}"[:140])
	except Exception:
		pass


def _comment(doctype: str, name: str, content: str, comment_type: str = "Info") -> None:
	"""Best-effort Comment (db_insert to avoid recursive on_change hooks)."""
	try:
		comment = frappe.get_doc(
			{
				"doctype": "Comment",
				"comment_type": comment_type,
				"reference_doctype": doctype,
				"reference_name": name,
				"content": content,
			}
		)
		comment.set_new_name()
		comment.db_insert()
	except Exception:
		pass


def publish_feed(
	*,
	event: str,
	subject: str,
	reference_doctype: str,
	reference_name: str,
	detail: str | None = None,
	status: str | None = None,
) -> None:
	"""Feed stub Core can consume: realtime + Notification Log + Comment."""
	payload = {
		"source": "eswasa_governance",
		"event": event,
		"subject": subject,
		"status": status,
		"reference_doctype": reference_doctype,
		"reference_name": reference_name,
		"detail": detail,
		"at": str(now_datetime()),
	}
	try:
		frappe.publish_realtime(
			FEED_REALTIME_EVENT,
			payload,
			after_commit=True,
		)
	except Exception:
		pass

	try:
		if frappe.db.exists("DocType", "Notification Log"):
			nlog = frappe.get_doc(
				{
					"doctype": "Notification Log",
					"subject": f"[{event}] {subject}"[:140],
					"email_content": detail or subject,
					"document_type": reference_doctype,
					"document_name": reference_name,
					"type": "Alert",
					"from_user": frappe.session.user or "Administrator",
				}
			)
			nlog.insert(ignore_permissions=True)
	except Exception:
		_log("feed_notification_log_failed", event)

	_comment(
		reference_doctype,
		reference_name,
		f"[feed:{event}] {subject}" + (f": {detail}" if detail else ""),
	)


def _notify_email(recipients: list[str], subject: str, message: str) -> None:
	recipients = [r for r in recipients if r and "@" in r]
	if not recipients:
		return
	try:
		frappe.sendmail(
			recipients=recipients,
			subject=subject,
			message=message,
			delayed=True,
			retry=0,
		)
	except Exception:
		_log("email_failed", subject)


def _users_with_role(role: str) -> list[str]:
	try:
		return frappe.get_all(
			"Has Role",
			filters={"role": role, "parenttype": "User"},
			pluck="parent",
		) or []
	except Exception:
		return []


def _emails_for_role(role: str) -> list[str]:
	emails: list[str] = []
	for user in _users_with_role(role):
		if user in ("Administrator", "Guest"):
			continue
		try:
			email = frappe.db.get_value("User", user, "email")
			if email and "@" in email:
				emails.append(email)
		except Exception:
			pass
	return emails


def _assign_todo(
	*,
	doctype: str,
	name: str,
	description: str,
	allocated_to: str | None = None,
	role: str | None = None,
	priority: str = "Medium",
	marker: str | None = None,
) -> str | None:
	"""Create an open ToDo (idempotent on marker / role+ref / allocated+ref+desc)."""
	filters: dict[str, Any] = {
		"reference_type": doctype,
		"reference_name": name,
		"status": "Open",
	}
	if marker:
		existing = frappe.db.sql(
			"""
			select name from `tabToDo`
			where reference_type=%s and reference_name=%s and status='Open'
			  and description like %s
			limit 1
			""",
			(doctype, name, f"%{marker}%"),
		)
		if existing:
			return existing[0][0]
	elif role:
		filters["role"] = role
		if frappe.db.exists("ToDo", filters):
			return frappe.db.get_value("ToDo", filters, "name")
	elif allocated_to:
		filters["allocated_to"] = allocated_to
		if frappe.db.exists("ToDo", filters):
			# Still create if description differs materially — check marker-less soft match
			pass

	desc = description
	if marker and marker not in desc:
		desc = f"{marker}\n{desc}"

	try:
		todo = frappe.get_doc(
			{
				"doctype": "ToDo",
				"description": desc,
				"reference_type": doctype,
				"reference_name": name,
				"allocated_to": allocated_to,
				"role": role,
				"assigned_by": frappe.session.user or "Administrator",
				"status": "Open",
				"priority": priority,
			}
		)
		todo.insert(ignore_permissions=True)
		return todo.name
	except Exception:
		_log("assign_todo_failed", f"{doctype} {name}")
		return None


def _safe_get_all(doctype: str, **kwargs: Any) -> list[Any]:
	"""get_all with try/except — never call other apps' private APIs."""
	try:
		if not frappe.db.exists("DocType", doctype):
			return []
		return frappe.get_all(doctype, **kwargs) or []
	except Exception:
		return []


def _safe_count(doctype: str, filters: dict[str, Any] | None = None) -> int | None:
	try:
		if not frappe.db.exists("DocType", doctype):
			return None
		return int(frappe.db.count(doctype, filters or {}) or 0)
	except Exception:
		return None


# ---------------------------------------------------------------------------
# Pack assembly (shared by R-G1 cron + whitelist)
# ---------------------------------------------------------------------------


def collect_module_report_sections() -> list[dict[str, str]]:
	"""Pull high-level summaries from known DocTypes (best-effort)."""
	sections: list[dict[str, str]] = []

	# Certification
	open_apps = _safe_count("Certification Application")
	overdue = _safe_count("Certification Audit", {"status": "Overdue"})
	if overdue is None or overdue == 0:
		overdue = _safe_count("Audit", {"status": "Overdue"}) or 0
	if open_apps is not None:
		attn = (overdue or 0) > 0
		sections.append(
			{
				"title": f"Certification: {open_apps} open apps"
				+ (f", {overdue} overdue audits" if overdue else ""),
				"status": "outstanding" if attn else "ready",
			}
		)

	# Standards
	published = _safe_count("Standard", {"workflow_state": "Published"})
	if published is None:
		published = _safe_count("Standard")
	open_ballots = _safe_count("Ballot", {"workflow_state": ["in", ["Open", "Draft"]]})
	if published is not None:
		sections.append(
			{
				"title": f"Standards: {published} published"
				+ (f", {open_ballots} open ballots" if open_ballots else ""),
				"status": "outstanding" if (open_ballots or 0) > 0 else "ready",
			}
		)

	# Metrology
	open_jobs = _safe_count(
		"Calibration Job",
		{"status": ["in", ["Open", "In Progress", "Scheduled", "Draft"]]},
	)
	if open_jobs is None:
		open_jobs = _safe_count("Calibration Job")
	if open_jobs is not None:
		sections.append(
			{
				"title": f"Metrology: {open_jobs} calibration jobs",
				"status": "ready",
			}
		)

	# Finance (Sales Invoice — count only, no private API)
	inv_ytd = _safe_count("Sales Invoice", {"docstatus": 1})
	if inv_ytd is not None:
		sections.append(
			{
				"title": f"Finance: {inv_ytd} posted invoices on record",
				"status": "ready",
			}
		)

	# TBT
	tbt_open = _safe_count(
		"TBT Notification",
		{"workflow_state": ["in", ["Draft", "Review", "Open"]]},
	)
	if tbt_open is None:
		tbt_open = _safe_count("TBT Notification")
	if tbt_open is not None:
		sections.append(
			{
				"title": f"TBT: {tbt_open} notifications",
				"status": "outstanding" if tbt_open > 5 else "ready",
			}
		)

	# Risks (High / Critical impact)
	high_risks = _safe_get_all(
		"Risk Register Entry",
		filters={
			"status": ["in", ["Open", "Mitigating"]],
			"impact": ["in", ["High", "Critical"]],
		},
		fields=["risk_id", "title", "impact"],
		limit_page_length=20,
	)
	if high_risks:
		sections.append(
			{
				"title": f"Risks: {len(high_risks)} High/Critical open",
				"status": "outstanding",
			}
		)
	elif frappe.db.exists("DocType", "Risk Register Entry"):
		sections.append({"title": "Risks: none High/Critical open", "status": "ready"})

	# Resolutions pending adoption
	pending_res = _safe_get_all(
		"Board Resolution",
		filters={"workflow_state": ["in", ["Draft", "Review"]]},
		fields=["name", "title", "workflow_state"],
		limit_page_length=20,
	)
	if pending_res:
		sections.append(
			{
				"title": f"Resolutions: {len(pending_res)} pending adoption",
				"status": "outstanding",
			}
		)
	elif frappe.db.exists("DocType", "Board Resolution"):
		sections.append({"title": "Resolutions: none pending", "status": "ready"})

	# Linked resolution rows already on pack are handled by caller
	return sections


def _format_agenda(sections: list[dict[str, str]], meeting_label: str) -> str:
	lines = [
		f"<h3>BOARD pack assembly: {frappe.utils.escape_html(meeting_label)}</h3>",
		f"<p><em>Assembled {now_datetime()}</em></p>",
		"<ul>",
	]
	for s in sections:
		status = s.get("status") or "outstanding"
		title = frappe.utils.escape_html(s.get("title") or "Section")
		mark = "✓" if status == "ready" else "○"
		lines.append(f"<li>{mark} [{status}] {title}</li>")
	lines.append("</ul>")
	return "\n".join(lines)


def _resolve_board_pack(meeting: str) -> Any | None:
	"""Resolve meeting path param to a Board Pack document name."""
	if not meeting:
		return None
	meeting = meeting.strip()
	if frappe.db.exists("Board Pack", meeting):
		return meeting
	# pack_code / title fallback
	row = frappe.db.get_value(
		"Board Pack",
		{"pack_code": meeting},
		"name",
	)
	if row:
		return row
	# meeting date string YYYY-MM-DD → soonest pack on/after that date
	try:
		d = getdate(meeting)
	except Exception:
		d = None
	if d:
		packs = frappe.get_all(
			"Board Pack",
			filters={"meeting_date": [">=", d]},
			fields=["name"],
			order_by="meeting_date asc",
			limit_page_length=1,
		)
		if packs:
			return packs[0].name
	return None


def assemble_pack_for_meeting(meeting: str, *, notify: bool = True) -> dict[str, Any]:
	"""Assemble Board Pack agenda from module reports; return BoardPackSummary shape."""
	pack_name = _resolve_board_pack(meeting)
	if not pack_name:
		frappe.throw(f"Board Pack not found for meeting '{meeting}'", frappe.DoesNotExistError)

	pack = frappe.get_doc("Board Pack", pack_name)
	sections = collect_module_report_sections()

	# Merge linked resolutions as sections
	if pack.resolutions:
		for code in [c.strip() for c in pack.resolutions.replace(";", ",").split(",") if c.strip()]:
			if frappe.db.exists("Board Resolution", code):
				row = frappe.db.get_value(
					"Board Resolution",
					code,
					["title", "workflow_state"],
					as_dict=True,
				)
				state = (row.workflow_state or "Draft") if row else "Draft"
				sections.append(
					{
						"title": f"Resolution: {(row.title if row else code)}",
						"status": "ready" if state == "Adopted" else "outstanding",
					}
				)
			else:
				sections.append({"title": f"Resolution: {code}", "status": "outstanding"})

	if not sections:
		sections = [
			{
				"title": pack.title or pack.pack_code or pack.name,
				"status": "outstanding",
			}
		]

	label = pack.title or pack.pack_code or pack.name
	agenda = _format_agenda(sections, label)
	# Preserve any prior non-BOARD content above a marker
	prior = pack.agenda or ""
	marker = "<!-- BOARD-PACK-ASSEMBLY -->"
	if marker in prior:
		prior = prior.split(marker)[0].rstrip()
	pack.agenda = f"{prior}\n{marker}\n{agenda}".strip() if prior else f"{marker}\n{agenda}"
	pack.flags.ignore_permissions = True
	pack.flags.rg1_assembling = True
	pack.save(ignore_permissions=True)

	outstanding = sum(1 for s in sections if s.get("status") != "ready")
	due_label = (
		f"Board pack due {frappe.utils.formatdate(pack.meeting_date, 'dd MMM yyyy')}"
		if pack.meeting_date
		else (pack.title or pack.pack_code or "Board pack")
	)

	summary = {
		"due_label": due_label,
		"outstanding_sections": outstanding,
		"sections": [{"title": s["title"], "status": s["status"]} for s in sections],
		"pack": pack.name,
	}

	if notify and outstanding:
		_notify_secretary_outstanding(pack, outstanding, sections)

	publish_feed(
		event="BOARD",
		subject=f"Board pack assembled: {pack.name}",
		reference_doctype="Board Pack",
		reference_name=pack.name,
		detail=f"outstanding={outstanding}; sections={len(sections)}",
		status=pack.workflow_state or "Draft",
	)
	return summary


def _notify_secretary_outstanding(pack: Any, outstanding: int, sections: list[dict]) -> None:
	titles = [s["title"] for s in sections if s.get("status") != "ready"]
	body = (
		f"Board Pack {pack.name} ({pack.title}) has {outstanding} outstanding "
		f"section(s) ahead of the meeting on {pack.meeting_date}:\n\n"
		+ "\n".join(f"- {t}" for t in titles)
	)
	_notify_email(
		_emails_for_role(BOARD_SECRETARY_ROLE),
		subject=f"[BOARD] Outstanding pack sections: {pack.name}",
		message=body,
	)
	_assign_todo(
		doctype="Board Pack",
		name=pack.name,
		description=f"R-G1: Complete {outstanding} outstanding board pack section(s)",
		role=BOARD_SECRETARY_ROLE,
		priority="High",
		marker="R-G1:outstanding",
	)


def _already_assembled_today(pack_name: str) -> bool:
	"""Idempotency: skip if we already wrote a BOARD feed comment today."""
	today = nowdate()
	try:
		rows = frappe.get_all(
			"Comment",
			filters={
				"reference_doctype": "Board Pack",
				"reference_name": pack_name,
				"creation": [">=", today],
			},
			fields=["content"],
			limit_page_length=50,
		)
		for r in rows:
			if r.content and "[feed:BOARD]" in (r.content or ""):
				return True
	except Exception:
		pass
	return False


# ---------------------------------------------------------------------------
# R-G1 — Board Meeting in 7d → assemble pack, notify secretary
# ---------------------------------------------------------------------------


def rg1_board_meetings_in_7d() -> dict[str, Any]:
	"""Daily cron: packs with meeting_date == today+7 → assemble + notify."""
	target = add_days(getdate(nowdate()), 7)
	packs = frappe.get_all(
		"Board Pack",
		filters={
			"meeting_date": target,
			"workflow_state": ["in", ["Draft", "Review", ""]],
		},
		fields=["name", "title", "meeting_date", "workflow_state"],
		limit_page_length=50,
	)
	# Also catch blank workflow_state via broader query if needed
	if not packs:
		packs = frappe.get_all(
			"Board Pack",
			filters={"meeting_date": target},
			fields=["name", "title", "meeting_date", "workflow_state"],
			limit_page_length=50,
		)
		packs = [p for p in packs if (p.workflow_state or "Draft") != "Adopted"]

	done: list[str] = []
	for p in packs:
		if _already_assembled_today(p.name):
			continue
		try:
			assemble_pack_for_meeting(p.name, notify=True)
			done.append(p.name)
		except Exception:
			_log("rg1_assemble_failed", p.name)
			frappe.log_error(title=f"R-G1 assemble {p.name}")

	return {"target_date": str(target), "assembled": done}


# ---------------------------------------------------------------------------
# R-G2 — Resolution Adopted → action-item ToDos; track to closure
# ---------------------------------------------------------------------------


def _resolution_owners(doc: Any) -> list[str]:
	"""Resolve proposer/seconder to User names when possible."""
	owners: list[str] = []
	for field in ("proposer", "seconder"):
		val = (doc.get(field) or "").strip()
		if not val:
			continue
		if frappe.db.exists("User", val):
			owners.append(val)
			continue
		# email match
		user = frappe.db.get_value("User", {"email": val}, "name")
		if user:
			owners.append(user)
	return list(dict.fromkeys(owners))


def _action_items_from_body(body: str | None) -> list[str]:
	if not body:
		return []
	# Preserve block boundaries before stripping tags
	normalized = re.sub(r"</p\s*>|<br\s*/?>|</li\s*>|</div\s*>", "\n", body or "", flags=re.I)
	plain = strip_html(normalized) if normalized else ""
	items = [m.group(1).strip() for m in _ACTION_LINE.finditer(plain)]
	# Also split inline "Action: … Action: …" on a single line
	if len(items) <= 1 and re.search(r"\bAction\s*:", plain, re.I):
		parts = re.split(r"\b(?:Action(?:\s*item)?|AI|TODO|Owner)\s*:", plain, flags=re.I)
		items = [p.strip(" -\t") for p in parts if p and p.strip(" -\t")]
	# Deduplicate, keep first 12
	seen: set[str] = set()
	out: list[str] = []
	for it in items:
		key = it.lower()
		if key in seen or len(it) < 3:
			continue
		seen.add(key)
		out.append(it[:200])
		if len(out) >= 12:
			break
	return out


def rg2_resolution_adopted(doc, method: str | None = None) -> None:
	"""On Board Resolution update: if Adopted, spawn owner ToDos."""
	if getattr(doc, "flags", None) and doc.flags.get("rg2_done"):
		return
	if (doc.workflow_state or "") != "Adopted":
		return

	# Only fire on transition into Adopted
	before = getattr(doc, "_doc_before_save", None)
	if before is not None and (before.workflow_state or "") == "Adopted":
		return

	marker_base = f"R-G2:{doc.name}"
	owners = _resolution_owners(doc)
	actions = _action_items_from_body(doc.body)
	if not actions:
		actions = [f"Execute adopted resolution: {doc.title or doc.name}"]

	created: list[str] = []
	if owners:
		for owner in owners:
			for i, action in enumerate(actions):
				name = _assign_todo(
					doctype="Board Resolution",
					name=doc.name,
					description=f"R-G2 action: {action}",
					allocated_to=owner,
					priority="High",
					marker=f"{marker_base}:{i}:{owner}",
				)
				if name:
					created.append(name)
	else:
		for i, action in enumerate(actions):
			name = _assign_todo(
				doctype="Board Resolution",
				name=doc.name,
				description=f"R-G2 action: {action}",
				role=BOARD_SECRETARY_ROLE,
				priority="High",
				marker=f"{marker_base}:{i}:secretary",
			)
			if name:
				created.append(name)

	publish_feed(
		event="R-G2",
		subject=f"Resolution adopted: {doc.name}",
		reference_doctype="Board Resolution",
		reference_name=doc.name,
		detail=f"todos={len(created)}; owners={','.join(owners) or BOARD_SECRETARY_ROLE}",
		status="Adopted",
	)
	if getattr(doc, "flags", None) is not None:
		doc.flags.rg2_done = True


def rg2_todo_closure_check(doc, method: str | None = None) -> None:
	"""When a resolution ToDo closes, feed if all sibling action ToDos are closed."""
	if (doc.status or "") != "Closed":
		return
	if (doc.reference_type or "") != "Board Resolution" or not doc.reference_name:
		return
	desc = doc.description or ""
	if "R-G2" not in desc:
		return

	open_left = frappe.db.sql(
		"""
		select count(*) from `tabToDo`
		where reference_type=%s and reference_name=%s
		  and status='Open' and description like %s
		""",
		("Board Resolution", doc.reference_name, "%R-G2%"),
	)[0][0]
	if cint(open_left) > 0:
		return

	# Idempotent closure feed
	existing = frappe.db.sql(
		"""
		select name from `tabComment`
		where reference_doctype=%s and reference_name=%s
		  and content like %s
		limit 1
		""",
		("Board Resolution", doc.reference_name, "%[feed:R-G2-CLOSED]%"),
	)
	if existing:
		return

	publish_feed(
		event="R-G2-CLOSED",
		subject=f"Resolution actions closed: {doc.reference_name}",
		reference_doctype="Board Resolution",
		reference_name=doc.reference_name,
		detail="All R-G2 action ToDos closed",
		status="Closed",
	)


# ---------------------------------------------------------------------------
# R-G3 — High risk → exec alert + review cadence
# ---------------------------------------------------------------------------


def _risk_severity(doc: Any) -> str:
	"""Derive low|medium|high from likelihood × impact ranks."""
	lik = _SEVERITY_RANK.get((doc.get("likelihood") or "").strip(), 0)
	imp = _SEVERITY_RANK.get((doc.get("impact") or "").strip(), 0)
	rank = max(lik, imp)
	if rank >= 3:
		return "high"
	if rank == 2:
		return "medium"
	return "low"


def _review_cadence_days(severity: str, impact: str | None) -> int:
	if (impact or "") == "Critical" or severity == "high":
		return 7 if (impact or "") == "Critical" else 14
	if severity == "medium":
		return 30
	return 90


def rg3_high_risk_alert(doc, method: str | None = None) -> None:
	"""On Risk Register Entry insert/update: High → feed alert + next_review_date."""
	if getattr(doc, "flags", None) and doc.flags.get("rg3_done"):
		return
	if (doc.status or "Open") == "Closed":
		return

	severity = _risk_severity(doc)
	if severity != "high":
		return

	# Fire on new High or transition into High
	before = getattr(doc, "_doc_before_save", None)
	if before is not None and method == "on_update":
		if _risk_severity(before) == "high" and (before.status or "Open") != "Closed":
			# Already high — still ensure review date is set, but skip re-alert
			if doc.get("next_review_date"):
				return

	days = _review_cadence_days(severity, doc.get("impact"))
	review = add_days(getdate(nowdate()), days)
	if hasattr(doc, "next_review_date"):
		# Set via db_set to avoid recursion when called from on_update after save
		try:
			if method in ("after_insert", None) or not doc.get("next_review_date"):
				doc.db_set("next_review_date", review, update_modified=False)
		except Exception:
			_log("rg3_review_date_failed", doc.name)

	publish_feed(
		event="R-G3",
		subject=f"High risk alert: {doc.risk_id or doc.name}",
		reference_doctype="Risk Register Entry",
		reference_name=doc.name,
		detail=(
			f"{doc.title}; likelihood={doc.likelihood}; impact={doc.impact}; "
			f"review_in={days}d ({review})"
		),
		status="High",
	)

	# Exec / board member + risk officer alert
	recipients = list(
		dict.fromkeys(
			_emails_for_role(BOARD_MEMBER_ROLE) + _emails_for_role(RISK_OFFICER_ROLE)
		)
	)
	_notify_email(
		recipients,
		subject=f"[R-G3] High risk: {doc.risk_id or doc.name}",
		message=(
			f"Risk {doc.risk_id or doc.name}: {doc.title}\n"
			f"Likelihood={doc.likelihood} Impact={doc.impact}\n"
			f"Next review due: {review}\n"
			f"Owner: {doc.get('owner') or 'unassigned'}\n"
		),
	)
	# DocType field `owner` collides with Document.owner (creator); only trust
	# a non-system User that differs from the session creator when sensible.
	risk_owner = (doc.get("owner") or "").strip()
	if risk_owner in ("", "Administrator", "Guest") or not frappe.db.exists("User", risk_owner):
		risk_owner = None
	_assign_todo(
		doctype="Risk Register Entry",
		name=doc.name,
		description=f"R-G3: Review high risk {doc.risk_id or doc.name} by {review}",
		allocated_to=risk_owner,
		role=None if risk_owner else RISK_OFFICER_ROLE,
		priority="High",
		marker="R-G3:review",
	)
	if getattr(doc, "flags", None) is not None:
		doc.flags.rg3_done = True
