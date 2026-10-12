"""Expense claims plan 05 — /hr/expense-claims and /hr/me/expense-claims pass through to eswasa_hr.expenses."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

ROW = {"id": "HR-EXP-0001", "employee": "HR-EMP-0044", "employee_name": "Thandi Mamba", "department": "Certification",
       "posting_date": "2026-10-16", "total": 320.0, "sanctioned": None, "currency": None, "approval_status": "Draft",
       "status": "Waiting for approval", "approver": "sipho@x", "sla_date": "2026-10-21", "overdue": False}
LINE = {"expense_type": "Travel", "expense_date": "2026-10-12", "amount": 120.0, "receipt": "taxi.pdf"}


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


def _frappe(monkeypatch: pytest.MonkeyPatch, handler, up: bool = True) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _health(self: FrappeClient) -> bool:
        return up

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        out = handler(method)
        if isinstance(out, Exception):
            raise out
        return out

    monkeypatch.setattr(FrappeClient, "health", _health)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


def _thrown(kind: str, message: str) -> FrappeError:
    return FrappeError(f'Frappe GET /api/method/x failed: {{"exception": "frappe.exceptions.{kind}: {message}"}}', status_code=403)


@pytest.mark.asyncio
async def test_list_is_live_and_keeps_the_items_envelope(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: [ROW])
    r = await client.get("/api/hr/expense-claims", params={"status": "Draft"})
    assert r.status_code == 200, r.text
    assert r.json()["items"][0]["id"] == "HR-EXP-0001"
    assert calls == [("eswasa_hr.expenses.claims", {"status": "Draft"})]


@pytest.mark.asyncio
async def test_mine_and_detail(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    detail = {**ROW, "description": "Site visit", "lines": [LINE], "attachments": [{"id": "F-1", "file_name": "taxi.pdf", "url": "https://m/x"}]}
    calls = _frappe(monkeypatch, lambda m: [ROW] if m.endswith(".mine") else detail)
    assert (await client.get("/api/hr/me/expense-claims")).json()["items"][0]["status"] == "Waiting for approval"
    r = await client.get("/api/hr/expense-claims/HR-EXP-0001")
    assert r.status_code == 200, r.text
    assert r.json()["lines"][0]["receipt"] == "taxi.pdf"
    assert calls[1] == ("eswasa_hr.expenses.detail", {"name": "HR-EXP-0001"})


@pytest.mark.asyncio
async def test_someone_elses_claim_is_refused(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: _thrown("PermissionError", "You can only see your own expense claims and the ones you approve."))
    r = await client.get("/api/hr/expense-claims/HR-EXP-0009")
    assert r.status_code == 403
    assert "your own expense claims" in r.json()["detail"]


@pytest.mark.asyncio
async def test_submit_needs_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {"ok": True})
    r = await client.post("/api/hr/me/expense-claims", json={"lines": [LINE]}, headers={"X-CSRF-Token": "csrf"})
    assert r.status_code == 400
    assert calls == []


@pytest.mark.asyncio
async def test_submit_passes_lines_and_absolute_receipts(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {"ok": True, "name": "HR-EXP-0002", "status": "Waiting for approval", "approver": "sipho@x"})
    body = {"lines": [LINE], "description": "Site visit", "attachments": [{"file_name": "taxi.pdf", "url": "/api/media/hr/taxi.pdf"}], "confirm": True}
    r = await client.post("/api/hr/me/expense-claims", json=body, headers={"X-CSRF-Token": "csrf"})
    assert r.status_code == 200, r.text
    method, sent = calls[0]
    assert method == "eswasa_hr.expenses.submit"
    assert sent["lines"] == [LINE] and sent["confirm"] is True
    assert sent["attachments"] == [{"file_name": "taxi.pdf", "url": "http://test/api/media/hr/taxi.pdf"}]


@pytest.mark.asyncio
async def test_rule_breaks_come_back_as_422(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    err = FrappeError('Frappe POST /api/method/x failed: {"exception": "frappe.exceptions.ValidationError: Line 1: attach the receipt for this expense."}', status_code=417)
    _frappe(monkeypatch, lambda m: err)
    r = await client.post("/api/hr/me/expense-claims", json={"lines": [LINE], "confirm": True}, headers={"X-CSRF-Token": "csrf"})
    assert r.status_code == 422
    assert "receipt" in r.json()["detail"]


@pytest.mark.asyncio
async def test_503_when_frappe_is_down(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: [ROW], up=False)
    assert (await client.get("/api/hr/expense-claims")).status_code == 503
    assert (await client.get("/api/hr/me/expense-claims")).status_code == 503
