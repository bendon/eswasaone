"""Identity hardening — no silent mock when Frappe is up; register validation."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import has_staff_role, require_staff
from app.identity.errors import AuthRequired
from app.identity.mock_gate import is_conflict, mock_auth_permitted
from app.main import app
from app.schemas import SessionUser


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
def _no_mock_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CORE_ALLOW_MOCK_AUTH", raising=False)
    monkeypatch.setenv("CORE_ALLOW_MOCK_AUTH", "false")


@pytest.mark.asyncio
async def test_login_no_mock_when_frappe_up_bad_password(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _bad_login(self: FrappeClient, username: str, password: str) -> dict[str, Any]:
        self._reachable = True
        raise FrappeError("Invalid credentials", status_code=401)

    monkeypatch.setattr(FrappeClient, "login", _bad_login)

    resp = await client.post(
        "/api/auth/login",
        json={"email": "citizen@example.com", "password": "wrong-password"},
    )
    assert resp.status_code == 401
    body = resp.json()
    assert body.get("auth_required") is True
    assert "access_token" not in body
    assert "user" not in body
    assert "eswasaone_session" not in resp.cookies


@pytest.mark.asyncio
async def test_login_mock_when_frappe_unreachable(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _down(self: FrappeClient, username: str, password: str) -> dict[str, Any]:
        self._reachable = False
        raise FrappeError("Frappe unreachable: connection refused")

    monkeypatch.setattr(FrappeClient, "login", _down)

    resp = await client.post(
        "/api/auth/login",
        json={"email": "offline@example.com", "password": "any"},
    )
    # Password step must NOT issue a session — OTP challenge only
    assert resp.status_code == 202
    body = resp.json()
    assert body.get("status") == "otp_required"
    assert body.get("challenge_id")
    assert "eswasaone_session" not in resp.cookies

    from app.identity import router as identity_router

    challenge_id = body["challenge_id"]
    ch = identity_router._CHALLENGES[challenge_id]
    otp = identity_router._OTP_STORE[ch["identity"].lower()]["code"]

    done = await client.post(
        "/api/auth/login",
        json={
            "email": "offline@example.com",
            "otp": otp,
            "challenge_id": challenge_id,
        },
    )
    assert done.status_code == 200
    assert done.json()["user"]["username"]
    assert "Citizen" in done.json()["user"]["roles"]
    assert done.json().get("otp_verified_until")


@pytest.mark.asyncio
async def test_register_validation_rejects_empty_fields(client: AsyncClient) -> None:
    missing_name = await client.post(
        "/api/auth/register",
        json={"email": "ok@example.com", "name": "   "},
    )
    assert missing_name.status_code == 422

    bad_email = await client.post(
        "/api/auth/register",
        json={"email": "not-an-email", "name": "Someone"},
    )
    assert bad_email.status_code == 422

    empty = await client.post(
        "/api/auth/register",
        json={"email": "", "name": ""},
    )
    assert empty.status_code == 422


@pytest.mark.asyncio
async def test_register_conflict_when_frappe_up(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _conflict(
        self: FrappeClient,
        *,
        email: str,
        full_name: str,
        password: str,
        org: str | None = None,
    ) -> dict[str, Any]:
        self._reachable = True
        raise FrappeError(f"Account already exists for {email}", status_code=409)

    monkeypatch.setattr(FrappeClient, "register_citizen", _conflict)

    resp = await client.post(
        "/api/auth/register",
        json={"email": "taken@example.com", "name": "Taken User", "password": "x"},
    )
    assert resp.status_code == 409
    assert "already" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_otp_stubbed_message_when_smtp_empty(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.adapters.messaging import DeliveryStatus, MessageResult
    from app.identity import router as identity_router

    class _StubMessaging:
        async def send_email(self, req: Any) -> MessageResult:
            return MessageResult(
                channel="email",
                status=DeliveryStatus.STUBBED,
                message_id="stub-1",
                to=req.to,
                stubbed=True,
                detail="SMTP empty",
            )

    monkeypatch.setattr(identity_router, "get_messaging", lambda: _StubMessaging())

    resp = await client.post("/api/auth/otp", json={"email": "otp@example.com"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body.get("stubbed") is True
    msg = (body.get("message") or "").lower()
    assert body.get("stubbed") is True
    assert msg != "otp sent"
    assert "smtp" in msg or "not sent" in msg or "log" in msg


def test_mock_gate_helpers() -> None:
    up = FrappeError("Invalid credentials", status_code=401)
    assert not mock_auth_permitted(up)
    down = FrappeError("Frappe unreachable: timeout")
    assert mock_auth_permitted(down)
    assert is_conflict(FrappeError("Account already exists", status_code=409))


def test_has_staff_role() -> None:
    assert not has_staff_role(["Citizen"])
    assert not has_staff_role(["Citizen", "Guest"])
    assert not has_staff_role(["Citizen", "Customer"])
    assert not has_staff_role(["Citizen", "LMS Student"])
    assert not has_staff_role(["Custom Ops Role"])  # public extras ≠ Institution staff
    assert has_staff_role(["Desk User"])
    assert has_staff_role(["System Manager", "Citizen"])
    assert has_staff_role(["ESWASA Staff"])


@pytest.mark.asyncio
async def test_require_staff_rejects_citizen() -> None:
    from app.identity.deps import AuthContext

    citizen = AuthContext(
        token="t",
        user=SessionUser(
            username="c@example.com",
            full_name="Citizen",
            email="c@example.com",
            roles=["Citizen"],
        ),
        frappe_sid=None,
        mock=False,
    )
    with pytest.raises(AuthRequired) as exc:
        await require_staff(citizen)
    assert exc.value.reason == "staff_required"

    staff = AuthContext(
        token="t",
        user=SessionUser(
            username="admin",
            full_name="Admin",
            email=None,
            roles=["System Manager", "Desk User"],
        ),
        frappe_sid="sid",
        mock=False,
    )
    assert await require_staff(staff) is staff
