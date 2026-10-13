"""Bulk actions decided in Approvals (HR additions plan 06) — pass through to eswasa_hr.bulk_actions."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

ROWS = [{"employee": "EMP-7", "employee_name": "Gcina Mavuso", "planned": "4 days off, balance 10 → 6", "days": 4, "balance_after": 6, "problem": None},
        {"employee": "EMP-8", "employee_name": "Lindiwe Dlamini", "planned": "4 days off, balance 3 → -1", "days": 4, "problem": "Not enough balance (3 left)."}]
PARAMS = {"leave_type": "Annual Leave", "from_date": "2026-12-24", "to_date": "2027-01-01"}
PREVIEW = {"kind": "Office closure leave", "parameters": PARAMS, "selection": {"departments": ["ICT"]}, "selection_text": "Active staff in ICT",
           "rows": ROWS, "count": 2, "problems": 1}
ACTION = {"name": "HRB-2026-00001", "kind": "Office closure leave", "status": "Waiting", "parameters": PARAMS, "prepared_by": "hr@x", "people": 1,
          "deciders": ["hrm2@x"], "rows": ROWS[:1], "can_edit": False, "can_decide": False}
LIST = {"actions": [ACTION], "kinds": ["Office closure leave", "Leave allocation"], "waiting": 1}
OPTIONS = {"kinds": ["Office closure leave", "Leave allocation"], "leave_types": ["Annual Leave"], "departments": ["ICT"], "employment_types": ["Permanent"]}
REMIND = {"kind": "Unacknowledged items", "count": 2, "sent": 1, "skipped": 1}


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


def _frappe(monkeypatch: pytest.MonkeyPatch, fail: Exception | None = None) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        if fail:
            raise fail
        return {"preview": PREVIEW, "actions": LIST, "options": OPTIONS, "detail": ACTION, "create": ACTION, "retry": ACTION, "remind": REMIND}[method.rsplit(".", 1)[-1]]

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_preview_needs_no_confirm_and_passes_through(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.post("/api/hr/bulk/preview", json={"kind": "Office closure leave", "parameters": PARAMS, "selection": {"departments": ["ICT"]}})
    assert r.status_code == 200
    assert r.json()["rows"][1]["problem"].startswith("Not enough balance")
    method, sent = calls[0]
    assert method == "eswasa_hr.bulk_actions.preview"
    assert "confirm" not in sent  # the dry run is never a write
    assert sent["parameters"]["leave_type"] == "Annual Leave"
    assert sent["selection"] == {"departments": ["ICT"], "employment_types": [], "employees": []}


@pytest.mark.asyncio
async def test_bulk_termination_is_not_a_kind(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.post("/api/hr/bulk/preview", json={"kind": "Termination", "parameters": {}, "selection": {}})
    assert r.status_code == 422
    assert calls == []


@pytest.mark.asyncio
async def test_create_needs_confirm_and_sends_exclusions(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    body = {"kind": "Office closure leave", "parameters": PARAMS, "selection": {"departments": ["ICT"]}, "exclude": ["EMP-8"], "submit": True}
    assert (await client.post("/api/hr/bulk", json={**body, "confirm": False})).status_code == 400
    assert calls == []
    r = await client.post("/api/hr/bulk", json={**body, "confirm": True})
    assert r.status_code == 200
    assert r.json()["deciders"] == ["hrm2@x"]
    method, sent = calls[0]
    assert method == "eswasa_hr.bulk_actions.create"
    assert (sent["exclude"], sent["submit"], sent["confirm"]) == (["EMP-8"], 1, 1)
    assert "name" not in sent


@pytest.mark.asyncio
async def test_list_options_detail_and_retry(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    assert (await client.get("/api/hr/bulk", params={"status": "Waiting"})).json()["waiting"] == 1
    assert (await client.get("/api/hr/bulk/options")).json()["leave_types"] == ["Annual Leave"]
    assert (await client.get("/api/hr/bulk/HRB-2026-00001")).json()["rows"][0]["employee"] == "EMP-7"
    assert (await client.post("/api/hr/bulk/HRB-2026-00001/retry", json={"confirm": False})).status_code == 400
    assert (await client.post("/api/hr/bulk/HRB-2026-00001/retry", json={"confirm": True})).status_code == 200
    assert [c[0].rsplit(".", 1)[-1] for c in calls] == ["actions", "options", "detail", "retry"]
    assert calls[0][1] == {"status": "Waiting"}


@pytest.mark.asyncio
async def test_reminders_dry_run_then_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    body = {"kind": "Unacknowledged items", "selection": {"departments": ["ICT"]}}
    assert (await client.post("/api/hr/bulk/reminders", json={**body, "dry_run": True})).json()["count"] == 2
    assert calls[0][1]["dry_run"] == 1
    assert (await client.post("/api/hr/bulk/reminders", json=body)).status_code == 400
    r = await client.post("/api/hr/bulk/reminders", json={**body, "confirm": True})
    assert (r.json()["sent"], r.json()["skipped"]) == (1, 1)
    assert calls[1][1]["confirm"] == 1
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_permission_error_from_frappe_is_403(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.frappe_client import FrappeError

    _frappe(monkeypatch, fail=FrappeError("frappe.exceptions.PermissionError: Only HR can run bulk actions.", status_code=403))
    r = await client.post("/api/hr/bulk/preview", json={"kind": "Leave allocation", "parameters": {"use_policy": True}, "selection": {}})
    assert r.status_code == 403
