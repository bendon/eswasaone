"""Live Overview, HR setup and Board HR pack (H0, H14, H15) — pass through to eswasa_hr.overview."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_auth
from app.main import app
from app.schemas import SessionUser

OVERVIEW = {"as_of": "2026-10-12", "headcount": 86, "departments": 10,
            "establishment": {"has_plans": True, "totals": {"approved": 96, "frozen": 2, "filled": 86, "in_recruitment": 4, "vacant": 4},
                              "departments": [{"department": "Certification", "approved": 12, "filled": 10, "vacant": 1, "frozen": 1}]},
            "attention": [{"kind": "R-H2", "count": 2, "title": "2 contracts end within 60 days", "detail": None, "due": "2026-11-30", "href": "/hr/directory", "weight": 2}],
            "away_today": [{"employee": "EMP-9", "employee_name": "Thandi Nxumalo", "leave_type": "Annual Leave", "back_on": "2026-10-15"}],
            "movements": {"joiners": 3, "leavers": 1}, "turnover": {"joiners": 12, "leavers": 7, "pct": 8.4},
            "ending_soon": {"contracts": 2, "probations": 1}, "record_quality": [{"field": "reports_to", "label": "No line manager", "count": 1}], "cycles": []}
SETUP = {"steps": [{"id": "payroll", "title": "Payroll scope", "state": "excluded", "detail": "Excluded", "href": None, "awaiting": "H15, H16", "desk": False}],
         "done": 0, "total": 0, "pct": 0}
BOARD = {"as_of": "2026-10-12", "headcount": 86, "establishment": None, "turnover": {"joiners": 12, "leavers": 7, "pct": 8.4}, "appraisals": None,
         "competence": {"catalogue": 12, "at_risk": 2}, "cases": [{"kind": "grievance", "open": 2, "closed_this_year": 1, "avg_days_to_close": 34.0}],
         "declarations": {"signed": 80, "total": 86, "year": "2026/27"},
         "establishment_changes": [{"summary": "Add 2 Lead Auditor posts", "department": "Certification", "state": "Waiting for Council", "council_required": True}]}


def _ctx() -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="hrm@x", full_name="HR", email="hrm@x", roles=["HR Manager"]),
                       frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append(method)
        return {"overview": OVERVIEW, "setup_status": SETUP, "board_pack": BOARD}[method.rsplit(".", 1)[1]]

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_live_overview_setup_and_board(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    o = (await client.get("/api/hr/overview/live")).json()
    assert o["attention"][0]["href"] == "/hr/directory"
    assert o["turnover"]["pct"] == 8.4
    s = (await client.get("/api/hr/setup/status")).json()
    assert s["steps"][0]["state"] == "excluded"
    b = (await client.get("/api/hr/board-pack")).json()
    assert b["establishment_changes"][0]["state"] == "Waiting for Council"
    assert calls == ["eswasa_hr.overview.overview", "eswasa_hr.overview.setup_status", "eswasa_hr.overview.board_pack"]


@pytest.mark.asyncio
async def test_old_overview_removed_live_stays(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def _down(self: FrappeClient) -> bool:
        return False

    monkeypatch.setattr(FrappeClient, "health", _down)
    assert (await client.get("/api/hr/overview")).status_code == 404
    assert (await client.get("/api/hr/overview/live")).status_code == 503
