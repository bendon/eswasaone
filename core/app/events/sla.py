"""R-A2 SLA sweep — overdue approvals → escalate role + in-app feed notify.

Picks ``sla_breached`` items from ``eswasa_governance.api.list_approvals``
(or a provided queue), escalates open ToDos to the next fixture role, leaves an
idempotent Comment marker, publishes OpenAPI ``FeedItem`` events on ``/ws/feed``,
and stubs email/SMS via the messaging adapter.

Cron: ``POST /api/events/sla/sweep`` with ``{"confirm": true}`` as staff
(see ``core/README.md``). No Frappe whitelist for escalate yet — Core uses
``frappe.client`` resource writes under the acting user's permissions.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from app.adapters.messaging import EmailRequest, SmsRequest, get_messaging
from app.audit import audit_log
from app.events.bus import FeedBus, get_feed_bus
from app.frappe_client import FrappeClient, FrappeError

logger = logging.getLogger(__name__)

# Marker on Comment / ToDo description — skip re-escalation within the same day.
ESCALATE_MARKER = "R-A2-ESCALATED"
DEFAULT_SLA_DAYS = 3

Severity = Literal["info", "success", "warn", "critical"]

# Module → escalation ladder (fixture role names only). Last rung is System Manager.
ESCALATION_LADDER: dict[str, list[str]] = {
    "certification": [
        "Certification Officer",
        "Certification Manager",
        "System Manager",
    ],
    "metrology": [
        "Eswasa Metrology Officer",
        "Eswasa Metrology Manager",
        "System Manager",
    ],
    "standards": [
        "Eswasa Standards Officer",
        "Eswasa Standards Manager",
        "System Manager",
    ],
    "governance": [
        "Eswasa Board Secretary",
        "Eswasa Board Member",
        "System Manager",
    ],
    "tbt": [
        "Eswasa TBT Analyst",
        "Eswasa TBT Officer",
        "System Manager",
    ],
    "finance": [
        "Accounts User",
        "Accounts Manager",
        "System Manager",
    ],
    "hr": [
        "HR User",
        "HR Manager",
        "System Manager",
    ],
    "crm": [
        "Sales User",
        "Sales Manager",
        "System Manager",
    ],
    "training": [
        "Eswasa Standards Officer",
        "Eswasa Standards Manager",
        "System Manager",
    ],
    "estore": [
        "Eswasa Estore Clerk",
        "Eswasa Estore Manager",
        "System Manager",
    ],
}

_DEFAULT_LADDER = ["Desk User", "System Manager"]


@dataclass
class EscalationResult:
    doctype: str
    name: str
    title: str
    module: str
    from_role: str | None
    to_role: str | None
    status: Literal["escalated", "skipped", "dry_run", "error"]
    detail: str = ""
    feed_id: str | None = None


@dataclass
class SweepReport:
    scanned: int = 0
    breached: int = 0
    escalated: int = 0
    skipped: int = 0
    errors: int = 0
    dry_run: bool = False
    results: list[EscalationResult] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "scanned": self.scanned,
            "breached": self.breached,
            "escalated": self.escalated,
            "skipped": self.skipped,
            "errors": self.errors,
            "dry_run": self.dry_run,
            "results": [
                {
                    "doctype": r.doctype,
                    "name": r.name,
                    "title": r.title,
                    "module": r.module,
                    "from_role": r.from_role,
                    "to_role": r.to_role,
                    "status": r.status,
                    "detail": r.detail,
                    "feed_id": r.feed_id,
                }
                for r in self.results
            ],
        }


def next_escalation_role(module: str, current_role: str | None) -> str | None:
    """Return the next ladder role above ``current_role``, or first rung if unset."""
    ladder = ESCALATION_LADDER.get((module or "").lower(), _DEFAULT_LADDER)
    if not current_role:
        return ladder[0]
    norm = current_role.strip().lower()
    for idx, role in enumerate(ladder):
        if role.lower() == norm:
            if idx + 1 < len(ladder):
                return ladder[idx + 1]
            return None  # already at top
    # Unknown current role — start at first rung that is not the current label
    return ladder[0]


def _today_marker() -> str:
    return f"{ESCALATE_MARKER}:{datetime.now(timezone.utc).date().isoformat()}"


async def _list_breached_approvals(
    session: FrappeClient,
    *,
    limit: int = 50,
) -> tuple[int, list[dict[str, Any]]]:
    """Prefer governance whitelist; fall back to Workflow Action + ToDo get_list.

    Returns ``(scanned_count, breached_items)``.
    """
    try:
        raw = await session.method(
            "eswasa_governance.api.list_approvals",
            params={"limit": limit},
        )
        items: list[Any] = []
        if isinstance(raw, dict):
            items = list(raw.get("items") or [])
        elif isinstance(raw, list):
            items = raw
        dict_items = [i for i in items if isinstance(i, dict)]
        breached = [i for i in dict_items if i.get("sla_breached")]
        if dict_items:
            return len(dict_items), breached
    except FrappeError as exc:
        logger.warning("list_approvals unavailable (%s) — falling back to get_list", exc)

    fallback = await _fallback_breached_from_resources(session, limit=limit)
    return len(fallback), fallback


async def _fallback_breached_from_resources(
    session: FrappeClient,
    *,
    limit: int,
) -> list[dict[str, Any]]:
    """Thin fallback when governance API is missing — open ToDos past due date."""
    today = datetime.now(timezone.utc).date().isoformat()
    try:
        raw = await session.method(
            "frappe.client.get_list",
            json={
                "doctype": "ToDo",
                "fields": [
                    "name",
                    "description",
                    "date",
                    "reference_type",
                    "reference_name",
                    "role",
                    "creation",
                ],
                "filters": [
                    ["status", "=", "Open"],
                    ["reference_type", "is", "set"],
                    ["reference_name", "is", "set"],
                    ["date", "<", today],
                ],
                "limit_page_length": limit,
                "order_by": "date asc",
            },
        )
    except FrappeError:
        return []

    rows = raw if isinstance(raw, list) else []
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        doctype = str(row.get("reference_type") or "")
        name = str(row.get("reference_name") or "")
        if not doctype or not name:
            continue
        out.append(
            {
                "id": f"{doctype}::{name}",
                "doctype": doctype,
                "name": name,
                "title": (row.get("description") or name)[:160],
                "module": "governance",
                "status": "Pending",
                "due_at": row.get("date"),
                "sla_breached": True,
                "_todo_role": row.get("role"),
            }
        )
    return out


async def _already_escalated_today(
    session: FrappeClient,
    doctype: str,
    name: str,
) -> bool:
    marker = _today_marker()
    try:
        comments = await session.method(
            "frappe.client.get_list",
            json={
                "doctype": "Comment",
                "fields": ["name", "content"],
                "filters": [
                    ["reference_doctype", "=", doctype],
                    ["reference_name", "=", name],
                    ["content", "like", f"%{marker}%"],
                ],
                "limit_page_length": 1,
            },
        )
        if isinstance(comments, list) and comments:
            return True
    except FrappeError as exc:
        logger.debug("comment idempotency check failed: %s", exc)
    return False


async def _open_todos(
    session: FrappeClient,
    doctype: str,
    name: str,
) -> list[dict[str, Any]]:
    try:
        raw = await session.method(
            "frappe.client.get_list",
            json={
                "doctype": "ToDo",
                "fields": [
                    "name",
                    "description",
                    "role",
                    "allocated_to",
                    "priority",
                    "date",
                ],
                "filters": [
                    ["status", "=", "Open"],
                    ["reference_type", "=", doctype],
                    ["reference_name", "=", name],
                ],
                "limit_page_length": 20,
            },
        )
        if isinstance(raw, list):
            return [r for r in raw if isinstance(r, dict)]
    except FrappeError as exc:
        logger.warning("ToDo list failed for %s %s: %s", doctype, name, exc)
    return []


async def _set_todo_role(
    session: FrappeClient,
    todo_name: str,
    *,
    role: str,
    description_suffix: str,
) -> None:
    """Update ToDo role/priority/description via frappe.client.set_value (one field)."""
    desc = ""
    try:
        doc = await session.resource("ToDo", name=todo_name)
        data = doc.get("data", doc) if isinstance(doc, dict) else {}
        desc = str(data.get("description") or "")
    except FrappeError:
        desc = ""
    if description_suffix not in desc:
        desc = (desc + "\n" + description_suffix).strip()

    for fieldname, value in (
        ("role", role),
        ("priority", "High"),
        ("description", desc),
    ):
        await session.method(
            "frappe.client.set_value",
            json={
                "doctype": "ToDo",
                "name": todo_name,
                "fieldname": fieldname,
                "value": value,
            },
        )


async def _insert_escalation_todo(
    session: FrappeClient,
    *,
    doctype: str,
    name: str,
    role: str,
    title: str,
    marker: str,
) -> None:
    await session.method(
        "frappe.client.insert",
        json={
            "doc": {
                "doctype": "ToDo",
                "description": f"SLA escalate: {title} ({doctype} {name})\n{marker}",
                "reference_type": doctype,
                "reference_name": name,
                "status": "Open",
                "priority": "High",
                "role": role,
                "date": datetime.now(timezone.utc).date().isoformat(),
            }
        },
    )


async def _add_comment(
    session: FrappeClient,
    *,
    doctype: str,
    name: str,
    content: str,
) -> None:
    await session.method(
        "frappe.client.insert",
        json={
            "doc": {
                "doctype": "Comment",
                "comment_type": "Info",
                "reference_doctype": doctype,
                "reference_name": name,
                "content": content,
            }
        },
    )


async def _notify_stub(
    *,
    title: str,
    doctype: str,
    name: str,
    to_role: str,
) -> None:
    """Email/SMS console fallback — # TODO: wire real role recipient lookup."""
    messaging = get_messaging()
    subject = f"[R-A2] SLA escalate → {to_role}: {title}"
    body = (
        f"Approval pending beyond SLA for {doctype} {name}.\n"
        f"Escalated to role: {to_role}.\n"
        f"# TODO: wire real recipient directory for role {to_role}"
    )
    await messaging.send_email(
        EmailRequest(to=f"role-{to_role.replace(' ', '-').lower()}@eswasa.local", subject=subject, body=body)
    )
    await messaging.send_sms(
        SmsRequest(to="+26870000000", body=f"SLA escalate {doctype} {name} → {to_role}"[:160])
    )


async def escalate_item(
    session: FrappeClient,
    item: dict[str, Any],
    *,
    bus: FeedBus,
    dry_run: bool = False,
    actor: str = "sla-sweep",
) -> EscalationResult:
    doctype = str(item.get("doctype") or "")
    name = str(item.get("name") or "")
    title = str(item.get("title") or name)
    module = str(item.get("module") or "governance")

    if not doctype or not name:
        return EscalationResult(
            doctype=doctype,
            name=name,
            title=title,
            module=module,
            from_role=None,
            to_role=None,
            status="error",
            detail="missing doctype/name",
        )

    if await _already_escalated_today(session, doctype, name):
        return EscalationResult(
            doctype=doctype,
            name=name,
            title=title,
            module=module,
            from_role=None,
            to_role=None,
            status="skipped",
            detail="already escalated today",
        )

    todos = await _open_todos(session, doctype, name)
    current_role: str | None = None
    if todos:
        current_role = str(todos[0].get("role") or "") or None
    elif item.get("_todo_role"):
        current_role = str(item["_todo_role"]) or None

    to_role = next_escalation_role(module, current_role)
    if not to_role:
        return EscalationResult(
            doctype=doctype,
            name=name,
            title=title,
            module=module,
            from_role=current_role,
            to_role=None,
            status="skipped",
            detail="already at top of escalation ladder",
        )
    if current_role and current_role.lower() == to_role.lower():
        return EscalationResult(
            doctype=doctype,
            name=name,
            title=title,
            module=module,
            from_role=current_role,
            to_role=to_role,
            status="skipped",
            detail="next role equals current",
        )

    marker = _today_marker()
    comment = (
        f"[{marker}] Escalated approval from "
        f"{current_role or '(unassigned)'} → {to_role} (R-A2 SLA sweep)."
    )

    if dry_run:
        return EscalationResult(
            doctype=doctype,
            name=name,
            title=title,
            module=module,
            from_role=current_role,
            to_role=to_role,
            status="dry_run",
            detail=comment,
        )

    try:
        if todos:
            await _set_todo_role(
                session,
                str(todos[0]["name"]),
                role=to_role,
                description_suffix=comment,
            )
        else:
            await _insert_escalation_todo(
                session,
                doctype=doctype,
                name=name,
                role=to_role,
                title=title,
                marker=marker,
            )
        await _add_comment(session, doctype=doctype, name=name, content=comment)
    except FrappeError as exc:
        logger.exception("escalate write failed for %s %s", doctype, name)
        return EscalationResult(
            doctype=doctype,
            name=name,
            title=title,
            module=module,
            from_role=current_role,
            to_role=to_role,
            status="error",
            detail=str(exc),
        )

    feed = await bus.publish(
        "sla.escalated",
        {
            "doctype": doctype,
            "name": name,
            "module": module,
            "from_role": current_role,
            "to_role": to_role,
            "rule": "R-A2",
        },
        title=f"SLA escalate: {title}",
        body=f"{doctype} {name} → {to_role}",
        severity="warn",
        href=f"/approvals?doctype={doctype}&name={name}",
    )

    try:
        await _notify_stub(title=title, doctype=doctype, name=name, to_role=to_role)
    except Exception as exc:  # noqa: BLE001 — notify must not fail the sweep
        logger.warning("notify stub failed: %s", exc)

    audit_log(
        action="events.sla.escalate",
        actor=actor,
        resource=f"{doctype}:{name}",
        confirmed=True,
        detail={"from_role": current_role, "to_role": to_role, "feed_id": feed.get("id")},
    )

    return EscalationResult(
        doctype=doctype,
        name=name,
        title=title,
        module=module,
        from_role=current_role,
        to_role=to_role,
        status="escalated",
        detail=comment,
        feed_id=str(feed.get("id")) if feed.get("id") else None,
    )


async def run_sla_sweep(
    session: FrappeClient,
    *,
    bus: FeedBus | None = None,
    limit: int = 50,
    dry_run: bool = False,
    actor: str = "sla-sweep",
    items: list[dict[str, Any]] | None = None,
) -> SweepReport:
    """Scan overdue approvals and escalate. ``items`` overrides Frappe fetch (tests)."""
    feed = bus or get_feed_bus()
    report = SweepReport(dry_run=dry_run)

    if items is None:
        scanned, queue = await _list_breached_approvals(session, limit=limit)
        report.scanned = scanned
    else:
        report.scanned = len(items)
        queue = [i for i in items if i.get("sla_breached")]

    report.breached = len(queue)

    for item in queue:
        result = await escalate_item(
            session,
            item,
            bus=feed,
            dry_run=dry_run,
            actor=actor,
        )
        report.results.append(result)
        if result.status == "escalated":
            report.escalated += 1
        elif result.status == "error":
            report.errors += 1
        else:
            report.skipped += 1

    if report.escalated or (dry_run and report.breached):
        await feed.publish(
            "sla.sweep.complete",
            {
                "escalated": report.escalated,
                "breached": report.breached,
                "skipped": report.skipped,
                "errors": report.errors,
                "dry_run": dry_run,
            },
            title="SLA sweep complete",
            body=(
                f"breached={report.breached} escalated={report.escalated} "
                f"skipped={report.skipped} errors={report.errors}"
            ),
            severity="info" if report.errors == 0 else "warn",
        )

    return report
