"""Identity routes — /api/auth/*."""

from __future__ import annotations

import logging
import secrets
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.adapters.messaging import EmailRequest, get_messaging
from app.config import Settings, get_settings
from app.frappe_client import FrappeClient, FrappeError, get_frappe_client
from app.identity.cookies import clear_session_cookies, set_session_cookies
from app.identity.deps import (
    AuthContext,
    STAFF_ROLES,
    get_optional_auth,
    has_staff_role,
    require_auth,
    require_staff,
)
from app.identity.errors import AuthRequired
from app.identity.mock_gate import is_conflict, mock_auth_permitted
from app.identity.rate_limit import check_auth_rate_limit
from app.identity.session import COOKIE_NAME, SessionStore, get_session_store
from app.schemas import (
    InviteStaffRequest,
    InviteStaffResponse,
    LoginChallenge,
    LoginRequest,
    PasswordResetRequest,
    PasswordResetResponse,
    RegisterRequest,
    Session,
    SessionUser,
    UnlockRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["identity"])

# Pending password challenges awaiting OTP (in-memory; Redis later)
_CHALLENGES: dict[str, dict[str, Any]] = {}
# OTP codes keyed by identity.lower()
_OTP_STORE: dict[str, dict[str, Any]] = {}

_INVITE_ROLES = STAFF_ROLES


class OtpRequest(BaseModel):
    email: str


class OtpResponse(BaseModel):
    ok: bool
    message: str | None = None
    stubbed: bool = False


def _identity_from_login(body: LoginRequest) -> str:
    return (body.email or body.username or "").strip()


def _validate_register(body: RegisterRequest) -> tuple[str, str]:
    email = (body.email or "").strip()
    name = (body.name or "").strip()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(
            status_code=422,
            detail="Valid email required",
        )
    if not name:
        raise HTTPException(
            status_code=422,
            detail="name required",
        )
    return email, name


def _ensure_citizen_roles(roles: list[str] | None) -> list[str]:
    """Public signup is always Citizen-only — never inherit Desk/staff defaults."""
    _ = roles
    return ["Citizen"]


def _purge_expired_challenges() -> None:
    now = time.time()
    dead = [k for k, v in _CHALLENGES.items() if v.get("expires", 0) < now]
    for k in dead:
        _CHALLENGES.pop(k, None)
    dead_otp = [k for k, v in _OTP_STORE.items() if v.get("expires", 0) < now]
    for k in dead_otp:
        _OTP_STORE.pop(k, None)


async def _send_otp_code(
    *,
    identity: str,
    email_to: str,
    settings: Settings,
    challenge_id: str | None = None,
) -> tuple[str, bool]:
    """Issue OTP code; returns (message, stubbed)."""
    _purge_expired_challenges()
    code = f"{secrets.randbelow(1_000_000):06d}"
    record = {
        "code": code,
        "expires": time.time() + settings.otp_code_ttl_seconds,
        "challenge_id": challenge_id,
    }
    # Index under login identity and mailbox so resend/verify stay aligned
    keys = {identity.lower().strip(), email_to.lower().strip()}
    for key in keys:
        if key:
            _OTP_STORE[key] = record
    messaging = get_messaging()
    result = await messaging.send_email(
        EmailRequest(
            to=email_to if "@" in email_to else f"{email_to}@localhost",
            subject=f"Your EswasaOne sign-in code: {code}",
            body=(
                f"Your one-time code is {code}. "
                f"It expires in {settings.otp_code_ttl_seconds // 60} minutes."
            ),
            headers={
                # Per-code entity ID — helps Outlook/Exchange split threads.
                "X-Entity-ID": f"otp-{code}",
                # Suppress auto-responders (OOTO, NDR) for transient OTP codes.
                "X-Auto-Response-Suppress": "OOF, DR, NDR, RN, NRN",
                "Auto-Submitted": "auto-generated",
            },
        )
    )
    if result.stubbed:
        msg = (
            "Enter the one-time code. Email delivery is not configured yet "
            "(SMTP). The code is in the Core server log."
        )
        logger.info("OTP for %s stubbed=True code=%s", email_to, code)
        return msg, True
    logger.info("OTP for %s stubbed=False", email_to)
    return "Enter the one-time code sent to your email.", False


async def _provision_api_keys(
    frappe: FrappeClient,
    *,
    sid: str | None,
    username: str,
) -> tuple[str | None, str | None]:
    """Optionally mint Frappe API keys — never rotate an existing secret.

    Frappe ``generate_keys`` always rewrites ``api_secret``. Calling it on every
    login invalidates other Core sessions that stored the previous secret.
    Logged-in flows act via ``frappe_sid``; keys are only created once when the
    User has no ``api_key`` yet (sid-less / guest fallback).
    """
    if sid:
        # Session cookie is enough for acting-as-user; skip key minting.
        return None, None
    try:
        client = frappe.with_session(sid) if sid else frappe
        user_doc = await client.resource("User", name=username)
        data = user_doc.get("data") if isinstance(user_doc, dict) else None
        if isinstance(data, dict) and data.get("api_key"):
            # Secret is write-only after mint — cannot recover without rotating.
            return None, None
        raw = await client.method(
            "frappe.core.doctype.user.user.generate_keys",
            json={"user": username},
        )
        if isinstance(raw, dict):
            key = raw.get("api_key") or raw.get("key")
            secret = raw.get("api_secret") or raw.get("secret")
            if key and secret:
                return str(key), str(secret)
    except FrappeError as exc:
        logger.warning("API key provision failed for %s: %s", username, exc)
    return None, None


async def _build_session(
    *,
    store: SessionStore,
    response: Response,
    settings: Settings,
    user: SessionUser,
    frappe_sid: str | None,
    frappe_api_key: str | None,
    frappe_api_secret: str | None,
    mock: bool,
) -> Session:
    otp_until = time.time() + settings.otp_trust_seconds
    session_id, csrf = store.create(
        user,
        frappe_sid=frappe_sid,
        frappe_api_key=frappe_api_key,
        frappe_api_secret=frappe_api_secret,
        mock=mock,
        otp_verified_until=otp_until,
    )
    set_session_cookies(
        response,
        session_id=session_id,
        csrf_token=csrf,
        settings=settings,
    )
    return Session(
        access_token=session_id,
        token_type="bearer",
        user=user,
        otp_verified_until=otp_until,
        locked=False,
    )


def _challenge_response(
    *,
    challenge_id: str,
    message: str,
    stubbed: bool,
    email_hint: str | None,
) -> JSONResponse:
    body = LoginChallenge(
        status="otp_required",
        challenge_id=challenge_id,
        message=message,
        stubbed=stubbed,
        email_hint=email_hint,
    )
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content=body.model_dump(),
    )


@router.post("/login", response_model=None)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    store: Annotated[SessionStore, Depends(get_session_store)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Session | JSONResponse:
    """Password verifies credentials then requires OTP; OTP completes the session."""
    check_auth_rate_limit(request)
    _purge_expired_challenges()

    # --- Complete login with OTP ---
    if body.otp:
        challenge: dict[str, Any] | None = None
        if body.challenge_id:
            challenge = _CHALLENGES.get(body.challenge_id)
        identity = _identity_from_login(body)
        if challenge is None and identity:
            # Find challenge by identity
            for cid, ch in _CHALLENGES.items():
                if ch.get("identity", "").lower() == identity.lower():
                    challenge = ch
                    body.challenge_id = cid
                    break
        if not challenge:
            raise AuthRequired(
                reason="challenge_required",
                detail="Sign-in expired. Enter your password again, then the new code.",
            )
        if challenge.get("expires", 0) < time.time():
            _CHALLENGES.pop(body.challenge_id or "", None)
            raise AuthRequired(
                reason="challenge_required",
                detail="Sign-in expired. Enter your password again, then the new code.",
            )

        otp_key = str(challenge.get("identity", "")).lower()
        otp_rec = _OTP_STORE.get(otp_key)
        if not otp_rec and challenge.get("email_to"):
            otp_rec = _OTP_STORE.get(str(challenge["email_to"]).lower())
        if (
            not otp_rec
            or otp_rec.get("expires", 0) < time.time()
            or otp_rec.get("code") != body.otp.strip()
        ):
            raise AuthRequired(detail="Invalid or expired code. Use Resend code or sign in again.")

        _OTP_STORE.pop(otp_key, None)
        if challenge.get("email_to"):
            _OTP_STORE.pop(str(challenge["email_to"]).lower(), None)
        _CHALLENGES.pop(body.challenge_id or "", None)

        user = SessionUser(**challenge["user"])
        return await _build_session(
            store=store,
            response=response,
            settings=settings,
            user=user,
            frappe_sid=challenge.get("frappe_sid"),
            frappe_api_key=challenge.get("frappe_api_key"),
            frappe_api_secret=challenge.get("frappe_api_secret"),
            mock=bool(challenge.get("mock")),
        )

    # --- Password step → OTP challenge ---
    identity = _identity_from_login(body)
    if not identity:
        raise AuthRequired(detail="email or username required")
    if not body.password:
        raise AuthRequired(detail="password required")

    user: SessionUser
    frappe_sid: str | None = None
    api_key: str | None = None
    api_secret: str | None = None
    mock = False

    try:
        result = await frappe.login(identity, body.password)
        user_data = result["user"]
        user = SessionUser(
            username=user_data["username"],
            full_name=user_data.get("full_name") or user_data["username"],
            email=user_data.get("email") or (identity if "@" in identity else None),
            roles=user_data.get("roles") or ["Desk User"],
        )
        frappe_sid = result.get("sid")
        api_key, api_secret = await _provision_api_keys(
            frappe, sid=frappe_sid, username=user.username
        )
    except FrappeError as exc:
        if mock_auth_permitted(exc):
            logger.warning(
                "Frappe login failed (%s); mock pending OTP (CORE_ALLOW_MOCK_AUTH or unreachable)",
                exc,
            )
            user = SessionUser(
                username=identity,
                full_name=identity.split("@")[0].replace(".", " ").title(),
                email=identity if "@" in identity else f"{identity}@mock.eswasaone.local",
                roles=["Citizen"],
            )
            mock = True
        else:
            logger.warning("Frappe login rejected (no mock): %s", exc)
            raise AuthRequired(
                reason="invalid_credentials",
                detail="Invalid credentials",
            ) from exc

    challenge_id = secrets.token_urlsafe(24)
    email_to = user.email or (identity if "@" in identity else f"{identity}@localhost")
    _CHALLENGES[challenge_id] = {
        "identity": identity,
        "email_to": email_to,
        "user": user.model_dump(),
        "frappe_sid": frappe_sid,
        "frappe_api_key": api_key,
        "frappe_api_secret": api_secret,
        "mock": mock,
        "expires": time.time() + settings.otp_code_ttl_seconds,
    }
    message, stubbed = await _send_otp_code(
        identity=identity,
        email_to=email_to,
        settings=settings,
        challenge_id=challenge_id,
    )
    hint = email_to
    if "@" in email_to:
        local, _, domain = email_to.partition("@")
        hint = f"{local[:2]}***@{domain}" if len(local) > 2 else f"***@{domain}"

    return _challenge_response(
        challenge_id=challenge_id,
        message=message,
        stubbed=stubbed,
        email_hint=hint,
    )


@router.post("/register", response_model=None)
async def register(
    body: RegisterRequest,
    request: Request,
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> JSONResponse:
    """Create Citizen account then require OTP (same challenge path as login)."""
    check_auth_rate_limit(request)
    _purge_expired_challenges()
    email, name = _validate_register(body)
    password = body.password or secrets.token_urlsafe(12)
    mock = False
    frappe_sid: str | None = None
    api_key: str | None = None
    api_secret: str | None = None

    try:
        created = await frappe.register_citizen(
            email=email,
            full_name=name,
            password=password,
            org=body.org,
        )
        user = SessionUser(
            username=created.get("username") or email,
            full_name=name,
            email=email,
            roles=_ensure_citizen_roles(created.get("roles")),
        )
        api_key = created.get("api_key")
        api_secret = created.get("api_secret")
        frappe_sid = created.get("sid")
        if not api_key:
            api_key, api_secret = await _provision_api_keys(
                frappe, sid=frappe_sid, username=user.username
            )
    except FrappeError as exc:
        if is_conflict(exc):
            logger.warning("Register conflict: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Account already exists",
            ) from exc
        if mock_auth_permitted(exc):
            logger.warning(
                "Frappe register failed (%s); mock Citizen pending OTP "
                "(CORE_ALLOW_MOCK_AUTH or unreachable)",
                exc,
            )
            user = SessionUser(
                username=email,
                full_name=name,
                email=email,
                roles=["Citizen"],
            )
            mock = True
        else:
            logger.warning("Frappe register rejected (no mock): %s", exc)
            raise HTTPException(
                status_code=exc.status_code or status.HTTP_502_BAD_GATEWAY,
                detail=str(exc) or "Registration failed",
            ) from exc

    challenge_id = secrets.token_urlsafe(24)
    email_to = user.email or email
    _CHALLENGES[challenge_id] = {
        "identity": email,
        "email_to": email_to,
        "user": user.model_dump(),
        "frappe_sid": frappe_sid,
        "frappe_api_key": api_key,
        "frappe_api_secret": api_secret,
        "mock": mock,
        "expires": time.time() + settings.otp_code_ttl_seconds,
        "purpose": "register",
    }
    message, stubbed = await _send_otp_code(
        identity=email,
        email_to=email_to,
        settings=settings,
        challenge_id=challenge_id,
    )
    hint = email_to
    if "@" in email_to:
        local, _, domain = email_to.partition("@")
        hint = f"{local[:2]}***@{domain}" if len(local) > 2 else f"***@{domain}"

    # Welcome note after OTP succeeds (login completion); still ack creation here.
    await _send_register_confirmation(email=email, name=name, org=body.org)

    return _challenge_response(
        challenge_id=challenge_id,
        message=message or "Enter the one-time code sent to your email to finish signing up.",
        stubbed=stubbed,
        email_hint=hint,
    )


async def _send_register_confirmation(
    *,
    email: str,
    name: str,
    org: str | None,
) -> None:
    messaging = get_messaging()
    org_line = f" Organisation: {org}." if org else ""
    result = await messaging.send_email(
        EmailRequest(
            to=email,
            subject="Welcome to EswasaOne",
            body=(
                f"Hello {name},\n\n"
                f"Your EswasaOne Service Portal account is ready.{org_line}\n"
                f"Sign in at https://eswasaone.aiceafrica.com/\n\n"
                f"Eswatini Standards Authority"
            ),
        )
    )
    if result.stubbed:
        logger.info("Register confirmation stubbed for %s", email)


@router.post("/otp", response_model=OtpResponse)
async def request_otp(
    body: OtpRequest,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> OtpResponse:
    """Resend OTP for an in-progress login challenge (same identity as password step)."""
    check_auth_rate_limit(request)
    identity = body.email.strip()
    # Prefer active challenge mailbox so username vs email aliases match
    email_to = identity
    for ch in _CHALLENGES.values():
        if ch.get("identity", "").lower() == identity.lower() or ch.get("email_to", "").lower() == identity.lower():
            identity = str(ch.get("identity") or identity)
            email_to = str(ch.get("email_to") or email_to)
            break
    message, stubbed = await _send_otp_code(
        identity=identity,
        email_to=email_to if "@" in email_to else f"{email_to}@localhost",
        settings=settings,
    )
    return OtpResponse(ok=True, message=message, stubbed=stubbed)


@router.post("/unlock", response_model=Session)
async def unlock(
    body: UnlockRequest,
    request: Request,
    response: Response,
    store: Annotated[SessionStore, Depends(get_session_store)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
    auth: Annotated[AuthContext | None, Depends(get_optional_auth)],
) -> Session:
    """Idle soft-lock unlock — password only while OTP trust window is valid."""
    check_auth_rate_limit(request)
    if auth is None or auth.is_guest:
        # Prefer a typed reason so portals can escalate to full sign-in.
        raise AuthRequired(
            reason="session_expired",
            detail="Session required to unlock. Sign in again",
        )

    data = store.get(auth.token)
    if not data:
        raise AuthRequired(detail="Session expired")

    otp_until = float(data.get("otp_verified_until") or 0)
    if otp_until < time.time():
        store.delete(auth.token)
        clear_session_cookies(response, settings)
        raise AuthRequired(
            reason="otp_expired",
            detail="OTP trust window expired. Sign in with password and OTP",
        )

    identity = (body.email or body.username or auth.user.username).strip()
    if not body.password:
        raise AuthRequired(detail="password required")

    # Verify password matches the session user
    session_user = auth.user.username.lower()
    if identity.lower() not in (session_user, (auth.user.email or "").lower()):
        raise AuthRequired(detail="Unlock identity must match the locked session")

    try:
        await frappe.login(identity, body.password)
    except FrappeError as exc:
        if data.get("mock") and mock_auth_permitted(exc):
            pass
        else:
            raise AuthRequired(
                reason="invalid_credentials",
                detail="Invalid credentials",
            ) from exc

    updated = store.touch(auth.token)
    otp_until = float((updated or data).get("otp_verified_until") or otp_until)
    return Session(
        access_token=auth.token,
        token_type="bearer",
        user=auth.user,
        otp_verified_until=otp_until,
        locked=False,
    )


@router.post("/touch", status_code=status.HTTP_204_NO_CONTENT)
async def touch(
    store: Annotated[SessionStore, Depends(get_session_store)],
    auth: Annotated[AuthContext, Depends(require_auth)],
) -> Response:
    """Heartbeat — resets idle timer when session is not soft-locked."""
    data = store.get(auth.token)
    if not data:
        raise AuthRequired(detail="Session expired")
    if data.get("locked"):
        raise AuthRequired(reason="session_locked", detail="Session locked; unlock required")
    otp_until = float(data.get("otp_verified_until") or 0)
    if otp_until < time.time():
        store.delete(auth.token)
        raise AuthRequired(
            reason="otp_expired",
            detail="OTP trust window expired. Sign in again",
        )
    store.touch(auth.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/invite-staff", response_model=InviteStaffResponse, status_code=status.HTTP_201_CREATED)
async def invite_staff(
    body: InviteStaffRequest,
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    auth: Annotated[AuthContext, Depends(require_staff)],
) -> InviteStaffResponse:
    """Admin-issued Institution account — Frappe welcome email (set-password link)."""
    inviter_roles = set(auth.user.roles or [])
    if not inviter_roles & {"System Manager", "Administrator", "HR Manager", "HR User"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only System Manager, Administrator, or HR roles may invite staff",
        )

    email = body.email.strip().lower()
    roles = [r for r in body.roles if r in _INVITE_ROLES]
    if not roles:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one allowed staff role required",
        )

    messaging = get_messaging()
    if not messaging.config.email_configured:
        # Frappe welcome email also needs Email Account; Core SMTP is the shared signal
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP not configured. Set SMTP_* and run configure_smtp.py before inviting staff",
        )

    try:
        await frappe.invite_staff(
            email=email,
            full_name=body.full_name.strip(),
            roles=roles,
            org=body.org,
        )
    except FrappeError as exc:
        if is_conflict(exc) or exc.status_code == 409:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Account already exists",
            ) from exc
        raise HTTPException(
            status_code=exc.status_code or status.HTTP_502_BAD_GATEWAY,
            detail=str(exc) or "Invite failed",
        ) from exc

    return InviteStaffResponse(
        ok=True,
        email=email,
        message="Staff account created; welcome email sent via Frappe",
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    store: Annotated[SessionStore, Depends(get_session_store)],
    auth: Annotated[AuthContext | None, Depends(get_optional_auth)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    token = None
    if auth is not None and auth.token:
        token = auth.token
    else:
        token = request.cookies.get(COOKIE_NAME)
    if token:
        store.delete(token)
    clear_session_cookies(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=SessionUser)
async def me(
    auth: Annotated[AuthContext | None, Depends(get_optional_auth)],
    store: Annotated[SessionStore, Depends(get_session_store)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> SessionUser:
    """Return current user even when soft-locked (idle); 401 when no session.

    Always re-fetch roles from Frappe when a live ``sid`` is available so Admin
    role removals / profile changes apply without forcing a full re-login.
    (Previously we only refreshed Guest/All snapshots, which left stale staff
    roles in the Core session after privileges were stripped.)
    """
    if auth is None or auth.is_guest:
        raise AuthRequired(detail="Authentication required")

    roles = list(auth.user.roles or [])
    if auth.frappe_sid and not auth.mock:
        refreshed = await frappe.refresh_user_roles(
            sid=auth.frappe_sid,
            username=auth.user.username,
        )
        # Empty list means fetch failed — keep the snapshot. Non-empty always wins
        # (including Guest/All-only after roles were stripped in Desk/Admin).
        if refreshed and set(refreshed) != set(roles):
            updated = SessionUser(
                username=auth.user.username,
                full_name=auth.user.full_name,
                email=auth.user.email,
                roles=list(refreshed),
            )
            store.update(auth.token, user=updated.model_dump())
            return updated

    return auth.user


@router.post("/password/reset", response_model=PasswordResetResponse)
async def request_password_reset(
    body: PasswordResetRequest,
    request: Request,
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PasswordResetResponse:
    """Email a password-reset link via Frappe.

    Anti-enumeration: always returns 200 with the same body whether or not the
    account exists. Frappe's ``reset_password`` whitelisted method emails a
    link to the user's registered address; the new password is set on the
    Frappe-hosted reset page that the link points to (no new password is
    accepted on this Core endpoint).
    """
    check_auth_rate_limit(request)
    email = (body.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Valid email required",
        )

    # Frappe's reset_password is anti-enumeration by design: it returns the
    # same success message for known and unknown users, so we mirror that
    # constant response shape regardless of the outcome below.
    const_ok = "If an account exists for that email, a reset link is on its way."
    stubbed = False

    try:
        result = await frappe.method(
            "frappe.core.doctype.user.user.reset_password",
            json={"user": email},
        )
        # Frappe returns a message string; treat a truthy return as dispatched.
        dispatched = bool(result) if not isinstance(result, dict) else bool(
            result.get("message") or result.get("ok")
        )
        if not dispatched:
            stubbed = True
    except FrappeError as exc:
        # If Frappe is unreachable and mock auth is allowed, stay silent
        # (anti-enumeration). Otherwise surface a server error only for
        # genuine infrastructure failures — never for unknown-user.
        if mock_auth_permitted(exc):
            logger.warning(
                "Frappe reset_password unreachable (%s); responding constant ok",
                exc,
            )
            stubbed = True
        else:
            logger.warning("Frappe reset_password failed (no mock): %s", exc)
            # 503 only when SMTP/infra is the cause; otherwise constant ok.
            messaging = get_messaging()
            if not messaging.config.email_configured:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Email delivery is not configured. Contact ESWASA to reset your password.",
                ) from exc
            stubbed = True

    # If Core SMTP is not configured at all, be honest but still
    # anti-enumeration in the success message.
    messaging = get_messaging()
    if not messaging.config.email_configured and not stubbed:
        # Frappe may still have its own Email Account wired; only flag when
        # Core's adapter is unset AND Frappe didn't clearly dispatch.
        pass

    return PasswordResetResponse(ok=True, message=const_ok, stubbed=stubbed)


@router.post("/password/reset", response_model=PasswordResetResponse)
async def request_password_reset(
    body: PasswordResetRequest,
    request: Request,
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PasswordResetResponse:
    """Email a password-reset link via Frappe.

    Anti-enumeration: always returns 200 with the same message whether or
    not the account exists. Frappe's ``frappe.core.doctype.user.user.reset_password``
    emails a keyed reset link to the user; the new password is set on the
    Frappe-hosted reset page (not in Core).
    """
    check_auth_rate_limit(request)
    email = body.email.strip().lower()
    messaging = get_messaging()

    # SMTP must be configured for the reset link to reach the user.
    if not messaging.config.email_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is not configured. Contact ESWASA support to reset your password.",
        )

    stubbed = False
    try:
        # Frappe's reset_password is anti-enumeration by design: it returns
        # the same success payload for known and unknown users. We mirror
        # that here so Core never reveals whether an account exists.
        await frappe.method(
            "frappe.core.doctype.user.user.reset_password",
            json={"user": email},
        )
    except FrappeError as exc:
        # If Frappe is unreachable and mock auth is permitted, treat as
        # stubbed (link not actually sent) but still return 200 so the
        # endpoint does not leak account/availability state.
        if mock_auth_permitted(exc):
            logger.warning(
                "Password reset for %s stubbed (Frappe unreachable / mock): %s",
                email,
                exc,
            )
            stubbed = True
        else:
            logger.warning("Password reset Frappe call failed (no mock): %s", exc)
            # Still return 200 to avoid enumeration; the link just won't arrive.
            stubbed = True

    logger.info("Password reset requested for %s (stubbed=%s)", email, stubbed)
    return PasswordResetResponse(
        ok=True,
        message=(
            "If an account exists for that email, a password-reset link has been sent. "
            "Check your inbox and follow the link to set a new password."
        ),
        stubbed=stubbed,
    )


@router.post("/password/reset", response_model=PasswordResetResponse)
async def request_password_reset(
    body: PasswordResetRequest,
    request: Request,
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PasswordResetResponse:
    """Email a password-reset link via Frappe.

    Anti-enumeration: always returns 200 with the same body whether or not
    the account exists (mirrors Frappe's ``reset_password`` behaviour). The
    reset link points at the Frappe-hosted reset page where the new password
    is set — Core never accepts a new password directly.
    """
    check_auth_rate_limit(request)
    email = (body.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Valid email required",
        )

    messaging = get_messaging()
    if not messaging.config.email_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP not configured; cannot send password reset link",
        )

    stubbed = False
    try:
        # Frappe's whitelisted reset_password emails a reset link keyed to the
        # user. It returns a neutral message regardless of whether the user
        # exists, preventing account enumeration.
        await frappe.method(
            "frappe.core.doctype.user.user.reset_password",
            json={"user": email},
        )
    except FrappeError as exc:
        # Frappe returns 404/500 for unknown users in some versions; we must
        # NOT surface that distinction to the client (anti-enumeration).
        logger.warning(
            "Frappe reset_password for %s raised %s; returning neutral 200",
            email,
            exc,
        )
        stubbed = True

    return PasswordResetResponse(
        ok=True,
        message=(
            "If an account exists for that email, a password-reset link has "
            "been sent. Check your inbox (and spam folder). The link expires "
            "after a short window."
        ),
        stubbed=stubbed,
    )


@router.post("/password/reset", response_model=PasswordResetResponse)
async def request_password_reset(
    body: PasswordResetRequest,
    request: Request,
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PasswordResetResponse:
    """Email a password-reset link via Frappe.

    Anti-enumeration: always returns 200 with the same message whether or
    not the account exists (mirrors Frappe's ``reset_password`` behaviour).
    The reset link points at the Frappe-hosted reset page where the user
    sets a new password — Core never accepts the new password itself.

    Returns 503 when SMTP is not configured (no way to deliver the link).
    """
    check_auth_rate_limit(request)
    messaging = get_messaging()
    if not messaging.config.email_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP not configured. Contact the administrator to reset your password.",
        )

    email = body.email.strip().lower()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Valid email required",
        )

    # Frappe's reset_password is anti-enumeration: it returns the same
    # message regardless of whether the user exists. We mirror that here
    # so the response body is identical for known and unknown addresses.
    stubbed = False
    try:
        await frappe.method(
            "frappe.core.doctype.user.user.reset_password",
            json={"user": email},
        )
    except FrappeError as exc:
        # Frappe returns 404/500 for unknown users in some versions but
        # still sends nothing. Treat as a no-op so we never leak whether
        # the account exists — consistent with the www/forgot_password page.
        logger.info("password reset for %s: frappe returned %s (treated as no-op)", email, exc)
        stubbed = True

    logger.info("password reset requested for %s", email)
    return PasswordResetResponse(
        ok=True,
        message=(
            "If an account exists for that email, a reset link is on its way. "
            "Check your inbox (and spam folder). The link expires after a few hours."
        ),
        stubbed=stubbed,
    )
