"""Session + CSRF cookie helpers."""

from __future__ import annotations

from fastapi import Response

from app.config import Settings, get_settings
from app.identity.session import COOKIE_NAME, CSRF_COOKIE_NAME


def set_session_cookies(
    response: Response,
    *,
    session_id: str,
    csrf_token: str,
    settings: Settings | None = None,
) -> None:
    cfg = settings or get_settings()
    common = {
        "max_age": cfg.session_ttl_seconds,
        "path": "/",
        "secure": cfg.session_cookie_secure,
        "samesite": "lax",
        "domain": cfg.session_cookie_domain or None,
    }
    response.set_cookie(
        key=COOKIE_NAME,
        value=session_id,
        httponly=True,
        **common,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        **common,
    )


def clear_session_cookies(response: Response, settings: Settings | None = None) -> None:
    cfg = settings or get_settings()
    domain = cfg.session_cookie_domain or None
    response.delete_cookie(COOKIE_NAME, path="/", domain=domain)
    response.delete_cookie(CSRF_COOKIE_NAME, path="/", domain=domain)
