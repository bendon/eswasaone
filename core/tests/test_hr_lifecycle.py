"""Lifecycle (J8, J9) — promotion, transfer, separation, changes, offboarding pass through to eswasa_hr."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

CHANGES = {"employee": "EMP-66", "employee_name": "Phindile Motsa", "status": "Active", "items": [
    {"id": "HR-EMP-PRO-1", "kind": "promotion", "date": "2026-11-01", "state": "Waiting for approval",
     "changes": [{"property": "Designation", "current": "Standards Officer", "new": "Senior Standards Officer"}]}]}


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
async def test_writes_need_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: CHANGES)
    for path, body in [
        ("promotion", {"effective": "2026-11-01", "designation": "Senior Standards Officer"}),
        ("transfer", {"effective": "2026-11-01", "department": "Certification"}),
        ("separation", {"reason": "Resignation", "last_day": "2026-10-31", "activities": [{"activity_name": "Exit interview", "user": "hr@x"}]}),
    ]:
        assert (await client.post(f"/api/hr/employees/EMP-66/{path}", json={**body, "confirm": False})).status_code == 400
    assert calls == []


@pytest.mark.asyncio
async def test_promotion_and_changes(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: CHANGES)
    r = await client.post("/api/hr/employees/EMP-66/promotion", json={"effective": "2026-11-01", "designation": "Senior Standards Officer", "grade": "C", "confirm": True})
    assert r.json()["items"][0]["state"] == "Waiting for approval"
    assert calls[0] == ("eswasa_hr.lifecycle.promote", {"employee": "EMP-66", "effective": "2026-11-01", "designation": "Senior Standards Officer",
                                                        "grade": "C", "reports_to": None, "revised_ctc": None, "note": None, "confirm": 1})
    assert (await client.get("/api/hr/employees/EMP-66/changes")).json()["employee_name"] == "Phindile Motsa"


@pytest.mark.asyncio
async def test_separation_and_offboarding(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def h(m: str) -> Any:
        if m.endswith(".separation_defaults"):
            return {"employee": "EMP-19", "employee_name": "Mandla Zwane", "reasons": ["Resignation"], "activities": [{"activity_name": "Exit interview", "group": "HR", "user": "hr@x"}]}
        if m.endswith(".offboarding"):
            return {"id": "HR-EMP-SEP-1", "kind": "offboarding", "employee_name": "Mandla Zwane", "last_day": "2026-10-31", "reason": "Resignation", "done": 2, "total": 5, "activities": []}
        return {**CHANGES, "employee": "EMP-19", "employee_name": "Mandla Zwane"}

    calls = _frappe(monkeypatch, h)
    d = (await client.get("/api/hr/employees/EMP-19/separation-defaults")).json()
    assert d["activities"][0]["activity_name"] == "Exit interview"
    r = await client.post("/api/hr/employees/EMP-19/separation", json={"reason": "Resignation", "last_day": "2026-10-31", "notice_date": "2026-09-30",
                                                                      "activities": [{"activity_name": "Exit interview", "user": "hr@x"}], "confirm": True})
    assert r.status_code == 200
    assert calls[1][1]["activities"] == [{"activity_name": "Exit interview", "user": "hr@x"}]
    o = (await client.get("/api/hr/offboarding/HR-EMP-SEP-1")).json()
    assert (o["kind"], o["last_day"], o["reason"]) == ("offboarding", "2026-10-31", "Resignation")


@pytest.mark.asyncio
async def test_rule_errors_reach_the_user(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(m: str) -> Any:
        raise FrappeError('{"exc_type": "ValidationError", "exception": "frappe.exceptions.ValidationError: Nothing changes. Choose at least one new value."}')

    _frappe(monkeypatch, boom)
    r = await client.post("/api/hr/employees/EMP-66/promotion", json={"effective": "2026-11-01", "confirm": True})
    assert 400 <= r.status_code < 500 and "Nothing changes" in r.json()["detail"]
