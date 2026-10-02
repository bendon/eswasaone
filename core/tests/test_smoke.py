"""Smoke tests for Core BFF (mock mode — Frappe optional)."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.auth_helpers import login_full_session


@pytest.fixture(autouse=True)
def _allow_mock_auth_for_smoke(monkeypatch: pytest.MonkeyPatch) -> None:
    """Smoke uses demo credentials; enable mock when Frappe is up but user missing."""
    monkeypatch.setenv("CORE_ALLOW_MOCK_AUTH", "true")


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_login_me_and_homes(client: AsyncClient) -> None:
    body = await login_full_session(client, username="demo", password="demo")
    token = body["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = await client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["username"] == "demo"

    inst = await client.get("/api/home/institution", headers=headers)
    assert inst.status_code == 200
    assert "kpis" in inst.json()

    svc = await client.get("/api/home/service", headers=headers)
    assert svc.status_code == 200
    assert "stats" in svc.json()


@pytest.mark.asyncio
async def test_cert_confirm_and_overdue(client: AsyncClient) -> None:
    body = await login_full_session(client, username="a", password="b")
    headers = {"Authorization": f"Bearer {body['access_token']}"}

    denied = await client.post(
        "/api/certification/applications",
        headers=headers,
        json={"scheme": "Product", "applicant_name": "X", "confirm": False},
    )
    assert denied.status_code == 400

    created = await client.post(
        "/api/certification/applications",
        headers=headers,
        json={"scheme": "Product Certification", "applicant_name": "Acme", "confirm": True},
    )
    assert created.status_code == 201

    overdue = await client.get("/api/certification/audits/overdue", headers=headers)
    assert overdue.status_code == 200
    assert len(overdue.json()["items"]) >= 1


@pytest.mark.asyncio
async def test_momo_checkout_and_callback(client: AsyncClient) -> None:
    body_sess = await login_full_session(client, username="a", password="b")
    headers = {"Authorization": f"Bearer {body_sess['access_token']}"}

    checkout = await client.post(
        "/api/estore/checkout",
        headers=headers,
        json={
            "items": [{"standard_code": "SZNS 001", "qty": 1}],
            "payment_method": "momo",
            "confirm": True,
        },
    )
    assert checkout.status_code == 200
    body = checkout.json()
    assert body["momo_reference"]
    assert body["order_id"]

    cb = await client.post(
        "/api/adapters/momo/callback",
        json={
            "referenceId": body["momo_reference"],
            "status": "SUCCESSFUL",
            "externalId": body["order_id"],
            "amount": "150.00",
            "currency": "SZL",
        },
    )
    assert cb.status_code == 200
    assert cb.json()["status"] == "accepted"


@pytest.mark.asyncio
async def test_verify_standards_applicability_agent(client: AsyncClient) -> None:
    body_sess = await login_full_session(client, username="a", password="b")
    headers = {"Authorization": f"Bearer {body_sess['access_token']}"}

    verify = await client.get("/api/verify/ESW-DEMO-001")
    assert verify.status_code == 200
    assert "valid" in verify.json()

    standards = await client.get("/api/standards", headers=headers)
    assert standards.status_code == 200
    assert "items" in standards.json()

    appl = await client.post(
        "/api/ingest/applicability",
        headers=headers,
        json={"query": "beverage carbon dioxide HS 220210", "jurisdiction": "Eswatini"},
    )
    assert appl.status_code == 200
    data = appl.json()
    assert data["summary"]
    assert data["citations"]

    ask = await client.post(
        "/api/agent/ask",
        headers=headers,
        json={"message": "show overdue audits"},
    )
    assert ask.status_code == 200
    assert "list_overdue_audits" in (ask.json().get("tools_used") or [])



@pytest.mark.asyncio
async def test_cookie_session_and_me_guest(client: AsyncClient) -> None:
    guest = await client.get("/api/auth/me")
    assert guest.status_code == 401
    assert guest.json().get("auth_required") is True

    body = await login_full_session(
        client, email="citizen@example.com", password="secret"
    )
    assert "eswasaone_session" in client.cookies or body.get("access_token")
    assert body["user"]["username"]
    assert body.get("access_token")  # dual-path still returns Bearer token

    me_cookie = await client.get("/api/auth/me")
    assert me_cookie.status_code == 200
    assert me_cookie.json()["username"]

    # Bearer dual-path still works
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    me_bearer = await client.get("/api/auth/me", headers=headers)
    assert me_bearer.status_code == 200

    # Public catalogue allowed for guest (fresh client without cookies)
    from httpx import ASGITransport, AsyncClient as AC
    from app.main import app

    transport = ASGITransport(app=app)
    async with AC(transport=transport, base_url="http://test") as guest_client:
        standards = await guest_client.get("/api/standards")
        assert standards.status_code == 200
        ask = await guest_client.post(
            "/api/agent/ask",
            json={"message": "show overdue audits"},
        )
        assert ask.status_code == 401
        assert ask.json().get("auth_required") is True

    logout = await client.post("/api/auth/logout")
    assert logout.status_code == 204
    after = await client.get("/api/auth/me")
    assert after.status_code == 401


@pytest.mark.asyncio
async def test_register_and_otp_stub(client: AsyncClient) -> None:
    import secrets

    from app.identity import router as identity_router

    email = f"new-{secrets.token_hex(4)}@example.com"
    reg = await client.post(
        "/api/auth/register",
        json={"email": email, "name": "New Citizen", "password": "TestPass123!"},
    )
    assert reg.status_code == 202
    challenge = reg.json()
    assert challenge.get("status") == "otp_required"
    assert challenge.get("challenge_id")
    # No session cookie until OTP completes
    me_before = await client.get("/api/auth/me")
    assert me_before.status_code == 401

    otp_rec = identity_router._OTP_STORE.get(email.lower())
    assert otp_rec, "OTP should be stored after register"
    otp = otp_rec["code"]

    done = await client.post(
        "/api/auth/login",
        json={
            "email": email,
            "otp": otp,
            "challenge_id": challenge["challenge_id"],
        },
    )
    assert done.status_code == 200
    assert "Citizen" in done.json()["user"]["roles"]
    assert done.json().get("otp_verified_until")

    me_after = await client.get("/api/auth/me")
    assert me_after.status_code == 200
    assert "Citizen" in me_after.json()["roles"]
    assert not any(
        r in ("Desk User", "ESWASA Staff", "System Manager") for r in me_after.json()["roles"]
    )
