"""Issued items and offboarding clearance (HR additions plan 02) — pass through to eswasa_hr.issued_items."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

ITEM = {"name": "HRI-2026-00001", "employee": "EMP-7", "employee_name": "Gcina Mavuso", "department": "ICT", "item_type": "Laptop",
        "tag": "DL-1", "issued_on": "2026-10-13", "issued_by": "hr@x", "return_due": "2026-10-01", "status": "Issued", "overdue": True}
REGISTER = {"items": [ITEM], "types": ["Laptop"], "out": 1, "overdue": 1}
PERSON = {"employee": "EMP-7", "employee_name": "Gcina Mavuso", "items": [ITEM], "types": ["Laptop"], "can_issue": True, "can_return": True, "can_write_off": False}
MINE = {"employee": "EMP-7", "items": [ITEM], "waiting": 1}
OFFBOARDING = {"id": "HR-EMP-SEP-1", "kind": "offboarding", "employee": "EMP-7", "employee_name": "Gcina Mavuso", "done": 0, "total": 1,
               "activities": [{"activity_name": "Return issued items (1)", "status": "Open", "blocked": "1 item is still out: Laptop DL-1."}],
               "items_out": [ITEM]}


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
        return {
            "register": REGISTER, "item_types": {"types": [], "awaiting": "A2"}, "my_items": MINE, "acknowledge": MINE, "offboarding": OFFBOARDING,
        }.get(method.rsplit(".", 1)[-1], PERSON)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_register_passes_filters(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/items", params={"status": "out", "item_type": "Laptop", "overdue": "true"})
    assert r.json()["items"][0]["overdue"] is True
    assert calls == [("eswasa_hr.issued_items.register", {"status": "out", "item_type": "Laptop", "overdue": 1})]


@pytest.mark.asyncio
async def test_types_awaiting_eswasa(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch)
    assert (await client.get("/api/hr/items/types")).json() == {"types": [], "awaiting": "A2"}


@pytest.mark.asyncio
async def test_issue_needs_confirm_then_passes_through(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    body = {"item_type": "Laptop", "tag": "DL-1", "return_due": "2026-12-31"}
    assert (await client.post("/api/hr/employees/EMP-7/items", json={**body, "confirm": False})).status_code == 400
    assert calls == []
    r = await client.post("/api/hr/employees/EMP-7/items", json={**body, "confirm": True})
    assert r.json()["can_issue"] is True
    assert calls == [("eswasa_hr.issued_items.issue", {"employee": "EMP-7", "item_type": "Laptop", "description": None, "tag": "DL-1",
                                                       "condition_out": None, "return_due": "2026-12-31", "asset": None, "confirm": 1})]


@pytest.mark.asyncio
async def test_issue_refusal_is_a_422_with_the_plain_message(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.gateway import router as gw

    def _raise(exc: Any) -> None:
        raise HTTPException(status_code=400, detail="Add item types in HR setup first (awaiting ESWASA A2).")

    monkeypatch.setattr(gw, "_raise_from_frappe", _raise)
    from app.frappe_client import FrappeError

    _frappe(monkeypatch, fail=FrappeError("ValidationError"))
    r = await client.post("/api/hr/employees/EMP-7/items", json={"item_type": "Laptop", "confirm": True})
    assert r.status_code == 422
    assert "awaiting ESWASA A2" in r.json()["detail"]


@pytest.mark.asyncio
async def test_return_and_write_off(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    assert (await client.post("/api/hr/items/HRI-2026-00001/return", json={"confirm": False})).status_code == 400
    assert (await client.post("/api/hr/items/HRI-2026-00001/return", json={"outcome": "Gone", "confirm": True})).status_code == 422
    r = await client.post("/api/hr/items/HRI-2026-00001/return", json={"outcome": "Lost", "note": "Stolen", "confirm": True})
    assert r.status_code == 200
    assert calls == [("eswasa_hr.issued_items.return_item", {"name": "HRI-2026-00001", "outcome": "Lost", "condition_in": None, "note": "Stolen", "confirm": 1})]


@pytest.mark.asyncio
async def test_person_items_and_my_items(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    assert (await client.get("/api/hr/employees/EMP-7/items")).json()["items"][0]["tag"] == "DL-1"
    assert (await client.get("/api/hr/me/items")).json()["waiting"] == 1
    assert (await client.post("/api/hr/me/items/HRI-2026-00001/acknowledge", json={"confirm": False})).status_code == 400
    assert (await client.post("/api/hr/me/items/HRI-2026-00001/acknowledge", json={"confirm": True})).status_code == 200
    assert [c[0].rsplit(".", 1)[-1] for c in calls] == ["employee_items", "my_items", "acknowledge"]
    assert calls[-1][1] == {"name": "HRI-2026-00001", "confirm": 1}


@pytest.mark.asyncio
async def test_offboarding_carries_items_out_and_why_blocked(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch)
    o = (await client.get("/api/hr/offboarding/HR-EMP-SEP-1")).json()
    assert o["items_out"][0]["name"] == "HRI-2026-00001"
    assert o["activities"][0]["blocked"].startswith("1 item is still out")


@pytest.mark.asyncio
async def test_permission_error_from_frappe_is_403(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.frappe_client import FrappeError

    _frappe(monkeypatch, fail=FrappeError("frappe.exceptions.PermissionError: You can't see this person's items.", status_code=403))
    assert (await client.get("/api/hr/employees/EMP-7/items")).status_code == 403
