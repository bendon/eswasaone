"""System Administration BFF routes — /admin/* (System Manager only)."""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

import httpx
import redis
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.adapters.messaging import EmailRequest, get_messaging
from app.admin import bench as bench_ops
from app.audit import audit_log
from app.config import Settings, get_settings
from app.frappe_client import FrappeClient, FrappeError, get_frappe_client
from app.identity.deps import AuthContext, require_system_manager
from app.identity.role_profiles import (
    curated_role_names,
    get_role_profile,
    list_role_profiles,
)
from app.schemas import (
    AdminAppVersion,
    AdminBackupPolicy,
    AdminBackupSummary,
    AdminCommandResult,
    AdminEmailSettings,
    AdminIntegrationStatus,
    AdminJobsSnapshot,
    AdminLogEntry,
    AdminOverview,
    AdminScheduledJob,
    AdminSchedulerResponse,
    AdminServiceStatus,
    AdminSystemSettings,
    AdminUpdateRunBody,
    AdminUpdatesResponse,
    AdminUserSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

SYSTEM_SETTINGS_ALLOWLIST = frozenset(
    {
        "time_zone",
        "date_format",
        "number_format",
        "session_expiry",
        "enable_scheduler",
        "disable_user_pass_login",
        "allow_consecutive_login_attempts",
    }
)


def _require_confirm(confirm: bool) -> None:
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm=true required before commit",
        )


def _raise_from_frappe(exc: FrappeError) -> None:
    from app.frappe_errors import raise_from_frappe

    raise_from_frappe(exc)


async def _ensure_frappe(frappe: FrappeClient) -> None:
    if not await frappe.health():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Frappe unavailable",
        )


def _truthy(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    if val in (None, "", 0, "0", "No", "no", False):
        return False
    return bool(val)


def _ago(seconds: float) -> str:
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}s ago"
    if seconds < 3600:
        return f"{seconds // 60}m ago"
    if seconds < 86400:
        return f"{seconds // 3600}h ago"
    return f"{seconds // 86400}d ago"


def _human_size(nbytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(nbytes)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{nbytes} B"


def _parse_list_apps(text: str) -> list[AdminAppVersion]:
    apps: list[AdminAppVersion] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.lower().startswith("app"):
            continue
        # Formats: "frappe 15.x.x" | "frappe\t15.x.x\tversion-15" | "frappe 15.x.x version-15"
        parts = line.replace("\t", " ").split()
        if not parts:
            continue
        name = parts[0]
        version = parts[1] if len(parts) > 1 else "unknown"
        apps.append(
            AdminAppVersion(app=name, installed=version, latest=None, status="unknown")
        )
    return apps


async def _list_installed_apps(
    client: FrappeClient,
    settings: Settings,
) -> list[AdminAppVersion]:
    """Prefer bench list-apps; fall back to Frappe installed apps."""
    rc, lines = await bench_ops.run_allowlisted(
        bench_ops.cmd_list_apps(settings),
        settings=settings,
        timeout=60,
    )
    if rc == 0 and lines:
        parsed = _parse_list_apps("\n".join(lines))
        if parsed:
            return parsed

    apps: list[AdminAppVersion] = []
    try:
        raw = await client.method("frappe.get_installed_apps")
        names = raw if isinstance(raw, list) else []
        for name in names:
            ver = "unknown"
            try:
                v = await client.method("frappe.get_attr", json={"method": f"{name}.__version__"})
                if isinstance(v, str):
                    ver = v
            except FrappeError:
                try:
                    v = await client.method(
                        "frappe.utils.change_log.get_versions",
                    )
                    if isinstance(v, dict) and name in v:
                        info = v[name]
                        if isinstance(info, dict):
                            ver = str(info.get("version") or ver)
                        else:
                            ver = str(info)
                except FrappeError:
                    pass
            apps.append(
                AdminAppVersion(app=str(name), installed=ver, latest=None, status="unknown")
            )
    except FrappeError as exc:
        _raise_from_frappe(exc)

    if not apps:
        # Last resort: ping-derived unknown versions so callers fail loud elsewhere if empty.
        try:
            ver = await client.method("frappe.utils.change_log.get_versions")
            if isinstance(ver, dict):
                for name, info in ver.items():
                    installed = (
                        str(info.get("version"))
                        if isinstance(info, dict)
                        else str(info)
                    )
                    apps.append(
                        AdminAppVersion(
                            app=str(name),
                            installed=installed,
                            latest=None,
                            status="unknown",
                        )
                    )
        except FrappeError as exc:
            _raise_from_frappe(exc)

    return apps


def _version_of(apps: list[AdminAppVersion], name: str) -> str:
    for a in apps:
        if a.app.lower() == name.lower():
            return a.installed
    return "unknown"


def _mark_update_status(apps: list[AdminAppVersion]) -> list[AdminAppVersion]:
    out: list[AdminAppVersion] = []
    for a in apps:
        if a.latest is None:
            status: Literal["current", "update", "unknown"] = "unknown"
        elif a.latest != a.installed:
            status = "update"
        else:
            status = "current"
        out.append(a.model_copy(update={"status": status}))
    return out


def _scan_backups(settings: Settings) -> list[AdminBackupSummary]:
    root = bench_ops.backups_dir(settings)
    if not root.is_dir():
        return []
    items: list[AdminBackupSummary] = []
    for path in sorted(root.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not path.is_file():
            continue
        name = path.name
        known_ext = name.endswith((".sql.gz", ".sql", ".tar", ".tgz", ".tar.gz", ".json"))
        known_token = "backup" in name or "-database" in name or "-files" in name
        if not known_ext and not known_token:
            continue
        st = path.stat()
        ts = datetime.fromtimestamp(st.st_mtime, tz=UTC).isoformat()
        btype = "database"
        if "files" in name:
            btype = "files"
        elif "site" in name or name.endswith(".tar"):
            btype = "site"
        items.append(
            AdminBackupSummary(
                timestamp=ts,
                size=_human_size(st.st_size),
                backup_type=btype,
                path=str(path),
            )
        )
    return items


async def _probe_redis(settings: Settings) -> AdminServiceStatus:
    try:
        client = redis.from_url(settings.redis_url, socket_connect_timeout=2)
        pong = client.ping()
        client.close()
        if pong:
            return AdminServiceStatus(name="Redis", status="ok", meta="PING", detail="PONG")
        return AdminServiceStatus(name="Redis", status="err", detail="PING failed")
    except Exception as exc:  # noqa: BLE001
        return AdminServiceStatus(name="Redis", status="err", detail=str(exc)[:200])


async def _probe_qdrant(settings: Settings) -> AdminServiceStatus:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.qdrant_url.rstrip('/')}/")
            if resp.status_code < 500:
                return AdminServiceStatus(
                    name="Qdrant",
                    status="ok",
                    meta=str(resp.status_code),
                    detail="reachable",
                )
            return AdminServiceStatus(
                name="Qdrant",
                status="err",
                detail=f"HTTP {resp.status_code}",
            )
    except Exception as exc:  # noqa: BLE001
        return AdminServiceStatus(name="Qdrant", status="err", detail=str(exc)[:200])


async def _probe_socketio(settings: Settings) -> AdminServiceStatus:
    # Optional — PORTS.md allocates 9020 on the Frappe host.
    host = "127.0.0.1"
    port = int(os.getenv("FRAPPE_SOCKETIO_PORT", "9020"))
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"http://{host}:{port}/socket.io/")
            # Any response (incl 400) means the listener is up
            return AdminServiceStatus(
                name="Socket.io",
                status="ok" if resp.status_code < 500 else "warn",
                meta=f":{port}",
                detail=f"HTTP {resp.status_code}",
            )
    except Exception as exc:  # noqa: BLE001
        return AdminServiceStatus(
            name="Socket.io",
            status="info",
            meta=f":{port}",
            detail=f"optional probe failed: {str(exc)[:120]}",
        )


def _as_user(row: dict[str, Any]) -> AdminUserSummary:
    return AdminUserSummary(
        name=str(row.get("name") or ""),
        full_name=str(row.get("full_name") or row.get("name") or ""),
        email=row.get("email"),
        role_profile_name=row.get("role_profile_name"),
        last_active=str(row["last_active"]) if row.get("last_active") else None,
        enabled=_truthy(row.get("enabled", 1)),
        user_type=row.get("user_type"),
    )


async def _frappe_role_profile_exists(client: FrappeClient, name: str) -> bool:
    try:
        val = await client.method(
            "frappe.client.get_value",
            json={
                "doctype": "Role Profile",
                "filters": {"name": name},
                "fieldname": "name",
            },
        )
        if isinstance(val, dict) and val.get("name"):
            return True
        if isinstance(val, str) and val:
            return True
    except FrappeError:
        pass
    return False


async def _ensure_frappe_role_profile(
    client: FrappeClient,
    catalog: dict[str, Any],
) -> bool:
    """Create Frappe Role Profile from Core catalog when fixtures were never loaded."""
    name = str(catalog["name"])
    if await _frappe_role_profile_exists(client, name):
        return True
    body: dict[str, Any] = {
        "doctype": "Role Profile",
        "role_profile": name,
        "roles": [{"role": r} for r in catalog.get("roles") or []],
    }
    try:
        await client.post("/api/resource/Role Profile", json=body)
        return True
    except FrappeError as exc:
        detail = str(exc).lower()
        if "already" in detail or "duplicate" in detail or exc.status_code == 409:
            return True
        logger.warning("ensure Role Profile %s failed: %s", name, exc)
        return False


async def _apply_job_profile(
    client: FrappeClient,
    *,
    user: str,
    profile_name: str | None,
) -> None:
    """Expand Core catalog roles onto the User; link Frappe Role Profile when present.

    EswasaOne job packs live in ``role_profiles.py``. Frappe ``Role Profile`` docs
    may be missing until fixtures are loaded — never fail the apply on a missing link.
    """
    if not profile_name:
        await client.method(
            "frappe.client.set_value",
            json={
                "doctype": "User",
                "name": user,
                "fieldname": "role_profile_name",
                "value": None,
            },
        )
        return

    catalog = get_role_profile(profile_name)
    if not catalog:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown job profile: {profile_name}",
        )

    # 1) Always expand atomic roles (source of truth for DocPerms / workflow)
    for role in catalog["roles"]:
        try:
            await client.add_user_role(user, role)
        except FrappeError:
            logger.info("add_role %s → %s skipped/failed", role, user)

    # 2) Best-effort Frappe Role Profile link (optional display / Desk UX)
    linked = await _ensure_frappe_role_profile(client, catalog)
    if not linked:
        logger.warning(
            "Role Profile %s missing in Frappe — roles applied without link",
            profile_name,
        )
        return
    try:
        await client.method(
            "frappe.client.set_value",
            json={
                "doctype": "User",
                "name": user,
                "fieldname": "role_profile_name",
                "value": profile_name,
            },
        )
    except FrappeError as exc:
        # Roles already applied — do not roll back the whole patch
        logger.warning(
            "set role_profile_name=%s on %s failed after roles applied: %s",
            profile_name,
            user,
            exc,
        )


def _map_system_settings(doc: dict[str, Any], currency: str | None = None) -> AdminSystemSettings:
    return AdminSystemSettings(
        time_zone=doc.get("time_zone"),
        date_format=doc.get("date_format"),
        currency=currency or doc.get("currency"),
        number_format=doc.get("number_format"),
        session_expiry=doc.get("session_expiry"),
        enable_scheduler=_truthy(doc.get("enable_scheduler"))
        if doc.get("enable_scheduler") is not None
        else None,
        disable_user_pass_login=_truthy(doc.get("disable_user_pass_login"))
        if doc.get("disable_user_pass_login") is not None
        else None,
        allow_consecutive_login_attempts=(
            int(doc["allow_consecutive_login_attempts"])
            if doc.get("allow_consecutive_login_attempts") is not None
            else None
        ),
        force_https=_truthy(doc.get("force_https")) if doc.get("force_https") is not None else None,
    )


# --- Overview / updates ------------------------------------------------------


@router.get("/overview", response_model=AdminOverview)
async def get_admin_overview(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminOverview:
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)

    try:
        apps = _mark_update_status(await _list_installed_apps(client, settings))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    frappe_ver = _version_of(apps, "frappe")
    erpnext_ver = _version_of(apps, "erpnext")

    active_users = 0
    online_now: int | None = None
    try:
        users = await client.method(
            "frappe.client.get_list",
            json={
                "doctype": "User",
                "fields": ["name", "enabled", "last_active"],
                "filters": [["name", "not in", ["Guest", "Administrator"]]],
                "limit_page_length": 500,
            },
        )
        rows = users if isinstance(users, list) else []
        active_users = sum(1 for u in rows if isinstance(u, dict) and _truthy(u.get("enabled")))
        cutoff = time.time() - 15 * 60
        online = 0
        for u in rows:
            if not isinstance(u, dict) or not u.get("last_active"):
                continue
            try:
                la = datetime.fromisoformat(str(u["last_active"]))
                if la.timestamp() >= cutoff:
                    online += 1
            except ValueError:
                continue
        online_now = online
    except FrappeError as exc:
        _raise_from_frappe(exc)

    enable_scheduler = False
    try:
        ss = await client.method(
            "frappe.client.get",
            json={"doctype": "System Settings"},
        )
        if isinstance(ss, dict):
            enable_scheduler = _truthy(ss.get("enable_scheduler"))
    except FrappeError as exc:
        _raise_from_frappe(exc)

    services: list[AdminServiceStatus] = [
        AdminServiceStatus(name="MariaDB", status="ok", meta="via Frappe", detail="ping ok"),
        await _probe_redis(settings),
        AdminServiceStatus(name="Core", status="ok", meta=f":{settings.core_port}", detail="self"),
        await _probe_qdrant(settings),
        await _probe_socketio(settings),
        AdminServiceStatus(
            name="Scheduler",
            status="ok" if enable_scheduler else "warn",
            detail="enabled" if enable_scheduler else "disabled in System Settings",
        ),
    ]

    backups = _scan_backups(settings)
    last_ago: str | None = None
    last_ok: bool | None = None
    if backups:
        try:
            ts = datetime.fromisoformat(backups[0].timestamp)
            last_ago = _ago(time.time() - ts.timestamp())
            last_ok = True
        except ValueError:
            last_ok = True
            last_ago = backups[0].timestamp

    updates_available = sum(1 for a in apps if a.status == "update")

    return AdminOverview(
        site=settings.frappe_site,
        environment=os.getenv("ESWASAONE_ENV") or os.getenv("ENVIRONMENT"),
        frappe_version=frappe_ver,
        erpnext_version=erpnext_ver,
        frappe_status="ok" if frappe_ver != "unknown" else "warn",
        erpnext_status="ok" if erpnext_ver != "unknown" else "warn",
        active_users=active_users,
        seat_limit=None,
        online_now=online_now,
        last_backup_ago=last_ago,
        last_backup_ok=last_ok,
        services=services,
        apps=apps,
        updates_available=updates_available,
    )


@router.get("/updates", response_model=AdminUpdatesResponse)
async def list_admin_updates(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminUpdatesResponse:
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    apps = _mark_update_status(await _list_installed_apps(client, settings))
    return AdminUpdatesResponse(channel="stable", items=apps)


@router.post("/updates/run", response_model=AdminCommandResult)
async def run_admin_update(
    body: AdminUpdateRunBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminCommandResult:
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)

    steps = bench_ops.plan_update(
        settings,
        backup_before=body.backup_before,
        migrate=body.migrate,
        maintenance=body.maintenance,
    )
    planned = [bench_ops.format_cmd(s) for s in steps]

    if body.dry_run:
        audit_log(
            action="admin.update.dry_run",
            actor=auth.user.username,
            resource="bench",
            detail={"channel": body.channel, "steps": planned},
            confirmed=True,
        )
        return AdminCommandResult(
            ok=True,
            message="dry_run — no commands executed",
            lines=[f"planned: {ln}" for ln in planned],
        )

    lock = bench_ops.UpdateFileLock(holder=auth.user.username)
    if not lock.acquire():
        holder = bench_ops.UpdateFileLock.current_holder()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "ok": False,
                "message": "Update lock held",
                "lock_holder": holder,
            },
        )

    lines: list[str] = []
    ok = True
    try:
        audit_log(
            action="admin.update.run",
            actor=auth.user.username,
            resource="bench",
            detail={"channel": body.channel, "steps": planned},
            confirmed=True,
        )
        for argv in steps:
            timeout = (
                bench_ops.UPDATE_TIMEOUT_SEC
                if "update" in argv
                else bench_ops.DEFAULT_TIMEOUT_SEC
            )
            lines.append(f"$ {bench_ops.format_cmd(argv)}")
            rc, out = await bench_ops.run_allowlisted(
                argv, settings=settings, timeout=timeout
            )
            lines.extend(out)
            if rc != 0:
                ok = False
                lines.append(f"FAILED exit={rc}")
                break
    finally:
        lock.release()

    return AdminCommandResult(
        ok=ok,
        message="update finished" if ok else "update failed",
        lines=lines,
    )


# --- Actions -----------------------------------------------------------------


class ConfirmBody(BaseModel):
    confirm: bool


class BackupBody(BaseModel):
    confirm: bool
    with_files: bool = True


class MaintenanceBody(BaseModel):
    confirm: bool
    enabled: bool


@router.post("/actions/clear-cache", response_model=AdminCommandResult)
async def admin_clear_cache(
    body: ConfirmBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminCommandResult:
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    audit_log(
        action="admin.actions.clear_cache",
        actor=auth.user.username,
        resource="frappe",
        confirmed=True,
    )
    lines: list[str] = []
    try:
        await client.method("frappe.clear_cache")
        lines.append("frappe.clear_cache ok")
        return AdminCommandResult(ok=True, message="cache cleared", lines=lines)
    except FrappeError:
        try:
            await client.method("frappe.cache_manager.clear_user_cache")
            lines.append("frappe.cache_manager.clear_user_cache ok")
            return AdminCommandResult(ok=True, message="user cache cleared", lines=lines)
        except FrappeError:
            pass

    rc, out = await bench_ops.run_allowlisted(
        bench_ops.cmd_clear_cache(settings), settings=settings
    )
    lines.extend(out)
    return AdminCommandResult(
        ok=rc == 0,
        message="bench clear-cache" if rc == 0 else "clear-cache failed",
        lines=lines,
    )


@router.post("/actions/backup", response_model=AdminCommandResult)
async def admin_backup_now(
    body: BackupBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminCommandResult:
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)
    audit_log(
        action="admin.actions.backup",
        actor=auth.user.username,
        resource="bench",
        detail={"with_files": body.with_files},
        confirmed=True,
    )
    argv = bench_ops.cmd_backup(settings, with_files=body.with_files)
    rc, lines = await bench_ops.run_allowlisted(argv, settings=settings, timeout=20 * 60)
    return AdminCommandResult(
        ok=rc == 0,
        message="backup complete" if rc == 0 else "backup failed",
        lines=lines,
    )


@router.post("/actions/restart", response_model=AdminCommandResult)
async def admin_restart_services(
    body: ConfirmBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminCommandResult:
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)
    audit_log(
        action="admin.actions.restart",
        actor=auth.user.username,
        resource="bench",
        confirmed=True,
    )
    rc, lines = await bench_ops.run_allowlisted(
        bench_ops.cmd_restart(settings), settings=settings, timeout=180
    )
    return AdminCommandResult(
        ok=rc == 0,
        message="restart issued" if rc == 0 else "restart failed",
        lines=lines,
    )


@router.post("/actions/maintenance", response_model=AdminCommandResult)
async def admin_maintenance_mode(
    body: MaintenanceBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminCommandResult:
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)
    audit_log(
        action="admin.actions.maintenance",
        actor=auth.user.username,
        resource="bench",
        detail={"enabled": body.enabled},
        confirmed=True,
    )
    rc, lines = await bench_ops.run_allowlisted(
        bench_ops.cmd_maintenance(settings, enabled=body.enabled),
        settings=settings,
    )
    return AdminCommandResult(
        ok=rc == 0,
        message=("maintenance on" if body.enabled else "maintenance off")
        if rc == 0
        else "maintenance mode failed",
        lines=lines,
    )


# --- Settings ----------------------------------------------------------------


class PatchSystemSettingsBody(BaseModel):
    confirm: bool
    values: AdminSystemSettings


@router.get("/settings/system", response_model=AdminSystemSettings)
async def get_admin_system_settings(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AdminSystemSettings:
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    try:
        doc = await client.method(
            "frappe.client.get",
            json={"doctype": "System Settings"},
        )
        currency: str | None = None
        try:
            defaults = await client.method("frappe.defaults.get_defaults")
            if isinstance(defaults, dict):
                currency = defaults.get("currency") or defaults.get("company_currency")
        except FrappeError:
            pass
        if not isinstance(doc, dict):
            raise HTTPException(status_code=502, detail="System Settings unavailable")
        return _map_system_settings(doc, currency=currency)
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="System Settings unavailable")


@router.patch("/settings/system", response_model=AdminSystemSettings)
async def patch_admin_system_settings(
    body: PatchSystemSettingsBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AdminSystemSettings:
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)

    payload = body.values.model_dump(exclude_none=True)
    # currency lives in defaults — skip direct System Settings write
    payload.pop("currency", None)
    payload.pop("force_https", None)

    allowed = {k: v for k, v in payload.items() if k in SYSTEM_SETTINGS_ALLOWLIST}
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No allowlisted System Settings fields to update",
        )

    audit_log(
        action="admin.settings.system.patch",
        actor=auth.user.username,
        resource="System Settings",
        detail={"fields": list(allowed.keys())},
        confirmed=True,
    )

    try:
        for field, value in allowed.items():
            await client.method(
                "frappe.client.set_value",
                json={
                    "doctype": "System Settings",
                    "name": "System Settings",
                    "fieldname": field,
                    "value": value,
                },
            )
    except FrappeError as exc:
        _raise_from_frappe(exc)

    return await get_admin_system_settings(auth=auth, frappe=frappe)


@router.get("/settings/email", response_model=AdminEmailSettings)
async def get_admin_email_settings(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AdminEmailSettings:
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    try:
        rows = await client.method(
            "frappe.client.get_list",
            json={
                "doctype": "Email Account",
                "fields": [
                    "name",
                    "email_id",
                    "smtp_server",
                    "smtp_port",
                    "use_tls",
                    "default_outgoing",
                    "enable_outgoing",
                    "enable_incoming",
                ],
                "filters": [["default_outgoing", "=", 1]],
                "limit_page_length": 5,
            },
        )
        items = rows if isinstance(rows, list) else []
        if not items:
            rows = await client.method(
                "frappe.client.get_list",
                json={
                    "doctype": "Email Account",
                    "fields": [
                        "name",
                        "email_id",
                        "smtp_server",
                        "smtp_port",
                        "use_tls",
                        "default_outgoing",
                        "enable_outgoing",
                        "enable_incoming",
                    ],
                    "limit_page_length": 5,
                },
            )
            items = rows if isinstance(rows, list) else []
        if not items:
            messaging = get_messaging()
            return AdminEmailSettings(
                outgoing_ok=messaging.config.email_configured,
                smtp_host=os.getenv("SMTP_HOST") or None,
                smtp_port=int(os.getenv("SMTP_PORT") or "0") or None,
                from_address=os.getenv("SMTP_FROM") or None,
                use_tls=_truthy(os.getenv("SMTP_USE_TLS", "true")),
                incoming_set=False,
                account_name=None,
            )
        row = items[0] if isinstance(items[0], dict) else {}
        return AdminEmailSettings(
            outgoing_ok=_truthy(row.get("enable_outgoing")) or _truthy(row.get("default_outgoing")),
            smtp_host=row.get("smtp_server"),
            smtp_port=int(row["smtp_port"]) if row.get("smtp_port") else None,
            from_address=row.get("email_id"),
            use_tls=_truthy(row.get("use_tls")) if row.get("use_tls") is not None else None,
            incoming_set=_truthy(row.get("enable_incoming")),
            account_name=row.get("name"),
        )
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Email settings unavailable")


class TestEmailBody(BaseModel):
    confirm: bool
    to: str


@router.post("/settings/email/test", response_model=AdminCommandResult)
async def admin_test_email(
    body: TestEmailBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AdminCommandResult:
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    audit_log(
        action="admin.settings.email.test",
        actor=auth.user.username,
        resource="Email Account",
        detail={"to": body.to},
        confirmed=True,
    )
    lines: list[str] = []
    try:
        await client.method(
            "frappe.sendmail",
            json={
                "recipients": body.to,
                "subject": "EswasaOne admin test email",
                "message": "This is a test message from EswasaOne System Administration.",
                "now": True,
            },
        )
        lines.append("frappe.sendmail queued/sent")
        return AdminCommandResult(ok=True, message="test email sent", lines=lines)
    except FrappeError as exc:
        lines.append(f"frappe.sendmail failed: {exc}")

    messaging = get_messaging()
    result = await messaging.send_email(
        EmailRequest(
            to=str(body.to),
            subject="EswasaOne admin test email",
            body="This is a test message from EswasaOne System Administration.",
        )
    )
    lines.append(f"messaging adapter: {result.status.value} stubbed={result.stubbed}")
    return AdminCommandResult(
        ok=result.status.value != "failed",
        message=result.detail or result.status.value,
        lines=lines,
    )


# --- Users -------------------------------------------------------------------


@router.get("/users")
async def list_admin_users(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: Annotated[int, Query()] = 50,
    enabled: Annotated[bool | None, Query()] = None,
) -> dict[str, Any]:
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    filters: list[Any] = [["name", "!=", "Guest"]]
    if enabled is not None:
        filters.append(["enabled", "=", 1 if enabled else 0])
    try:
        rows = await client.method(
            "frappe.client.get_list",
            json={
                "doctype": "User",
                "fields": [
                    "name",
                    "full_name",
                    "email",
                    "enabled",
                    "last_active",
                    "role_profile_name",
                    "user_type",
                ],
                "filters": filters,
                "limit_page_length": limit,
                "order_by": "modified desc",
            },
        )
        items_raw = rows if isinstance(rows, list) else []
        items = [_as_user(u) for u in items_raw if isinstance(u, dict)]
        # Counts across filtered list; also fetch totals when filter applied
        all_rows = items_raw
        if enabled is not None:
            all_rows = await client.method(
                "frappe.client.get_list",
                json={
                    "doctype": "User",
                    "fields": ["name", "enabled"],
                    "filters": [["name", "!=", "Guest"]],
                    "limit_page_length": 500,
                },
            )
            all_rows = all_rows if isinstance(all_rows, list) else []
        active = sum(1 for u in all_rows if isinstance(u, dict) and _truthy(u.get("enabled")))
        disabled = sum(
            1 for u in all_rows if isinstance(u, dict) and not _truthy(u.get("enabled"))
        )
        return {
            "items": [i.model_dump() for i in items],
            "active": active,
            "disabled": disabled,
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Users unavailable")


class PatchUserBody(BaseModel):
    confirm: bool
    enabled: bool | None = None
    role_profile_name: str | None = None


class AddRoleBody(BaseModel):
    role: str
    confirm: bool


# Roles that should never be offered for manual assignment.
_NON_ASSIGNABLE_ROLES = frozenset({"Guest", "All"})


@router.get("/role-profiles", tags=["admin"])
async def list_admin_role_profiles(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    audience: str | None = Query(default=None),
) -> dict[str, Any]:
    """Canonical job packages (Citizen/Business thin; Institution directorates)."""
    _ = auth
    return {"items": list_role_profiles(audience=audience)}


@router.get("/roles", tags=["admin"])
async def list_admin_roles(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    curated: bool = Query(
        default=True,
        description="When true, return only the EswasaOne curated role catalog",
    ),
) -> dict[str, list[dict[str, Any]]]:
    """List roles available for assignment — curated by default (not ERPNext dump)."""
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    try:
        rows = await client.method(
            "frappe.client.get_list",
            json={
                "doctype": "Role",
                "fields": ["name", "desk_access", "disabled"],
                "filters": [["disabled", "!=", 1]],
                "limit_page_length": 500,
                "order_by": "name",
            },
        )
        items_raw = rows if isinstance(rows, list) else []
        items = [
            {
                "name": str(r.get("name") or ""),
                "desk_access": _truthy(r.get("desk_access")),
                "disabled": _truthy(r.get("disabled")),
            }
            for r in items_raw
            if isinstance(r, dict) and str(r.get("name") or "") not in _NON_ASSIGNABLE_ROLES
        ]
        if curated:
            # Prefer live Frappe intersection with catalog; fill gaps from catalog names
            live = {i["name"] for i in items}
            ordered: list[dict[str, Any]] = []
            for name in curated_role_names():
                if name in live:
                    match = next(i for i in items if i["name"] == name)
                    ordered.append(match)
                else:
                    ordered.append({"name": name, "desk_access": True, "disabled": False})
            return {"items": ordered}
        return {"items": items}
    except FrappeError as exc:
        if curated:
            return {
                "items": [
                    {"name": n, "desk_access": True, "disabled": False}
                    for n in curated_role_names()
                    if n not in _NON_ASSIGNABLE_ROLES
                ]
            }
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Roles unavailable")


@router.get("/users/{name}/roles", tags=["admin"])
async def get_user_roles(
    name: str,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    """Get a single user's details including their assigned roles."""
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    try:
        doc = await client.method(
            "frappe.client.get",
            json={"doctype": "User", "name": name},
        )
        if not isinstance(doc, dict):
            raise HTTPException(status_code=504, detail="User not found")
        user = _as_user(doc)
        rows = await client.method(
            "frappe.client.get_list",
            json={
                "doctype": "Has Role",
                "filters": [["parent", "=", name]],
                "fields": ["role", "parent"],
                "limit_page_length": 50,
            },
        )
        items_raw = rows if isinstance(rows, list) else []
        roles = [str(r.get("role")) for r in items_raw if isinstance(r, dict) and r.get("role")]
        return {"user": user.model_dump(), "roles": roles}
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="User roles unavailable")


@router.post("/users/{name}/roles", tags=["admin"])
async def add_user_role(
    name: str,
    body: AddRoleBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    """Add a role to a user (confirm-before-commit, audit-logged)."""
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    audit_log(
        action="admin.users.add_role",
        actor=auth.user.username,
        resource=f"User/{name}",
        detail={"role": body.role},
        confirmed=True,
    )
    try:
        await client.add_user_role(name, body.role)
        return {
            "ok": True,
            "role": body.role,
            "message": f"Added {body.role} to {name}",
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Add role failed")


@router.delete("/users/{name}/roles/{role}", tags=["admin"])
async def remove_user_role(
    name: str,
    role: str,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    confirm: bool = True,
) -> dict[str, Any]:
    """Remove a role from a user (confirm-before-commit, audit-logged)."""
    _require_confirm(confirm)
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    audit_log(
        action="admin.users.remove_role",
        actor=auth.user.username,
        resource=f"User/{name}",
        detail={"role": role},
        confirmed=True,
    )
    try:
        try:
            await client.remove_user_role(name, role)
        except FrappeError as exc:
            # Fallback: locate the Has Role row and delete it directly
            # (covers missing remove_role whitelist and permission-stripped User.roles).
            rows = await client.method(
                "frappe.client.get_list",
                json={
                    "doctype": "Has Role",
                    "filters": [["parent", "=", name], ["role", "=", role]],
                    "fields": ["name"],
                    "limit_page_length": 5,
                },
            )
            items = rows if isinstance(rows, list) else []
            if not items:
                if exc.status_code == 404:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Role {role} not found on {name}",
                    ) from exc
                raise
            for r in items:
                if isinstance(r, dict) and r.get("name"):
                    await client.method(
                        "frappe.client.delete",
                        json={"doctype": "Has Role", "name": str(r["name"])},
                    )
        return {
            "ok": True,
            "role": role,
            "message": f"Removed {role} from {name}",
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Remove role failed")


@router.patch("/users/{name}", response_model=AdminUserSummary)
async def patch_admin_user(
    name: str,
    body: PatchUserBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AdminUserSummary:
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    if body.enabled is None and body.role_profile_name is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide enabled and/or role_profile_name",
        )

    audit_log(
        action="admin.users.patch",
        actor=auth.user.username,
        resource=f"User/{name}",
        detail={"enabled": body.enabled, "role_profile_name": body.role_profile_name},
        confirmed=True,
    )

    try:
        if body.enabled is not None:
            await client.method(
                "frappe.client.set_value",
                json={
                    "doctype": "User",
                    "name": name,
                    "fieldname": "enabled",
                    "value": 1 if body.enabled else 0,
                },
            )
        if body.role_profile_name is not None:
            profile_name = body.role_profile_name.strip() or None
            await _apply_job_profile(client, user=name, profile_name=profile_name)
        doc = await client.method(
            "frappe.client.get",
            json={"doctype": "User", "name": name},
        )
        if not isinstance(doc, dict):
            raise HTTPException(status_code=502, detail="User fetch failed")
        return _as_user(doc)
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="User update failed")


# --- Scheduler / jobs --------------------------------------------------------


@router.get("/scheduler", response_model=AdminSchedulerResponse)
async def get_admin_scheduler(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AdminSchedulerResponse:
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    enabled = False
    try:
        ss = await client.method(
            "frappe.client.get",
            json={"doctype": "System Settings"},
        )
        if isinstance(ss, dict):
            enabled = _truthy(ss.get("enable_scheduler"))
    except FrappeError as exc:
        _raise_from_frappe(exc)

    jobs: list[AdminScheduledJob] = []
    heartbeat_ago: str | None = None
    try:
        rows = await client.method(
            "frappe.client.get_list",
            json={
                "doctype": "Scheduled Job Type",
                "fields": [
                    "name",
                    "method",
                    "frequency",
                    "last_execution",
                    "stopped",
                    "create_log",
                ],
                "limit_page_length": 100,
                "order_by": "modified desc",
            },
        )
        items = rows if isinstance(rows, list) else []
        latest_ts: float | None = None
        for row in items:
            if not isinstance(row, dict):
                continue
            last = row.get("last_execution")
            if last:
                try:
                    ts = datetime.fromisoformat(str(last)).timestamp()
                    if latest_ts is None or ts > latest_ts:
                        latest_ts = ts
                except ValueError:
                    pass
            stopped = _truthy(row.get("stopped"))
            jobs.append(
                AdminScheduledJob(
                    name=str(row.get("name") or ""),
                    method=str(row.get("method") or ""),
                    frequency=str(row.get("frequency") or ""),
                    last_run=str(last) if last else None,
                    status="stopped" if stopped else "active",
                    stopped=stopped,
                )
            )
        if latest_ts is not None:
            heartbeat_ago = _ago(time.time() - latest_ts)
    except FrappeError as exc:
        _raise_from_frappe(exc)

    return AdminSchedulerResponse(enabled=enabled, heartbeat_ago=heartbeat_ago, jobs=jobs)


@router.post("/scheduler/{job}/run", response_model=AdminCommandResult)
async def run_admin_scheduled_job(
    job: str,
    body: ConfirmBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AdminCommandResult:
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    audit_log(
        action="admin.scheduler.run",
        actor=auth.user.username,
        resource=f"Scheduled Job Type/{job}",
        confirmed=True,
    )
    lines: list[str] = []
    try:
        await client.method(
            "frappe.core.doctype.scheduled_job_type.scheduled_job_type.run_scheduled_job",
            json={"job_type": job},
        )
        lines.append(f"enqueued {job}")
        return AdminCommandResult(ok=True, message="enqueued", lines=lines)
    except FrappeError as exc:
        lines.append(str(exc))
        try:
            await client.method(
                "frappe.utils.scheduler.enqueue_scheduler_event",
                json={"job_type": job},
            )
            lines.append("enqueue_scheduler_event ok")
            return AdminCommandResult(ok=True, message="enqueued", lines=lines)
        except FrappeError as exc2:
            lines.append(str(exc2))
            return AdminCommandResult(
                ok=False,
                message="could not enqueue scheduled job",
                lines=lines,
            )


@router.get("/jobs", response_model=AdminJobsSnapshot)
async def get_admin_jobs(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AdminJobsSnapshot:
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    # Best-effort — Frappe RQ helpers vary by version
    try:
        raw = await client.method("frappe.core.page.background_jobs.background_jobs.get_info")
        if isinstance(raw, dict):
            return AdminJobsSnapshot(
                running=int(raw.get("running") or raw.get("workers") or 0),
                queued=int(raw.get("queued") or raw.get("queue_length") or 0),
                completed_24h=int(raw.get("completed_24h") or raw.get("finished") or 0),
                failed=int(raw.get("failed") or 0),
            )
        if isinstance(raw, list):
            running = sum(1 for j in raw if isinstance(j, dict) and j.get("status") == "started")
            queued = sum(1 for j in raw if isinstance(j, dict) and j.get("status") == "queued")
            failed = sum(1 for j in raw if isinstance(j, dict) and j.get("status") == "failed")
            return AdminJobsSnapshot(
                running=running, queued=queued, completed_24h=0, failed=failed
            )
    except FrappeError:
        pass

    # Zeros with detail via message field is not on snapshot — use zeros (contract).
    logger.info("admin jobs: RQ stats unavailable — returning zeros")
    return AdminJobsSnapshot(running=0, queued=0, completed_24h=0, failed=0)


@router.post("/jobs/retry-failed", response_model=AdminCommandResult)
async def retry_admin_failed_jobs(
    body: ConfirmBody,
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AdminCommandResult:
    _require_confirm(body.confirm)
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    audit_log(
        action="admin.jobs.retry_failed",
        actor=auth.user.username,
        resource="RQ",
        confirmed=True,
    )
    try:
        await client.method("frappe.utils.background_jobs.retry_failed_jobs")
        return AdminCommandResult(ok=True, message="retry requested", lines=["retry_failed_jobs"])
    except FrappeError as exc:
        return AdminCommandResult(
            ok=False,
            message=f"retry unavailable: {exc}",
            lines=[str(exc)],
        )


# --- Backups / logs / integrations -------------------------------------------


@router.get("/backups")
async def list_admin_backups(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    items = _scan_backups(settings)
    policy: AdminBackupPolicy | None = None
    try:
        ss = await client.method(
            "frappe.client.get",
            json={"doctype": "System Settings"},
        )
        if isinstance(ss, dict):
            # Optional fields — only present on some deployments
            freq = ss.get("backup_frequency") or ss.get("auto_backup_frequency")
            retention = ss.get("backup_retention") or ss.get("keep_backups_for_days")
            if freq is not None or retention is not None or "backup_files" in ss:
                policy = AdminBackupPolicy(
                    frequency=str(freq) if freq is not None else None,
                    include_files=_truthy(ss.get("backup_files"))
                    if ss.get("backup_files") is not None
                    else None,
                    retention_days=int(retention) if retention is not None else None,
                    offsite=_truthy(ss.get("backup_offsite"))
                    if ss.get("backup_offsite") is not None
                    else None,
                    encrypt=_truthy(ss.get("encrypt_backup"))
                    if ss.get("encrypt_backup") is not None
                    else None,
                )
    except FrappeError:
        policy = None

    result: dict[str, Any] = {"items": [i.model_dump() for i in items]}
    if policy is not None:
        result["policy"] = policy.model_dump()
    return result


@router.get("/logs")
async def list_admin_logs(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    kind: Annotated[Literal["error", "activity"], Query()] = "error",
    limit: Annotated[int, Query()] = 40,
) -> dict[str, Any]:
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    doctype = "Error Log" if kind == "error" else "Activity Log"
    try:
        if kind == "error":
            rows = await client.method(
                "frappe.client.get_list",
                json={
                    "doctype": doctype,
                    "fields": ["name", "creation", "method", "error"],
                    "limit_page_length": limit,
                    "order_by": "creation desc",
                },
            )
            items_raw = rows if isinstance(rows, list) else []
            entries = [
                AdminLogEntry(
                    time=str(r.get("creation") or ""),
                    source=str(r.get("method") or "Error Log"),
                    message=str(r.get("error") or "")[:500],
                    level="err",
                    name=r.get("name"),
                )
                for r in items_raw
                if isinstance(r, dict)
            ]
        else:
            rows = await client.method(
                "frappe.client.get_list",
                json={
                    "doctype": doctype,
                    "fields": ["name", "creation", "subject", "operation", "status", "user"],
                    "limit_page_length": limit,
                    "order_by": "creation desc",
                },
            )
            items_raw = rows if isinstance(rows, list) else []
            entries = []
            for r in items_raw:
                if not isinstance(r, dict):
                    continue
                st = str(r.get("status") or "").lower()
                level: Literal["ok", "warn", "err", "info"] = "info"
                if st in ("success", "complete", "completed"):
                    level = "ok"
                elif st in ("failed", "error"):
                    level = "err"
                elif st in ("warning", "warn"):
                    level = "warn"
                entries.append(
                    AdminLogEntry(
                        time=str(r.get("creation") or ""),
                        source=str(r.get("user") or r.get("operation") or "Activity Log"),
                        message=str(r.get("subject") or r.get("operation") or "")[:500],
                        level=level,
                        name=r.get("name"),
                    )
                )
        return {"items": [e.model_dump() for e in entries]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Logs unavailable")


@router.get("/integrations")
async def get_admin_integrations(
    auth: Annotated[AuthContext, Depends(require_system_manager)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    await _ensure_frappe(frappe)
    client = auth.frappe(frappe)
    items: list[AdminIntegrationStatus] = []

    momo_keys = all(
        os.getenv(k, "").strip()
        for k in ("MOMO_SUBSCRIPTION_KEY", "MOMO_API_USER", "MOMO_API_KEY")
    )
    items.append(
        AdminIntegrationStatus(
            id="momo",
            title="MTN MoMo",
            status="ok" if momo_keys else "warn",
            detail="credentials set" if momo_keys else "MOMO_* keys missing",
        )
    )

    llm = bool(settings.llm_api_key.strip())
    items.append(
        AdminIntegrationStatus(
            id="llm",
            title="LLM",
            status="ok" if llm else "warn",
            detail="LLM_API_KEY set" if llm else "LLM_API_KEY empty",
        )
    )

    qdrant = await _probe_qdrant(settings)
    items.append(
        AdminIntegrationStatus(
            id="qdrant",
            title="Qdrant",
            status=qdrant.status if qdrant.status in ("ok", "warn", "err", "info") else "err",
            detail=qdrant.detail or qdrant.status,
        )
    )

    messaging = get_messaging()
    smtp_ok = messaging.config.email_configured
    items.append(
        AdminIntegrationStatus(
            id="smtp",
            title="SMTP / Email",
            status="ok" if smtp_ok else "warn",
            detail="SMTP configured" if smtp_ok else "SMTP_* not configured",
        )
    )

    items.append(
        AdminIntegrationStatus(
            id="sso",
            title="SSO",
            status="warn",
            detail="SSO not configured (stub)",
        )
    )

    tbt_ok = False
    try:
        apps = await _list_installed_apps(client, settings)
        tbt_ok = any(
            a.app.lower() in ("eswasa_tbt", "tbt", "eswasa_governance") for a in apps
        )
        # Prefer explicit TBT adapter / app name
        tbt_ok = any("tbt" in a.app.lower() for a in apps) or tbt_ok
    except Exception:  # noqa: BLE001
        tbt_ok = False
    items.append(
        AdminIntegrationStatus(
            id="tbt",
            title="TBT / WTO",
            status="ok" if tbt_ok else "info",
            detail="TBT app installed" if tbt_ok else "TBT app not detected",
        )
    )

    return {"items": [i.model_dump() for i in items]}
