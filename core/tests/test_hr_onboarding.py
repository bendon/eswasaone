"""Onboarding (H7, E10) — /hr/onboarding/* and /hr/me/onboarding pass through to eswasa_hr."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

ONB = {"id": "HR-EMP-ONB-1", "employee": "HR-EMP-87", "employee_name": "Ayanda Mthethwa", "designation": "Certification Officer",
       "date_of_joining": "2026-12-01", "boarding_status": "In Process", "done": 3, "total": 9,
       "activities": [{"activity_name": "Laptop and access card", "user": "ict@x", "user_name": "Mxolisi Bhembe", "task": "TASK-1", "status": "Open", "mine": False}]}


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
async def test_list_detail_defaults(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def h(m: str) -> Any:
        if m.endswith(".onboardings"):
            return [{k: v for k, v in ONB.items() if k != "activities"}]
        if m.endswith(".defaults"):
            return {"employee": "HR-EMP-87", "employee_name": "Ayanda Mthethwa", "has_login": True, "job_offer": "HR-OFF-1",
                    "activities": [{"activity_name": "Contract signed and filed", "group": "HR", "user": "hr@x"}]}
        return ONB

    calls = _frappe(monkeypatch, h)
    assert (await client.get("/api/hr/onboarding")).json()["items"][0]["done"] == 3
    d = (await client.get("/api/hr/onboarding/defaults?employee=HR-EMP-87")).json()
    assert d["activities"][0]["group"] == "HR"
    assert (await client.get("/api/hr/onboarding/HR-EMP-ONB-1")).json()["activities"][0]["user_name"] == "Mxolisi Bhembe"
    assert [c[0].rsplit(".", 1)[1] for c in calls] == ["onboardings", "defaults", "detail"]


@pytest.mark.asyncio
async def test_start_and_done_need_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: ONB if m.endswith(".start") else {"task": "TASK-1", "status": "Completed"})
    body = {"employee": "HR-EMP-87", "activities": [{"activity_name": "Laptop and access card", "user": "ict@x"}]}
    assert (await client.post("/api/hr/onboarding", json={**body, "confirm": False})).status_code == 400
    assert (await client.post("/api/hr/onboarding/tasks/TASK-1/done", json={"confirm": False})).status_code == 400
    assert calls == []
    assert (await client.post("/api/hr/onboarding", json={**body, "confirm": True})).status_code == 201
    assert calls[0][1]["activities"] == [{"activity_name": "Laptop and access card", "user": "ict@x"}]
    assert (await client.post("/api/hr/onboarding/tasks/TASK-1/done", json={"confirm": True})).json()["status"] == "Completed"


@pytest.mark.asyncio
async def test_start_rule_reaches_the_user(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(m: str) -> Any:
        raise FrappeError('{"exc_type": "ValidationError", "exception": "frappe.exceptions.ValidationError: Choose who does \\u201cLaptop and access card\\u201d."}')

    _frappe(monkeypatch, boom)
    resp = await client.post("/api/hr/onboarding", json={"employee": "HR-EMP-87", "activities": [{"activity_name": "Laptop and access card"}], "confirm": True})
    assert 400 <= resp.status_code < 500 and "Choose who does" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_my_onboarding(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: {**ONB, "line_manager": "Sipho Magagula"})
    assert (await client.get("/api/hr/me/onboarding")).json()["onboarding"]["line_manager"] == "Sipho Magagula"
    _frappe(monkeypatch, lambda m: None)
    assert (await client.get("/api/hr/me/onboarding")).json() == {"onboarding": None}
