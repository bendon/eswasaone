"""Contract renew / make permanent (H2a) — passes through to eswasa_hr.contracts."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

CHANGES = {"employee": "EMP-7", "employee_name": "Gcina Mavuso", "status": "Active", "items": [
    {"id": "CC-1", "kind": "contract", "date": "2026-10-12", "state": "Waiting for approval",
     "changes": [{"property": "Type", "current": "", "new": "Renew"}, {"property": "Contract end", "current": "2026-11-30", "new": "2027-11-30"}]}]}
DEFAULTS = {"employee": "EMP-7", "employee_name": "Gcina Mavuso", "employment_type": "Fixed-term", "contract_end_date": "2026-11-30",
            "employment_types": ["Fixed-term", "Permanent"], "pending": None}


def _ctx() -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="hr@x", full_name="HR", email="hr@x", roles=["HR Manager"]),
                       frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx
    app.dependency_overrides[require_auth_csrf] = _ctx
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        return DEFAULTS if method.endswith(".defaults") else CHANGES

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_defaults(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/employees/EMP-7/contract")
    assert r.json()["employment_types"] == ["Fixed-term", "Permanent"]
    assert calls == [("eswasa_hr.contracts.defaults", {"employee": "EMP-7"})]


@pytest.mark.asyncio
async def test_prepare_needs_confirm_then_passes_through(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    body = {"kind": "Renew", "new_end": "2027-11-30", "reason": "Post still funded"}
    assert (await client.post("/api/hr/employees/EMP-7/contract", json={**body, "confirm": False})).status_code == 400
    assert calls == []
    r = await client.post("/api/hr/employees/EMP-7/contract", json={**body, "confirm": True})
    assert r.json()["items"][0]["kind"] == "contract"
    assert calls == [("eswasa_hr.contracts.prepare", {"employee": "EMP-7", "kind": "Renew", "reason": "Post still funded",
                                                      "new_end": "2027-11-30", "new_type": None, "confirm": 1})]
