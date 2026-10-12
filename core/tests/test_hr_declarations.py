"""Declarations (J5) — /hr/me/declaration and /hr/impartiality pass rules through to eswasa_hr."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

MINE = {
    "employee": "EMP-44", "employee_name": "Thandi Mamba", "year": 2026, "year_label": "2026/27",
    "status": "outstanding", "signed_on": None, "nothing_else": False, "interests": [],
    "look_back_from": "2024-10-12", "relationships": ["Former employer", "Other"],
    "confidentiality_text": "I will keep confidential…", "wording_confirmed": False,
}


def _ctx() -> AuthContext:
    return AuthContext(
        token="t",
        user=SessionUser(username="thandi@x", full_name="Thandi Mamba", email="thandi@x", roles=["Employee"]),
        frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf",
    )


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx
    app.dependency_overrides[require_auth_csrf] = _ctx
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch, handler) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") if kw.get("json") is not None else kw.get("params")))
        return handler(method, kw)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_endpoints_require_auth() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        assert (await ac.get("/api/hr/me/declaration")).status_code == 401
        assert (await ac.get("/api/hr/impartiality")).status_code == 401


@pytest.mark.asyncio
async def test_get_my_declaration(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m, kw: MINE)
    body = (await client.get("/api/hr/me/declaration")).json()
    assert body["year_label"] == "2026/27" and body["status"] == "outstanding"
    assert body["wording_confirmed"] is False
    assert calls[0][0] == "eswasa_hr.declarations.my_declaration"


@pytest.mark.asyncio
async def test_sign_needs_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m, kw: MINE)
    resp = await client.post(
        "/api/hr/me/declaration",
        json={"nothing_else": True, "confidentiality_accepted": True, "signed_name": "Thandi Mamba", "confirm": False},
    )
    assert resp.status_code == 400
    assert calls == []


@pytest.mark.asyncio
async def test_sign_passes_interests_through(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m, kw: {**MINE, "status": "signed", "signed_on": "2026-10-12"})
    resp = await client.post(
        "/api/hr/me/declaration",
        json={
            "interests": [{"organisation": "Sample Foods Ltd", "relationship": "Former employer", "from_date": "2019-01-01", "to_date": "2020-12-31"}],
            "confidentiality_accepted": True, "signed_name": "Thandi Mamba", "confirm": True,
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "signed"
    method, payload = calls[0]
    assert method == "eswasa_hr.declarations.sign"
    assert payload["interests"][0]["organisation"] == "Sample Foods Ltd"
    assert (payload["confidentiality_accepted"], payload["nothing_else"], payload["confirm"]) == (1, 0, 1)


@pytest.mark.asyncio
async def test_frappe_rule_errors_reach_the_user(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(m, kw):
        raise FrappeError('{"exc_type": "ValidationError", "exception": "frappe.exceptions.ValidationError: Accept the confidentiality undertaking to sign."}')

    _frappe(monkeypatch, boom)
    resp = await client.post(
        "/api/hr/me/declaration",
        json={"nothing_else": True, "confidentiality_accepted": False, "signed_name": "Thandi Mamba", "confirm": True},
    )
    assert 400 <= resp.status_code < 500
    assert "confidentiality" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_and_remind(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def h(m, kw):
        if m.endswith(".register"):
            return {"year": 2026, "year_label": "2026/27", "total": 3, "signed": 1, "outstanding": [
                {"employee": "EMP-61", "employee_name": "Lindiwe Simelane", "department": "Field Operations", "designation": "Auditor", "has_login": True}]}
        return {"created": 2, "without_login": 1, "outstanding": 3}

    calls = _frappe(monkeypatch, h)
    reg = (await client.get("/api/hr/impartiality")).json()
    assert (reg["signed"], reg["total"], reg["outstanding"][0]["employee_name"]) == (1, 3, "Lindiwe Simelane")
    assert (await client.post("/api/hr/impartiality/remind", json={"confirm": False})).status_code == 400
    res = (await client.post("/api/hr/impartiality/remind", json={"confirm": True})).json()
    assert res == {"created": 2, "without_login": 1, "outstanding": 3}
    assert [c[0] for c in calls] == ["eswasa_hr.declarations.register", "eswasa_hr.declarations.remind"]
