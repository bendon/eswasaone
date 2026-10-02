"""Events routes — webhook consumer stubs + SLA sweep + WebSocket /ws/feed."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from app.adapters.momo import MoMoPaymentStatus, handle_callback
from app.audit import audit_log
from app.events.bus import FeedBus, get_feed_bus
from app.events.sla import run_sla_sweep
from app.frappe_client import FrappeClient, FrappeError, get_frappe_client
from app.identity.deps import AuthContext, require_staff

logger = logging.getLogger(__name__)

router = APIRouter(tags=["adapters"])
ws_router = APIRouter()


@router.post("/adapters/momo/callback")
async def momo_callback(
    body: dict[str, Any],
    bus: Annotated[FeedBus, Depends(get_feed_bus)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    """Accept MoMo Collection callback → feed + forward to eswasa_estore (R-E2/E3)."""
    event = handle_callback(body)
    if event.status == MoMoPaymentStatus.SUCCESSFUL:
        feed_type = "payment.settled"
        severity = "success"
        title = "Payment settled"
    elif event.status in (MoMoPaymentStatus.FAILED, MoMoPaymentStatus.TIMEOUT):
        feed_type = "payment.failed"
        severity = "critical"
        title = "Payment failed"
    else:
        feed_type = "payment.updated"
        severity = "info"
        title = "Payment updated"

    await bus.publish(
        feed_type,
        {
            "reference_id": event.reference_id,
            "status": event.status.value,
            "external_id": event.external_id,
            "amount": event.amount,
            "currency": event.currency,
            "reason": event.reason,
            "financial_transaction_id": event.financial_transaction_id,
        },
        title=title,
        body=f"{event.reference_id or 'n/a'} — {event.status.value}",
        severity=severity,  # type: ignore[arg-type]
    )
    audit_log(
        action="adapters.momo.callback",
        actor="momo",
        resource=event.reference_id or "unknown",
        detail={"status": event.status.value, "external_id": event.external_id},
        confirmed=True,
    )

    # R-E2 / R-E3 — guest-allowed Frappe whitelist (no session)
    frappe_out: dict[str, Any] | None = None
    try:
        if await frappe.health():
            raw = await frappe.method(
                "eswasa_estore.api.momo_callback",
                json={
                    "payload": dict(body),
                    "reference_id": event.reference_id,
                    "status": event.status.value,
                    "external_id": event.external_id,
                    "amount": event.amount,
                    "currency": event.currency,
                    "reason": event.reason,
                    "financial_transaction_id": event.financial_transaction_id,
                },
            )
            frappe_out = raw if isinstance(raw, dict) else {"result": raw}
    except FrappeError as exc:
        logger.warning("MoMo callback Frappe forward failed: %s", exc)
        frappe_out = {"ok": False, "detail": str(exc)}

    return {"status": "accepted", "frappe": frappe_out}


@router.post("/events/webhooks/{source}")
async def webhook_consumer_stub(
    source: str,
    body: dict[str, Any],
    bus: Annotated[FeedBus, Depends(get_feed_bus)],
) -> dict[str, str]:
    """Generic webhook for ingest/TBT/Frappe feed → ``/ws/feed``.

    Frappe apps should POST ``eswasa_feed`` payloads to
    ``/api/events/webhooks/eswasa_feed`` so Institution portals receive
    live updates over WebSocket (not only Desk realtime).
    """
    if source in {"eswasa_feed", "frappe-feed", "feed"}:
        event = str(body.get("event") or body.get("type") or "eswasa.feed")
        title = str(body.get("subject") or body.get("title") or event)
        detail = body.get("detail") or body.get("body")
        ref = body.get("reference_name") or body.get("name")
        doctype = body.get("reference_doctype") or body.get("doctype")
        href = None
        if doctype and ref:
            href = f"/institution/approvals"  # deep-link later per module
        await bus.publish(
            event if event.startswith(("cert.", "hr.", "sla.", "payment.", "tbt.", "std.", "metro.")) else f"frappe.{event}",
            {
                "source": body.get("source") or "frappe",
                "doctype": doctype,
                "name": ref,
                "status": body.get("status"),
                "reference_id": ref,
            },
            title=title,
            body=str(detail) if detail else None,
            severity="info",
            href=href,
        )
        return {"status": "accepted", "channel": "ws/feed"}

    await bus.publish(
        f"webhook.{source}",
        {"source": source, "body": body},
        title=f"Webhook: {source}",
        body=f"Accepted webhook from {source}",
        severity="info",
    )
    return {"status": "accepted"}


class SlaSweepBody(BaseModel):
    confirm: bool = False
    dry_run: bool = False
    limit: int = Field(default=50, ge=1, le=200)


@router.post("/events/sla/sweep")
async def sla_sweep(
    body: SlaSweepBody,
    auth: Annotated[AuthContext, Depends(require_staff)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    bus: Annotated[FeedBus, Depends(get_feed_bus)],
) -> dict[str, Any]:
    """R-A2 cron-callable: escalate overdue Workflow Action / ToDo approvals.

    Requires ``confirm: true`` (confirm-before-commit) unless ``dry_run``.
    Acts as the authenticated staff user (permissions always). Documented in
    ``core/README.md``.
    """
    if not body.dry_run and not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm must be true (or set dry_run)",
        )
    if auth.mock or not await frappe.health():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Frappe unavailable — SLA sweep requires live approvals queue",
        )

    session = auth.frappe(frappe)
    try:
        report = await run_sla_sweep(
            session,
            bus=bus,
            limit=body.limit,
            dry_run=body.dry_run,
            actor=auth.user.username,
        )
    except FrappeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    audit_log(
        action="events.sla.sweep",
        actor=auth.user.username,
        resource="approvals",
        confirmed=body.confirm or body.dry_run,
        detail={
            "dry_run": body.dry_run,
            "escalated": report.escalated,
            "breached": report.breached,
            "errors": report.errors,
        },
    )
    return report.as_dict()


@ws_router.websocket("/ws/feed")
async def ws_feed(websocket: WebSocket) -> None:
    await websocket.accept()
    bus = get_feed_bus()
    queue = bus.subscribe()

    async def _pump() -> None:
        for item in bus.recent(10):
            await websocket.send_text(json.dumps(item))
        while True:
            event = await queue.get()
            await websocket.send_text(json.dumps(event))

    pump = asyncio.create_task(_pump())
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        pump.cancel()
        bus.unsubscribe(queue)
