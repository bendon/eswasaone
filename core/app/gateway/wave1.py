"""Wave 1 Frontend Workflow Capture — contract endpoints (F0b).

Stubs call Frappe when healthy; otherwise return typed empty/error shapes.
Full OpenAPI sync of legacy paths is tracked in docs/MULTIAGENT_FRONTEND.md —
do not regenerate types.ts from the thin yaml alone.
"""

from __future__ import annotations

import logging
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.audit import audit_log
from app.frappe_client import FrappeClient, FrappeError, get_frappe_client
from app.frappe_errors import raise_from_frappe
from app.identity.deps import AuthContext, require_auth_csrf

logger = logging.getLogger("eswasaone.core.wave1")

router = APIRouter(tags=["wave1"])


class AllowedAction(BaseModel):
    action: str
    label: str
    rule_id: str | None = None
    danger: bool = False
    consequence: str | None = None


class ConfirmBody(BaseModel):
    confirm: bool = False


class AuditPatchBody(BaseModel):
    action: str
    confirm: bool = False
    payload: dict[str, Any] = Field(default_factory=dict)


class BallotVoteBody(BaseModel):
    vote: str  # approve | disapprove | abstain
    comment: str | None = None
    confirm: bool = False


class EscalateBody(BaseModel):
    confirm: bool = False
    reason: str | None = None


class CartItemBody(BaseModel):
    code: str
    qty: int = 1


class CartBody(BaseModel):
    items: list[CartItemBody] = Field(default_factory=list)
    confirm: bool = False


def _need_confirm(confirm: bool) -> None:
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm=true required before commit",
        )


# --- Certification audits PATCH ---------------------------------------------


@router.patch("/certification/audits/{audit_id}")
async def patch_certification_audit(
    audit_id: str,
    body: AuditPatchBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> dict[str, Any]:
    _need_confirm(body.confirm)
    audit_log(
        action=f"certification.audits.{body.action}",
        actor=auth.user.username,
        resource="Audit",
        detail={"id": audit_id, "payload": body.payload, "idempotency_key": idempotency_key},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        return {
            "id": audit_id,
            "status": "submitted" if body.action == "submit_outcome" else body.action,
            "allowed_actions": [],
            "idempotency_key": idempotency_key,
        }
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.patch_audit",
            json={
                "name": audit_id,
                "action": body.action,
                "payload": body.payload,
                "confirm": True,
                "idempotency_key": idempotency_key,
            },
        )
        return raw if isinstance(raw, dict) else {"id": audit_id, "ok": True}
    except FrappeError as exc:
        raise_from_frappe(exc)


@router.post("/certification/certificates/{cert_id}/revoke")
async def revoke_certificate(
    cert_id: str,
    body: ConfirmBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    _need_confirm(body.confirm)
    audit_log(
        action="certification.certificates.revoke",
        actor=auth.user.username,
        resource=cert_id,
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        return {"id": cert_id, "status": "revoked"}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.revoke_certificate",
            json={"name": cert_id, "confirm": True},
        )
        return raw if isinstance(raw, dict) else {"id": cert_id, "status": "revoked"}
    except FrappeError as exc:
        raise_from_frappe(exc)


@router.post("/certification/certificates/{cert_id}/renew")
async def renew_certificate(
    cert_id: str,
    body: ConfirmBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    _need_confirm(body.confirm)
    audit_log(
        action="certification.certificates.renew",
        actor=auth.user.username,
        resource=cert_id,
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        return {"id": cert_id, "status": "renewed"}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.renew_certificate",
            json={"name": cert_id, "confirm": True},
        )
        return raw if isinstance(raw, dict) else {"id": cert_id, "status": "renewed"}
    except FrappeError as exc:
        raise_from_frappe(exc)


@router.get("/certification/certificates/{cert_id}/pdf")
async def certificate_pdf(
    cert_id: str,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if auth.mock or not await frappe.health():
        return {"id": cert_id, "download_url": None, "detail": "Frappe unavailable"}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.certificate_pdf",
            params={"name": cert_id},
        )
        return raw if isinstance(raw, dict) else {"id": cert_id, "download_url": None}
    except FrappeError as exc:
        raise_from_frappe(exc)


# --- Standards ballot vote --------------------------------------------------


@router.post("/standards/ballots/{ballot_id}/vote")
async def vote_ballot(
    ballot_id: str,
    body: BallotVoteBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    _need_confirm(body.confirm)
    if body.vote not in {"approve", "disapprove", "abstain"}:
        raise HTTPException(status_code=400, detail="vote must be approve|disapprove|abstain")
    audit_log(
        action="standards.ballots.vote",
        actor=auth.user.username,
        resource=ballot_id,
        detail={"vote": body.vote},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        return {"id": ballot_id, "vote": body.vote, "status": "recorded"}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_standards.api.vote_ballot",
            json={
                "name": ballot_id,
                "vote": body.vote,
                "comment": body.comment,
                "confirm": True,
            },
        )
        return raw if isinstance(raw, dict) else {"id": ballot_id, "vote": body.vote}
    except FrappeError as exc:
        raise_from_frappe(exc)


# --- Approvals escalate -----------------------------------------------------


@router.post("/approvals/{doctype}/{name}/escalate")
async def escalate_approval(
    doctype: str,
    name: str,
    body: EscalateBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    """Operator escalate for SLA-breached items (R-A2 companion to cron sweep)."""
    _need_confirm(body.confirm)
    from app.events.bus import get_feed_bus
    from app.events.sla import escalate_item

    audit_log(
        action="approvals.escalate",
        actor=auth.user.username,
        resource=f"{doctype}/{name}",
        detail={"reason": body.reason},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        return {"doctype": doctype, "name": name, "status": "escalated", "rule": "R-A2"}
    session = auth.frappe(frappe)
    result = await escalate_item(
        session,
        {
            "doctype": doctype,
            "name": name,
            "title": body.reason or name,
            "module": "governance",
        },
        bus=get_feed_bus(),
        dry_run=False,
        actor=auth.user.username,
    )
    return {
        "doctype": result.doctype,
        "name": result.name,
        "title": result.title,
        "module": result.module,
        "from_role": result.from_role,
        "to_role": result.to_role,
        "status": result.status,
        "detail": result.detail,
        "feed_id": result.feed_id,
        "rule": "R-A2",
    }

# --- Field me-scope ---------------------------------------------------------


@router.get("/field/me/audits")
async def field_my_audits(
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if auth.mock or not await frappe.health():
        return {"items": []}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.list_audits",
            params={"auditor": auth.user.username},
        )
        if isinstance(raw, dict) and "items" in raw:
            return raw
        if isinstance(raw, list):
            return {"items": raw}
        return {"items": []}
    except FrappeError as exc:
        raise_from_frappe(exc)


@router.get("/field/me/summary")
async def field_my_summary(
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if auth.mock or not await frappe.health():
        return {
            "next_audit": None,
            "schedule": [],
            "leave_balance": None,
            "unread": 0,
            "outbox_pending": 0,
        }
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.field_summary",
            params={"user": auth.user.username},
        )
        return raw if isinstance(raw, dict) else {"next_audit": None, "schedule": []}
    except FrappeError:
        return {"next_audit": None, "schedule": [], "leave_balance": None, "unread": 0}


# --- E-store cart / order poll / licence ------------------------------------


@router.post("/estore/cart")
async def estore_cart(
    body: CartBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
) -> dict[str, Any]:
    """Upsert session cart (Core-held until checkout)."""
    cart_id = f"CART-{auth.user.username}"
    return {
        "cart_id": cart_id,
        "items": [i.model_dump() for i in body.items],
        "count": sum(i.qty for i in body.items),
    }


@router.get("/estore/orders/{order_id}")
async def estore_order_status(
    order_id: str,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if auth.mock or not await frappe.health():
        return {
            "order_id": order_id,
            "status": "pending",
            "allowed_actions": [
                {"action": "retry", "label": "Retry payment", "rule_id": "R-E3"},
            ],
        }
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_estore.api.order_status",
            params={"name": order_id},
        )
        return raw if isinstance(raw, dict) else {"order_id": order_id, "status": "unknown"}
    except FrappeError as exc:
        raise_from_frappe(exc)


@router.get("/estore/licences/{licence_id}/download")
async def estore_licence_download(
    licence_id: str,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if auth.mock or not await frappe.health():
        return {"licence_id": licence_id, "download_url": None, "detail": "unavailable"}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_estore.api.licence_download",
            params={"name": licence_id},
        )
        return raw if isinstance(raw, dict) else {"licence_id": licence_id, "download_url": None}
    except FrappeError as exc:
        raise_from_frappe(exc)


# --- HR access-requests + expense claims list -------------------------------


@router.get("/hr/access-requests")
async def list_access_requests(
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
) -> dict[str, Any]:
    _ = auth
    return {"items": []}


class AccessRequestBody(BaseModel):
    reason: str
    requested_roles: list[str] = Field(default_factory=list)
    confirm: bool = False


@router.post("/hr/access-requests")
async def create_access_request(
    body: AccessRequestBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
) -> dict[str, Any]:
    _need_confirm(body.confirm)
    audit_log(
        action="hr.access_requests.create",
        actor=auth.user.username,
        resource="Access Request",
        detail=body.model_dump(),
        confirmed=True,
    )
    return {
        "id": f"AR-{uuid.uuid4().hex[:8].upper()}",
        "status": "Open",
        "reason": body.reason,
        "requested_roles": body.requested_roles,
    }

@router.get("/hr/expense-claims")
async def list_expense_claims(
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if auth.mock or not await frappe.health():
        return {"items": []}
    try:
        raw = await auth.frappe(frappe).method("eswasa_governance.api.list_expense_claims")
        return raw if isinstance(raw, dict) else {"items": []}
    except FrappeError:
        return {"items": []}


# --- TBT triage -------------------------------------------------------------


@router.post("/tbt/alerts/{alert_id}/{triage_action}")
async def tbt_triage(
    alert_id: str,
    triage_action: str,
    body: ConfirmBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if triage_action not in {"assess", "publish", "dismiss"}:
        raise HTTPException(status_code=400, detail="action must be assess|publish|dismiss")
    _need_confirm(body.confirm)
    audit_log(
        action=f"tbt.alerts.{triage_action}",
        actor=auth.user.username,
        resource=alert_id,
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        return {"id": alert_id, "action": triage_action, "rule": "R-T1"}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_tbt.api.triage_alert",
            json={"name": alert_id, "action": triage_action, "confirm": True},
        )
        return raw if isinstance(raw, dict) else {"id": alert_id, "action": triage_action}
    except FrappeError as exc:
        raise_from_frappe(exc)


# --- Ingest curation --------------------------------------------------------


@router.get("/ingest/queue")
async def ingest_queue(
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if auth.mock or not await frappe.health():
        return {"items": []}
    try:
        raw = await auth.frappe(frappe).method("eswasa_ingest.api.list_queue")
        return raw if isinstance(raw, dict) else {"items": []}
    except FrappeError:
        return {"items": []}


@router.post("/ingest/items/{item_id}/{curate_action}")
async def ingest_curate(
    item_id: str,
    curate_action: str,
    body: ConfirmBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if curate_action not in {"approve", "reject", "flag_rights"}:
        raise HTTPException(status_code=400, detail="action must be approve|reject|flag_rights")
    _need_confirm(body.confirm)
    audit_log(
        action=f"ingest.{curate_action}",
        actor=auth.user.username,
        resource=item_id,
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        return {"id": item_id, "action": curate_action}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_ingest.api.curate",
            json={"name": item_id, "action": curate_action, "confirm": True},
        )
        return raw if isinstance(raw, dict) else {"id": item_id, "action": curate_action}
    except FrappeError as exc:
        raise_from_frappe(exc)
