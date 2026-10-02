"""System Admin Access Security routes — /admin/access/* (+ gate for nginx later)."""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel

from app.admin.access_store import (
    AccessStore,
    get_access_store,
    make_device,
    make_event,
    make_network,
)
from app.audit import audit_log
from app.identity.deps import AuthContext, get_optional_auth, require_system_manager
from app.schemas import (
    AdminAccessDevice,
    AdminAccessDeviceCreate,
    AdminAccessDevicePatch,
    AdminAccessEvaluateResult,
    AdminAccessEvent,
    AdminAccessNetwork,
    AdminAccessNetworkCreate,
    AdminAccessPolicy,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-access"])

DEVICE_COOKIE = "eswasaone_device"


class PatchAccessPolicyBody(BaseModel):
    confirm: bool
    policy: AdminAccessPolicy


class EvaluateBody(BaseModel):
    """Optional preview inputs for System Managers."""

    ip: str | None = None
    fingerprint: str | None = None
    username: str | None = None
    path: str | None = "/institution/"
    record: bool = False


def _require_confirm(confirm: bool) -> None:
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm=true required before commit",
        )


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    if request.client:
        return request.client.host
    return None


def _device_fingerprint(request: Request) -> str | None:
    header = request.headers.get("x-eswasaone-device")
    if header and header.strip():
        return header.strip()
    cookie = request.cookies.get(DEVICE_COOKIE)
    if cookie and cookie.strip():
        return cookie.strip()
    return None


def evaluate_institution_access(
    store: AccessStore,
    *,
    ip: str | None,
    fingerprint: str | None,
    username: str | None = None,
    path: str | None = "/institution/",
    record: bool = False,
) -> AdminAccessEvaluateResult:
    policy = store.get_policy()
    on_net = store.ip_on_trusted_network(ip)
    device = store.find_device_by_fingerprint(fingerprint)
    device_status = device.status if device else None

    if not policy.enforce_off_lan:
        result = AdminAccessEvaluateResult(
            allowed=True,
            reason="enforce_off_lan_disabled",
            enforce_off_lan=False,
            on_trusted_network=on_net,
            device_status=device_status,
            redirect_path=policy.redirect_path,
        )
    elif on_net:
        result = AdminAccessEvaluateResult(
            allowed=True,
            reason="trusted_network",
            enforce_off_lan=True,
            on_trusted_network=True,
            device_status=device_status,
            redirect_path=policy.redirect_path,
        )
    elif device and device.status == "approved":
        # Soft-touch last_seen
        devices = store.list_devices()
        for d in devices:
            if d.id == device.id:
                from app.admin.access_store import _now_iso

                d.last_seen_at = _now_iso()
                d.last_seen_ip = ip
                break
        store.save_devices(devices)
        result = AdminAccessEvaluateResult(
            allowed=True,
            reason="device_approved",
            enforce_off_lan=True,
            on_trusted_network=False,
            device_status="approved",
            redirect_path=policy.redirect_path,
        )
    else:
        reason = "device_missing"
        if device and device.status == "pending":
            reason = "device_pending"
        elif device and device.status == "revoked":
            reason = "device_revoked"
        elif device and device.status == "expired":
            reason = "device_expired"
        result = AdminAccessEvaluateResult(
            allowed=False,
            reason=reason,
            enforce_off_lan=True,
            on_trusted_network=False,
            device_status=device_status,
            redirect_path=policy.redirect_path or "/",
        )

    if record:
        store.append_event(
            make_event(
                outcome="allow" if result.allowed else "deny",
                reason=result.reason,
                ip=ip,
                username=username,
                device_id=device.id if device else None,
                path=path,
            )
        )
    return result


# --- Admin CRUD ----------------------------------------------------------------


@router.get("/admin/access/policy", response_model=AdminAccessPolicy)
async def get_access_policy(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    store: Annotated[AccessStore, Depends(get_access_store)],
) -> AdminAccessPolicy:
    _ = auth
    return store.get_policy()


@router.put("/admin/access/policy", response_model=AdminAccessPolicy)
async def put_access_policy(
    body: PatchAccessPolicyBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    store: Annotated[AccessStore, Depends(get_access_store)],
) -> AdminAccessPolicy:
    _require_confirm(body.confirm)
    if not body.policy.redirect_path.startswith("/"):
        raise HTTPException(status_code=400, detail="redirect_path must be absolute path")
    audit_log(
        action="admin.access.policy.put",
        actor=auth.user.username,
        resource="AccessPolicy",
        detail=body.policy.model_dump(),
        confirmed=True,
    )
    return store.set_policy(body.policy)


@router.get("/admin/access/networks")
async def list_access_networks(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    store: Annotated[AccessStore, Depends(get_access_store)],
) -> dict[str, Any]:
    _ = auth
    return {"items": store.list_networks()}


@router.post("/admin/access/networks", status_code=status.HTTP_201_CREATED)
async def create_access_network(
    body: AdminAccessNetworkCreate,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    store: Annotated[AccessStore, Depends(get_access_store)],
) -> AdminAccessNetwork:
    _require_confirm(body.confirm)
    try:
        net = make_network(
            label=body.label,
            cidr=body.cidr,
            enabled=body.enabled,
            notes=body.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid CIDR: {exc}") from exc
    items = store.list_networks()
    items.append(net)
    store.save_networks(items)
    audit_log(
        action="admin.access.networks.create",
        actor=auth.user.username,
        resource=net.id,
        detail={"cidr": net.cidr, "label": net.label},
        confirmed=True,
    )
    return net


@router.delete("/admin/access/networks/{network_id}")
async def delete_access_network(
    network_id: str,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    store: Annotated[AccessStore, Depends(get_access_store)],
    confirm: Annotated[bool, Query()] = False,
) -> dict[str, bool]:
    _require_confirm(confirm)
    items = store.list_networks()
    kept = [n for n in items if n.id != network_id]
    if len(kept) == len(items):
        raise HTTPException(status_code=404, detail="Network not found")
    store.save_networks(kept)
    audit_log(
        action="admin.access.networks.delete",
        actor=auth.user.username,
        resource=network_id,
        detail={},
        confirmed=True,
    )
    return {"ok": True}


@router.get("/admin/access/devices")
async def list_access_devices(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    store: Annotated[AccessStore, Depends(get_access_store)],
) -> dict[str, Any]:
    _ = auth
    return {"items": store.list_devices()}


@router.post("/admin/access/devices", status_code=status.HTTP_201_CREATED)
async def create_access_device(
    body: AdminAccessDeviceCreate,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    store: Annotated[AccessStore, Depends(get_access_store)],
) -> AdminAccessDevice:
    _require_confirm(body.confirm)
    if not body.fingerprint.strip():
        raise HTTPException(status_code=400, detail="fingerprint required")
    existing = store.find_device_by_fingerprint(body.fingerprint.strip())
    if existing:
        raise HTTPException(status_code=409, detail="Device fingerprint already registered")
    device = make_device(
        label=body.label,
        fingerprint=body.fingerprint,
        owner_username=body.owner_username,
        status=body.status,
        expires_at=body.expires_at,
        notes=body.notes,
        approved_by=auth.user.username if body.status == "approved" else None,
    )
    items = store.list_devices()
    items.append(device)
    store.save_devices(items)
    audit_log(
        action="admin.access.devices.create",
        actor=auth.user.username,
        resource=device.id,
        detail={"status": device.status, "label": device.label},
        confirmed=True,
    )
    return device


@router.patch("/admin/access/devices/{device_id}", response_model=AdminAccessDevice)
async def patch_access_device(
    device_id: str,
    body: AdminAccessDevicePatch,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    store: Annotated[AccessStore, Depends(get_access_store)],
) -> AdminAccessDevice:
    _require_confirm(body.confirm)
    items = store.list_devices()
    target: AdminAccessDevice | None = None
    for d in items:
        if d.id == device_id:
            target = d
            break
    if target is None:
        raise HTTPException(status_code=404, detail="Device not found")

    from app.admin.access_store import _now_iso

    if body.label is not None:
        target.label = body.label.strip()
    if body.owner_username is not None:
        target.owner_username = body.owner_username or None
    if body.expires_at is not None:
        target.expires_at = body.expires_at or None
    if body.notes is not None:
        target.notes = body.notes
    if body.status is not None:
        target.status = body.status
        if body.status == "approved":
            target.approved_at = _now_iso()
            target.approved_by = auth.user.username
        if body.status == "revoked":
            target.approved_by = auth.user.username

    store.save_devices(items)
    audit_log(
        action="admin.access.devices.patch",
        actor=auth.user.username,
        resource=device_id,
        detail=body.model_dump(exclude={"confirm"}, exclude_none=True),
        confirmed=True,
    )
    return target


@router.get("/admin/access/events")
async def list_access_events(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    store: Annotated[AccessStore, Depends(get_access_store)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    _ = auth
    return {"items": store.list_events(limit=limit)}


@router.post("/admin/access/evaluate", response_model=AdminAccessEvaluateResult)
async def evaluate_access_preview(
    body: EvaluateBody,
    request: Request,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    store: Annotated[AccessStore, Depends(get_access_store)],
) -> AdminAccessEvaluateResult:
    """System Manager what-if / test against current policy."""
    ip = body.ip or _client_ip(request)
    fingerprint = body.fingerprint or _device_fingerprint(request)
    return evaluate_institution_access(
        store,
        ip=ip,
        fingerprint=fingerprint,
        username=body.username or auth.user.username,
        path=body.path or "/institution/",
        record=body.record,
    )


# --- Gate for future nginx auth_request ---------------------------------------


@router.get("/auth/institution-access", response_model=AdminAccessEvaluateResult)
async def institution_access_gate(
    request: Request,
    response: Response,
    store: Annotated[AccessStore, Depends(get_access_store)],
    auth: Annotated[AuthContext | None, Depends(get_optional_auth)],
) -> AdminAccessEvaluateResult:
    """Edge check for /institution — nginx can auth_request this later.

    Returns HTTP 200 when allowed, 403 when denied (body still JSON for clients).
    Does not enforce until ``enforce_off_lan`` is enabled in Access policy.
    """
    username = None
    if auth and not auth.is_guest:
        username = auth.user.username
    result = evaluate_institution_access(
        store,
        ip=_client_ip(request),
        fingerprint=_device_fingerprint(request),
        username=username,
        path=request.headers.get("x-original-uri", "/institution/"),
        record=True,
    )
    if not result.allowed:
        response.status_code = status.HTTP_403_FORBIDDEN
    return result
