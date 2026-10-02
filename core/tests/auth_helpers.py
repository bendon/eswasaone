"""Shared test helpers."""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient


async def login_full_session(
    client: AsyncClient,
    *,
    username: str = "demo",
    password: str = "demo",
    email: str | None = None,
) -> dict[str, Any]:
    """Password → OTP challenge → complete session (mandatory OTP login)."""
    from app.identity import router as identity_router
    from app.identity.rate_limit import reset_auth_rate_limit

    reset_auth_rate_limit()

    body: dict[str, str] = {"password": password}
    if email:
        body["email"] = email
    else:
        body["username"] = username

    challenge = await client.post("/api/auth/login", json=body)
    assert challenge.status_code == 202, challenge.text
    data = challenge.json()
    assert data.get("status") == "otp_required"
    cid = data["challenge_id"]
    ch = identity_router._CHALLENGES[cid]
    otp = identity_router._OTP_STORE[ch["identity"].lower()]["code"]

    payload: dict[str, str] = {"otp": otp, "challenge_id": cid}
    if email:
        payload["email"] = email
    else:
        payload["username"] = username

    done = await client.post("/api/auth/login", json=payload)
    assert done.status_code == 200, done.text
    return done.json()
