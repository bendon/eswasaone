"""Auth dependencies — cookie + Bearer dual-path; RBAC stays in Frappe."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.frappe_client import FrappeClient, get_frappe_client
from app.identity.errors import AuthRequired
from app.identity.session import COOKIE_NAME, SessionStore, get_session_store
from app.schemas import SessionUser

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)

# Tools guests may call (public / read-only). Others need a real session.
GUEST_ALLOWED_TOOLS = frozenset(
    {
        "search_standards",
        "check_applicability",
        "verify_mark",
    }
)

# Institution / Desk staff markers — Citizen-only must not pass require_staff.
# Names must match Frappe Role fixtures (no aliases).
STAFF_ROLES = frozenset(
    {
        "System Manager",
        "Administrator",
        "Desk User",
        "ESWASA Staff",
        "Accounts User",
        "Accounts Manager",
        "Sales User",
        "Sales Manager",
        "Purchase User",
        "Purchase Manager",
        "HR User",
        "HR Manager",
        "Certification Manager",
        "Certification Officer",
        "Certification Auditor",
        "Eswasa Metrology Manager",
        "Eswasa Metrology Officer",
        "Eswasa Metrology Reviewer",
        "Eswasa Standards Manager",
        "Eswasa Standards Officer",
        "Eswasa TC Member",
        "Eswasa Board Secretary",
        "Eswasa Board Member",
        "Eswasa Risk Officer",
        "Eswasa TBT Officer",
        "Eswasa TBT Analyst",
        "Eswasa Estore Manager",
        "Eswasa Estore Clerk",
        "Eswasa Verification Officer",
        "Ingest Curator",
        "Ingest Viewer",
    }
)

# Public / citizen-side roles — documentation + tests; Institution gate uses STAFF_ROLES only.
CITIZEN_ONLY_ROLES = frozenset(
    {
        "Citizen",
        "Guest",
        "All",
        "Customer",
        "Certification Applicant",
        "LMS Student",
        "Employee",
        "Employee Self Service",
        "Newsletter",
        "Newsletter Reader",
    }
)


@dataclass
class AuthContext:
    token: str
    user: SessionUser
    frappe_sid: str | None
    mock: bool
    is_guest: bool = False
    frappe_api_key: str | None = None
    frappe_api_secret: str | None = None
    csrf_token: str | None = None
    via_cookie: bool = False
    locked: bool = False
    otp_verified_until: float | None = None

    def frappe(self, base: FrappeClient | None = None) -> FrappeClient:
        """Acting-as-user: prefer live Frappe ``sid`` over API token.

        ``generate_keys`` rotates ``api_secret`` on every call, so token-first
        auth breaks older Core sessions while ``/auth/me`` still returns 200.
        Session cookie is scoped to this login and stays valid until Frappe
        expiry; tokens are fallback (guest / sid-less).
        """
        client = base or get_frappe_client()
        if self.frappe_sid:
            return client.with_session(self.frappe_sid)
        if self.frappe_api_key and self.frappe_api_secret:
            return client.with_token(self.frappe_api_key, self.frappe_api_secret)
        return client

    def to_agent_context(self) -> dict[str, Any]:
        return {
            "roles": self.user.roles,
            "mock": self.mock,
            "frappe_sid": self.frappe_sid,
            "username": self.user.username,
            "is_guest": self.is_guest,
            "frappe_api_key": self.frappe_api_key,
            "frappe_api_secret": self.frappe_api_secret,
        }


def _guest_context(settings: Settings) -> AuthContext:
    """Anonymous actor. Uses FRAPPE_GUEST_API_KEY/SECRET when set; otherwise local-only."""
    username = settings.frappe_guest_user or "Guest"
    has_keys = bool(settings.frappe_guest_api_key and settings.frappe_guest_api_secret)
    if not has_keys:
        logger.debug(
            "Guest context without FRAPPE_GUEST_API_KEY/SECRET — "
            "anonymous Frappe calls are unauthenticated (set keys for production-ish demo)"
        )
    return AuthContext(
        token="",
        user=SessionUser(
            username=username,
            full_name="Guest",
            email=None,
            roles=["Guest"],
        ),
        frappe_sid=None,
        mock=not has_keys,
        is_guest=True,
        frappe_api_key=settings.frappe_guest_api_key or None,
        frappe_api_secret=settings.frappe_guest_api_secret or None,
    )


def has_staff_role(roles: list[str] | None) -> bool:
    """True only for Institution/Desk staff markers (invite / job-profile roles).

    Public packs (Citizen, Customer, LMS Student, …) never count — Institution
    UI is for institution-created staff only.
    """
    return bool(set(roles or []) & STAFF_ROLES)


def is_citizen_audience(roles: list[str] | None) -> bool:
    """True when the user has no Institution staff role (Service Portal audience)."""
    return not has_staff_role(roles)


def _from_store(
    token: str,
    store: SessionStore,
    *,
    via_cookie: bool,
    settings: Settings | None = None,
    auto_idle_lock: bool = True,
    enforce_otp: bool = True,
) -> AuthContext | None:
    import time

    data = store.get(token)
    if not data:
        return None
    cfg = settings or get_settings()
    now = time.time()
    otp_until = float(data.get("otp_verified_until") or 0)
    if enforce_otp and otp_until and otp_until < now:
        store.delete(token)
        return None

    locked = bool(data.get("locked"))
    last = float(data.get("last_activity_at") or data.get("created_at") or now)
    if auto_idle_lock and not locked and (now - last) > cfg.session_idle_seconds:
        store.lock(token)
        locked = True

    api_key, api_secret = store.get_api_credentials(data)
    return AuthContext(
        token=token,
        user=SessionUser(**data["user"]),
        frappe_sid=data.get("frappe_sid"),
        mock=bool(data.get("mock")),
        is_guest=False,
        frappe_api_key=api_key,
        frappe_api_secret=api_secret,
        csrf_token=data.get("csrf_token"),
        via_cookie=via_cookie,
        locked=locked,
        otp_verified_until=otp_until or None,
    )


async def get_optional_auth(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    store: Annotated[SessionStore, Depends(get_session_store)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthContext | None:
    """Dual-path: valid Bearer wins when present (skips CSRF); else cookie session."""
    # Unlock / logout must see locked (and OTP-expired) sessions without auto-blocking
    path = request.url.path.rstrip("/")
    soft = path.endswith("/auth/unlock") or path.endswith("/auth/logout")
    if creds is not None and creds.scheme.lower() == "bearer":
        ctx = _from_store(
            creds.credentials,
            store,
            via_cookie=False,
            settings=settings,
            auto_idle_lock=not soft,
            enforce_otp=not soft,
        )
        if ctx is not None:
            return ctx
    cookie_token = request.cookies.get(COOKIE_NAME)
    if cookie_token:
        return _from_store(
            cookie_token,
            store,
            via_cookie=True,
            settings=settings,
            auto_idle_lock=not soft,
            enforce_otp=not soft,
        )
    return None


async def require_auth(
    auth: Annotated[AuthContext | None, Depends(get_optional_auth)],
) -> AuthContext:
    if auth is None or auth.is_guest:
        raise AuthRequired(detail="Authentication required")
    if auth.locked:
        raise AuthRequired(
            reason="session_locked",
            detail="Session locked due to inactivity — unlock with password",
        )
    return auth


async def require_staff(
    auth: Annotated[AuthContext, Depends(require_auth)],
) -> AuthContext:
    """Institution-facing gate — rejects Citizen-only (and Guest) sessions.

    A4 gateway routes can ``Depends(require_staff)`` for staff-only modules.
    """
    if auth.is_guest or not has_staff_role(auth.user.roles):
        raise AuthRequired(
            reason="staff_required",
            detail="Institution staff role required",
        )
    return auth


SYSTEM_MANAGER_ROLES = frozenset({"System Manager", "Administrator"})


async def require_system_manager(
    auth: Annotated[AuthContext, Depends(require_staff)],
) -> AuthContext:
    """System Administration — System Manager or Administrator only."""
    if not set(auth.user.roles or []) & SYSTEM_MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System Manager role required",
        )
    return auth


async def get_actor(
    auth: Annotated[AuthContext | None, Depends(get_optional_auth)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthContext:
    """Authenticated user, or dedicated guest service account for anonymous reads."""
    if auth is not None:
        return auth
    return _guest_context(settings)


def require_csrf(
    request: Request,
    auth: AuthContext,
) -> None:
    """CSRF for cookie-backed state-changing requests (Bearer-only skips)."""
    if request.method.upper() in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return
    if not auth.via_cookie:
        return
    header = request.headers.get("X-CSRF-Token") or request.headers.get("x-csrf-token")
    if not header or not auth.csrf_token or header != auth.csrf_token:
        raise AuthRequired(reason="csrf", detail="CSRF token missing or invalid")


def assert_tool_allowed(auth: AuthContext, tool_name: str) -> None:
    if auth.is_guest and tool_name not in GUEST_ALLOWED_TOOLS:
        raise AuthRequired(
            reason="permissioned_tool",
            detail=f"Sign in required for tool '{tool_name}'",
        )


async def require_auth_csrf(
    request: Request,
    auth: Annotated[AuthContext, Depends(require_auth)],
) -> AuthContext:
    """Authenticated session + CSRF when cookie-backed."""
    require_csrf(request, auth)
    return auth
