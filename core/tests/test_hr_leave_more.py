"""Leave plan 03 — /hr/leave/* pass through to eswasa_hr.leave; shapes LeaveView reads are kept."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

ROW = {"id": "HR-LAP-002", "employee": "EMP-44", "employee_name": "Thandi Mamba", "department": "Certification", "leave_type": "Annual",
       "from_date": "2026-11-02", "to_date": "2026-11-06", "days": 5.0, "status": "Open", "approver": "sipho@x",
       "approver_name": "Sipho", "sla_date": "2026-10-14", "overdue": True, "escalated": True}


def _ctx() -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="thandi@x", full_name="Thandi", email="thandi@x", roles=["Employee"]),
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
async def test_queue_keeps_the_leaveview_shape(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: [ROW])
    r = await client.get("/api/hr/leave", params={"status": "Open"})
    assert r.status_code == 200, r.text
    assert r.json()["items"] == [{"id": "HR-LAP-002", "employee": "Thandi Mamba", "leave_type": "Annual",
                                  "from_date": "2026-11-02", "to_date": "2026-11-06", "status": "Open"}]
    assert calls == [("eswasa_hr.leave.requests", {"status": "Open"})]


@pytest.mark.asyncio
async def test_requests_pass_filters_and_flags(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: [ROW])
    r = await client.get("/api/hr/leave/requests", params={"department": "Certification", "from": "2026-11-01", "to": "2026-11-30"})
    assert r.status_code == 200, r.text
    item = r.json()["items"][0]
    assert (item["sla_date"], item["overdue"], item["escalated"]) == ("2026-10-14", True, True)
    assert calls[0][1] == {"department": "Certification", "from_date": "2026-11-01", "to_date": "2026-11-30"}


@pytest.mark.asyncio
async def test_calendar(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    cal = {"start": "2026-11-01", "end": "2026-11-30", "people": [{"employee": "EMP-44", "employee_name": "Thandi"}],
           "entries": [{"employee": "EMP-44", "kind": "field", "label": "Audit", "from_date": "2026-11-10", "to_date": "2026-11-10", "approved": True, "style": "F"}]}
    calls = _frappe(monkeypatch, lambda m: cal)
    r = await client.get("/api/hr/leave/calendar", params={"start": "2026-11-01", "end": "2026-11-30"})
    assert r.status_code == 200, r.text
    assert r.json()["entries"][0]["style"] == "F"
    assert calls == [("eswasa_hr.leave.calendar", {"start": "2026-11-01", "end": "2026-11-30"})]


@pytest.mark.asyncio
async def test_calendar_range_error_is_400(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def h(m: str) -> Any:
        raise FrappeError("ValidationError: Choose a range of up to two months.", status_code=417)

    _frappe(monkeypatch, h)
    r = await client.get("/api/hr/leave/calendar", params={"start": "2026-11-01", "end": "2027-03-01"})
    assert r.status_code in (400, 422), r.text


@pytest.mark.asyncio
async def test_balances_keep_rows_and_add_optional_totals(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    body = {"employee": "EMP-44", "items": [{"leave_type": "Annual", "allocated": 21, "used": 4, "balance": 17, "pending": 0, "owed": 17, "above_carry_over": 12}],
            "owed": 17, "above_carry_over": 12, "awaiting": None}
    _frappe(monkeypatch, lambda m: body)
    r = await client.get("/api/hr/leave/balances")
    assert r.status_code == 200, r.text
    row = r.json()["items"][0]
    assert {k: row[k] for k in ("leave_type", "allocated", "used", "balance")} == {"leave_type": "Annual", "allocated": 21, "used": 4, "balance": 17}
    assert r.json()["above_carry_over"] == 12


@pytest.mark.asyncio
async def test_policy_awaiting(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: {"configured": False, "awaiting": "H14", "leave_period": None, "leave_types": []})
    r = await client.get("/api/hr/leave/policy")
    assert r.status_code == 200, r.text
    assert r.json()["awaiting"] == "H14"


@pytest.mark.asyncio
async def test_cancel_needs_confirm_and_goes_through_eswasa_hr(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {"ok": True, "name": "HR-LAP-002", "status": "Cancelled"})
    r = await client.post("/api/hr/leave/HR-LAP-002/cancel", json={"reason": "Plans changed", "confirm": False})
    assert r.status_code in (400, 422), r.text
    assert calls == []
    r = await client.post("/api/hr/leave/HR-LAP-002/cancel", json={"reason": "Plans changed", "confirm": True})
    assert r.status_code == 200, r.text
    assert calls == [("eswasa_hr.leave.cancel", {"name": "HR-LAP-002", "reason": "Plans changed", "confirm": True})]


@pytest.mark.asyncio
async def test_cancel_refusal_text_reaches_the_screen(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def h(m: str) -> Any:
        raise FrappeError("ValidationError: This leave has started, so it can't be cancelled here. Ask HR to adjust it.", status_code=417)

    _frappe(monkeypatch, h)
    r = await client.post("/api/hr/leave/HR-LAP-002/cancel", json={"reason": "Back early", "confirm": True})
    assert r.status_code == 422, r.text
    assert "has started" in r.text
