"""Module access requests (plan 02) — camelCase shape, confirm, requester from the session; rules live in eswasa_hr."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.gateway import wave1
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

ROW = {"id": "MAR-00001", "moduleId": "finance", "moduleLabel": "Finance", "requesterUsername": "ann@x", "requesterName": "Ann Dlamini",
       "requesterEmail": "ann@x", "note": "Need the ledger", "status": "pending", "createdAt": "2026-10-12T09:00:00"}


def _ctx() -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="ann@x", full_name="Ann", email="ann@x", roles=["ESWASA Staff"]),
                       frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx
    app.dependency_overrides[require_auth_csrf] = _ctx
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch, answer: Any = None) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        if isinstance(answer, Exception):
            raise answer
        return [ROW] if method.endswith(".list_requests") else (answer or ROW)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


def test_stubs_removed_from_wave1() -> None:
    assert "/hr/access-requests" not in {getattr(r, "path", "") for r in wave1.router.routes}


@pytest.mark.asyncio
async def test_list_is_camel_case_and_filters_pass_through(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/access-requests", params={"status": "pending", "module": "finance"})
    assert r.status_code == 200
    assert r.json()[0]["requesterUsername"] == "ann@x" and r.json()[0]["moduleId"] == "finance"
    assert calls == [("eswasa_hr.access_requests.list_requests", {"status": "pending", "module": "finance"})]
    calls.clear()
    await client.get("/api/hr/access-requests")
    assert calls == [("eswasa_hr.access_requests.list_requests", None)]


@pytest.mark.asyncio
async def test_submit_needs_confirm_and_takes_requester_from_session(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    body = {"moduleId": "finance", "moduleLabel": "Finance", "note": "Need the ledger", "requesterUsername": "boss@x"}
    assert (await client.post("/api/hr/access-requests", json=body)).status_code == 400
    assert calls == []
    r = await client.post("/api/hr/access-requests", json={**body, "confirm": True})
    assert r.status_code == 200 and r.json()["id"] == "MAR-00001"
    assert calls == [("eswasa_hr.access_requests.submit", {"module_id": "finance", "module_label": "Finance", "note": "Need the ledger", "confirm": 1})]


@pytest.mark.asyncio
async def test_review_passes_decision_and_note(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, {**ROW, "status": "rejected", "reviewedBy": "hr@x", "reviewNote": "Ask your manager"})
    body = {"decision": "rejected", "reviewNote": "Ask your manager"}
    assert (await client.patch("/api/hr/access-requests/MAR-00001", json=body)).status_code == 400
    r = await client.patch("/api/hr/access-requests/MAR-00001", json={**body, "confirm": True})
    assert r.json()["status"] == "rejected" and r.json()["reviewNote"] == "Ask your manager"
    assert calls == [("eswasa_hr.access_requests.review", {"name": "MAR-00001", "decision": "rejected", "note": "Ask your manager", "confirm": 1})]


@pytest.mark.asyncio
async def test_rule_breaks_are_422_and_four_eyes_is_403(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def thrown(kind: str, msg: str) -> FrappeError:
        return FrappeError(f'Frappe POST /api/method/x failed: {{"exception": "frappe.exceptions.{kind}: {msg}"}}', status_code=417)

    _frappe(monkeypatch, thrown("ValidationError", "Everyone can open My team."))
    r = await client.post("/api/hr/access-requests", json={"moduleId": "team", "confirm": True})
    assert r.status_code == 422 and "Everyone can open" in r.text
    _frappe(monkeypatch, thrown("PermissionError", "You can't review your own access request."))
    r = await client.patch("/api/hr/access-requests/MAR-00001", json={"decision": "approved", "confirm": True})
    assert r.status_code == 403 and "own access request" in r.text


@pytest.mark.asyncio
async def test_unset_optional_fields_are_left_out_like_the_mock(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch)
    r = await client.post("/api/hr/access-requests", json={"moduleId": "finance", "confirm": True})
    assert "reviewedAt" not in r.json() and "reviewNote" not in r.json()
