"""My team (T1–T4) — /hr/team* pass through to eswasa_hr.team; job fields only."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

MEMBER = {"employee": "EMP-79", "employee_name": "Bongani Dlamini", "designation": "Certification Officer", "department": "Certification",
          "direct": True, "on_probation": True, "probation_review_due": "2026-10-31", "contract_ends": None, "away_today": None}


def _ctx() -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="sipho@x", full_name="Sipho", email="sipho@x", roles=["Employee"]),
                       frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")


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
        calls.append((method, kw.get("json") or kw.get("params")))
        return handler(method)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_team_calendar_member(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def h(m: str) -> Any:
        if m.endswith(".my_team"):
            return {"manager": "EMP-31", "members": [MEMBER], "summary": {"people": 1, "probation_reviews_due": 1}}
        if m.endswith(".calendar"):
            return {"from_date": "2026-11-02", "to_date": "2026-11-13", "people": [{"employee": "EMP-79", "employee_name": "Bongani Dlamini"}],
                    "entries": [{"employee": "EMP-79", "kind": "field", "label": "Surveillance audit", "from_date": "2026-11-04", "to_date": "2026-11-04"}]}
        return {**MEMBER, "line_manager": "Sipho Magagula", "balances": [{"leave_type": "Annual Leave", "allocated": 21, "used": 2, "balance": 19}], "authorisations": []}

    calls = _frappe(monkeypatch, h)
    t = (await client.get("/api/hr/team")).json()
    assert t["summary"]["probation_reviews_due"] == 1 and t["members"][0]["employee_name"] == "Bongani Dlamini"
    c = (await client.get("/api/hr/team/calendar?from_date=2026-11-02&to_date=2026-11-13")).json()
    assert c["entries"][0]["kind"] == "field"
    m = (await client.get("/api/hr/team/EMP-79")).json()
    assert m["balances"][0]["balance"] == 19
    assert "date_of_birth" not in m and "bank_ac_no" not in m
    assert [x[0].rsplit(".", 1)[1] for x in calls] == ["my_team", "calendar", "member"]


@pytest.mark.asyncio
async def test_probation_needs_confirm_and_passes_through(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {**MEMBER, "probation_review_due": None, "on_probation": False})
    body = {"outcome": "confirm", "summary": "Reliable document reviews; good with clients."}
    assert (await client.post("/api/hr/team/EMP-79/probation", json={**body, "confirm": False})).status_code == 400
    assert calls == []
    r = await client.post("/api/hr/team/EMP-79/probation", json={**body, "confirm": True})
    assert r.status_code == 200 and r.json()["on_probation"] is False
    assert calls[0] == ("eswasa_hr.team.probation_review", {"employee": "EMP-79", "outcome": "confirm", "summary": body["summary"], "extend_to": None, "confirm": 1})


@pytest.mark.asyncio
async def test_not_my_report_is_403(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def denied(m: str) -> Any:
        raise FrappeError('{"exc_type": "PermissionError", "exception": "frappe.exceptions.PermissionError: This person doesn\'t report to you."}')

    _frappe(monkeypatch, denied)
    assert (await client.get("/api/hr/team/EMP-99")).status_code == 403
