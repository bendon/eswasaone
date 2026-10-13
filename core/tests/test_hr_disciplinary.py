"""HR additions plan 01 — disciplinary code and warnings pass through to eswasa_hr.cases, which holds the guards."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

CODE = {"items": [{"code": "D01", "title": "Late coming", "level": "Minor", "suggested_sanction": "Verbal warning", "active": True}], "can_edit": True,
        "levels": ["Minor", "Serious", "Gross"], "sanctions": ["No action", "Verbal warning"], "warning_months": {"Verbal warning": None}}
WARNINGS = {"employee": "EMP-7", "items": [{"case": "HRC-2026-00005", "sanction": "Written warning", "offence": "D01", "offence_title": "Late coming",
                                             "issued_on": "2026-10-13", "expires_on": None, "status": "Active"}], "active": 1, "active_until": None}
CASE = {"id": "HRC-2026-00005", "kind": "disciplinary", "stage": "Outcome issued", "sanction": "Written warning", "warning_status": "Active",
        "offences": CODE["items"], "sanctions": ["No action", "Written warning"], "warning_months": {"Written warning": None}}


def _ctx_for(roles: list[str]):
    def _ctx() -> AuthContext:
        return AuthContext(token="t", user=SessionUser(username="u@x", full_name="U", email="u@x", roles=roles),
                           frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")

    return _ctx


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx_for(["HR Manager"])
    app.dependency_overrides[require_auth_csrf] = _ctx_for(["HR Manager"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch, *, editor: bool = True, reader: bool = True) -> list[tuple[str, Any]]:
    """``editor``/``reader`` stand in for eswasa_hr's guards (HR Manager edits the code; HR Manager or owner reads warnings)."""
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        name = method.rsplit(".", 1)[1]
        if name in ("create_offence", "update_offence") and not editor:
            raise FrappeError("frappe.exceptions.PermissionError: Only an HR Manager can change the disciplinary code.", 403)
        if name == "warnings" and not reader:
            raise FrappeError("frappe.exceptions.PermissionError: Only the HR Manager and the case owner can see warnings.", 403)
        return {"offences": CODE, "create_offence": CODE, "update_offence": CODE, "warnings": WARNINGS}.get(name, CASE)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_writes_need_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    assert (await client.post("/api/hr/disciplinary/offences", json={"code": "D02", "title": "x", "level": "Minor", "confirm": False})).status_code == 400
    assert (await client.patch("/api/hr/disciplinary/offences/D01", json={"active": False, "confirm": False})).status_code == 400
    assert calls == []


@pytest.mark.asyncio
async def test_offences_crud_passes_through(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    out = (await client.get("/api/hr/disciplinary/offences")).json()
    assert out["items"][0]["code"] == "D01" and out["warning_months"] == {"Verbal warning": None}
    await client.post("/api/hr/disciplinary/offences", json={"code": "D02", "title": "Insubordination", "level": "Serious", "suggested_sanction": "Written warning", "confirm": True})
    assert calls[-1] == ("eswasa_hr.cases.create_offence", {"code": "D02", "title": "Insubordination", "level": "Serious", "category": None,
                                                            "suggested_sanction": "Written warning", "description": None, "confirm": 1})
    await client.patch("/api/hr/disciplinary/offences/D01", json={"active": False, "confirm": True})
    assert calls[-1] == ("eswasa_hr.cases.update_offence", {"code": "D01", "changes": {"active": False}, "confirm": 1})


@pytest.mark.asyncio
async def test_hr_user_cannot_edit_the_code(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    app.dependency_overrides[require_auth_csrf] = _ctx_for(["HR User"])
    _frappe(monkeypatch, editor=False)
    r = await client.post("/api/hr/disciplinary/offences", json={"code": "D02", "title": "x", "level": "Minor", "confirm": True})
    assert r.status_code == 403
    assert (await client.patch("/api/hr/disciplinary/offences/D01", json={"title": "y", "confirm": True})).status_code == 403


@pytest.mark.asyncio
async def test_warnings_for_hr_manager_and_403_otherwise(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    out = (await client.get("/api/hr/employees/EMP-7/warnings")).json()
    assert out["items"][0]["status"] == "Active" and "allegation" not in str(out)
    assert calls[-1] == ("eswasa_hr.cases.warnings", {"employee": "EMP-7"})
    for roles in (["HR User"], ["Employee"]):  # HR User, and a line manager who doesn't own a case
        app.dependency_overrides[require_auth] = _ctx_for(roles)
        _frappe(monkeypatch, reader=False)
        assert (await client.get("/api/hr/employees/EMP-7/warnings")).status_code == 403


@pytest.mark.asyncio
async def test_act_passes_offence_and_sanction(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.post("/api/hr/cases/disciplinary/HRC-2026-00005/act",
                          json={"to_stage": "Outcome issued", "note": "Hearing held", "outcome": "Written warning issued", "offence": "D01", "sanction": "Written warning", "confirm": True})
    assert r.json()["warning_status"] == "Active" and r.json()["offences"][0]["code"] == "D01"
    method, body = calls[-1]
    assert method == "eswasa_hr.cases.act" and (body["offence"], body["sanction"], body["appeal_result"]) == ("D01", "Written warning", None)
    await client.post("/api/hr/cases/disciplinary/HRC-2026-00005/act", json={"to_stage": "Closed", "note": "Appeal heard", "appeal_result": "Overturned", "confirm": True})
    assert calls[-1][1]["appeal_result"] == "Overturned"
    await client.post("/api/hr/cases", json={"kind": "disciplinary", "employee": "EMP-7", "owner": "hrm@x", "description": "x", "offence": "D01", "confirm": True})
    assert calls[-1][1]["offence"] == "D01"
