"""My HR (E1) and leave preview (E2) — GET /hr/me, POST /hr/leave/preview with a mocked FrappeClient."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

EMP = {
    "name": "HR-EMP-0044",
    "employee_name": "Thandi Mamba",
    "department": "Certification",
    "designation": "Lead Auditor",
    "status": "Active",
    "date_of_joining": "2021-01-11",
    "user_id": "thandi@eswasa.co.sz",
    "reports_to": "HR-EMP-0031",
    "leave_approver": "sipho@eswasa.co.sz",
}
DETAILS = {
    "leave_allocation": {
        "Annual Leave": {"total_leaves": 21, "leaves_taken": 9, "remaining_leaves": 12},
        "Sick Leave": {"total_leaves": 14, "leaves_taken": 2, "remaining_leaves": 12},
    },
    "leave_approver": "sipho@eswasa.co.sz",
}


def _ctx() -> AuthContext:
    return AuthContext(
        token="t",
        user=SessionUser(
            username="thandi@eswasa.co.sz",
            full_name="Thandi Mamba",
            email="thandi@eswasa.co.sz",
            roles=["ESWASA Staff", "Employee"],
        ),
        frappe_sid="sid",
        mock=False,
        is_guest=False,
        csrf_token="csrf",
    )


def _fake_frappe(monkeypatch: pytest.MonkeyPatch, *, linked: bool = True, days: Any = 5, visits=None):
    calls: list[tuple[str, dict]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kwargs: Any) -> Any:
        payload = kwargs.get("json") or {}
        calls.append((method, payload))
        if method == "frappe.client.get_list":
            dt = payload["doctype"]
            if dt == "Employee":
                if payload.get("filters", {}).get("user_id"):
                    return [EMP] if linked else []
                return [{"employee_name": "Sipho Magagula"}]
            if dt == "User":
                return [{"full_name": "Sipho Magagula"}]
            if dt == "Leave Application":
                return [{"name": "HR-LAP-001", "employee_name": "Thandi Mamba", "leave_type": "Annual Leave",
                         "from_date": "2026-08-10", "to_date": "2026-08-14", "status": "Approved"}]
            if dt == "Field Visit":
                return visits or []
            raise AssertionError(dt)
        if method.endswith(".get_leave_details"):
            return DETAILS
        if method.endswith(".get_number_of_leave_days"):
            if isinstance(days, Exception):
                raise days
            return days
        if method == "eswasa_hr.leave.certificate_rule":  # plan 08: threshold for the type (H14)
            return {"certificate_required": payload.get("leave_type") == "Sick Leave", "certificate_after_days": 2 if payload.get("leave_type") == "Sick Leave" else None}
        raise AssertionError(method)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx
    app.dependency_overrides[require_auth_csrf] = _ctx
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_me_and_preview_require_auth() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        assert (await ac.get("/api/hr/me")).status_code == 401
        resp = await ac.post(
            "/api/hr/leave/preview",
            json={"leave_type": "Annual Leave", "from_date": "2026-11-02", "to_date": "2026-11-06"},
        )
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_unlinked(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_frappe(monkeypatch, linked=False)
    resp = await client.get("/api/hr/me")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "linked": False, "employee": None, "line_manager": None,
        "leave_approver": None, "balances": [], "leave": [],
    }


@pytest.mark.asyncio
async def test_me_linked(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_frappe(monkeypatch)
    body = (await client.get("/api/hr/me")).json()
    assert body["linked"] is True
    assert body["employee"]["employee_name"] == "Thandi Mamba"
    assert body["line_manager"] == "Sipho Magagula"
    assert body["leave_approver"] == {"user": "sipho@eswasa.co.sz", "name": "Sipho Magagula"}
    annual = next(b for b in body["balances"] if b["leave_type"] == "Annual Leave")
    assert (annual["allocated"], annual["used"], annual["balance"]) == (21, 9, 12)
    assert body["leave"][0]["status"] == "Approved"


@pytest.mark.asyncio
async def test_preview_balance_after_and_conflicts(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _fake_frappe(
        monkeypatch,
        visits=[{"name": "FV-0091", "title": "Surveillance audit, ISO 22000", "planned_date": "2026-11-04"}],
    )
    resp = await client.post(
        "/api/hr/leave/preview",
        json={"leave_type": "Annual Leave", "from_date": "2026-11-02", "to_date": "2026-11-06"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["days"] == 5 and body["balance"] == 12 and body["balance_after"] == 7
    assert body["approver"]["name"] == "Sipho Magagula"
    assert body["conflicts"] == [
        {"id": "FV-0091", "title": "Surveillance audit, ISO 22000", "date": "2026-11-04", "kind": "Field visit"}
    ]
    assert body["warnings"] == []
    assert (body["certificate_required"], body["certificate_after_days"]) == (False, None)
    visit_query = next(p for m, p in calls if m == "frappe.client.get_list" and p["doctype"] == "Field Visit")
    assert ["lead_auditor", "=", "thandi@eswasa.co.sz"] in visit_query["filters"]
    # Preview never writes.
    assert not any(m in ("frappe.client.insert", "frappe.client.set_value") for m, _ in calls)


@pytest.mark.asyncio
async def test_preview_never_guesses_days_when_hrms_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # HRMS's own count (holidays, half days, leave-type rules) or an error; never a Monday-to-Friday guess.
    _fake_frappe(monkeypatch, days=FrappeError("not whitelisted"))
    resp = await client.post(
        "/api/hr/leave/preview",
        json={"leave_type": "Annual Leave", "from_date": "2026-11-02", "to_date": "2026-11-20"},
    )
    assert resp.status_code >= 400
    assert "days" not in resp.json()


@pytest.mark.asyncio
async def test_preview_rejects_bad_dates(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_frappe(monkeypatch)
    bad = await client.post(
        "/api/hr/leave/preview", json={"leave_type": "Annual Leave", "from_date": "2026-11-06", "to_date": "2026-11-02"}
    )
    assert bad.status_code == 422
    assert "before the start" in bad.json()["detail"]


@pytest.mark.asyncio
async def test_preview_unlinked_is_409(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_frappe(monkeypatch, linked=False)
    resp = await client.post(
        "/api/hr/leave/preview", json={"leave_type": "Annual Leave", "from_date": "2026-11-02", "to_date": "2026-11-06"}
    )
    assert resp.status_code == 409
    assert "linked" in resp.json()["detail"]
