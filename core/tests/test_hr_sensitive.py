"""Sensitive data and access log (J12) — passes through to eswasa_hr.sensitive; the reason never goes in a URL."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

VIEW = {"employee": "EMP-9", "employee_name": "Thandi Nxumalo", "level": 2, "level_label": "Pay and bank",
        "fields": [{"field": "bank_ac_no", "label": "Account number", "value": "6200112233"}], "log": "LOG-1"}
LOG = {"employee": "EMP-9", "employee_name": "Thandi Nxumalo", "can_open": [1, 2],
       "items": [{"id": "LOG-1", "viewer": "hrm@x", "viewer_name": "Nokuthula Shongwe", "level": "Pay and bank", "reason": "Bank change form", "viewed_on": "2026-10-12 09:30:00"}]}


def _ctx() -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="hrm@x", full_name="HR", email="hrm@x", roles=["HR Manager"]),
                       frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx
    app.dependency_overrides[require_auth_csrf] = _ctx
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch, deny: bool = False) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        if deny:
            raise FrappeError("frappe.exceptions.PermissionError: You can't open pay and bank details.", 403)
        return VIEW if method.endswith(".view") else LOG

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_view_needs_confirm_and_sends_the_reason_in_the_body(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    body = {"level": 2, "reason": "Bank change form received"}
    assert (await client.post("/api/hr/employees/EMP-9/sensitive", json={**body, "confirm": False})).status_code == 400
    assert calls == []
    r = await client.post("/api/hr/employees/EMP-9/sensitive", json={**body, "confirm": True})
    assert r.json()["fields"][0]["value"] == "6200112233"
    assert calls == [("eswasa_hr.sensitive.view", {"employee": "EMP-9", "level": 2, "reason": "Bank change form received", "confirm": 1})]


@pytest.mark.asyncio
async def test_refusal_is_forbidden(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, deny=True)
    r = await client.post("/api/hr/employees/EMP-9/sensitive", json={"level": 2, "reason": "Bank change form received", "confirm": True})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_access_logs(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    assert (await client.get("/api/hr/employees/EMP-9/access-log")).json()["items"][0]["viewer_name"] == "Nokuthula Shongwe"
    assert (await client.get("/api/hr/me/access-log")).json()["can_open"] == [1, 2]
    assert calls == [("eswasa_hr.sensitive.access_log", {"employee": "EMP-9"}), ("eswasa_hr.sensitive.my_access_log", None)]
