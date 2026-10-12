"""Establishment (J11; H3, H3a, H3b) — passes through to eswasa_hr.establishment."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

COUNTS = {"approved": 6, "frozen": 1, "filled": 3, "in_recruitment": 1, "vacant": 1}
CHANGE = {"id": "EC-1", "department": "Certification", "designation": "Auditor", "change": "Add", "count": 1, "new_grade": None,
          "summary": "Add 1 Auditor post", "state": "Waiting for Executive Director", "council_required": True, "date": "2026-10-12"}
ESTABLISHMENT = {"departments": [{"department": "Certification", "head": {"id": "EMP-2", "name": "Sipho Dlamini"},
                                  "posts": [{"designation": "Auditor", **COUNTS}], **COUNTS, "unplanned": 0}],
                 "totals": COUNTS, "has_plans": True, "pending": [CHANGE], "can_request": True}
DEPARTMENT = {"department": "Certification", "parent": "All Departments", "head": None, "posts": [{"designation": "Auditor", "grade": "C1", **COUNTS}],
              "people": [{"id": "EMP-9", "name": "Thandi Nxumalo", "designation": "Auditor", "reports_to": "EMP-2"}],
              "cover_warnings": [{"skill": "ISO 9001 lead audit", "holders": 1}], "changes": [CHANGE], "can_request": True, "can_set_head": True}
DETAIL = {**CHANGE, "reason": "New scheme", "cost_note": None, "current_grade": None, "before": {"approved": 6, "frozen": 1}, "prepared_by": "hr@x",
          "ed_decision_by": None, "council_reference": None, "decision_note": None, "deciders": [{"user": "ed@x", "name": "Executive Director"}],
          "track": [{"title": "Asked", "state": "done"}, {"title": "Executive Director", "state": "now"}]}


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
        return {"establishment": ESTABLISHMENT, "department": DEPARTMENT}.get(method.rsplit(".", 1)[1], DETAIL)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_establishment_and_department(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/establishment")
    assert r.json()["totals"]["vacant"] == 1
    assert r.json()["pending"][0]["summary"] == "Add 1 Auditor post"
    r = await client.get("/api/hr/establishment/departments/Certification")
    assert r.json()["cover_warnings"][0]["holders"] == 1
    assert calls == [("eswasa_hr.establishment.establishment", None), ("eswasa_hr.establishment.department", {"department": "Certification"})]


@pytest.mark.asyncio
async def test_request_needs_confirm_then_passes_through(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    body = {"department": "Certification", "designation": "Auditor", "change": "Add", "count": 1, "reason": "New scheme"}
    assert (await client.post("/api/hr/establishment/changes", json={**body, "confirm": False})).status_code == 400
    assert calls == []
    r = await client.post("/api/hr/establishment/changes", json={**body, "confirm": True})
    assert r.json()["deciders"][0]["user"] == "ed@x"
    assert calls == [("eswasa_hr.establishment.request_change", {**body, "new_grade": None, "cost_note": None, "confirm": 1})]


@pytest.mark.asyncio
async def test_change_detail(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/establishment/changes/EC-1")
    assert r.json()["track"][1]["state"] == "now"
    assert calls == [("eswasa_hr.establishment.change_detail", {"name": "EC-1"})]
