"""HR additions plans 04 and 08 — family and medical (level 3), dependant requests, the sick-leave certificate.

Everything passes through to eswasa_hr; the guards (who may see level 3, whose leave it is) live there.
"""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

FAMILY = {"employee": "EMP-9", "employee_name": "Thandi Nxumalo", "level": 3, "level_label": "Family and medical",
          "fields": [{"field": "custom_medical_aid_scheme", "label": "Medical aid scheme", "value": "Swazi Med"}],
          "tables": [{"label": "Dependants", "columns": ["Name", "Relationship"], "rows": [{"id": "D1", "Name": "Lwazi", "Relationship": "Child"}]}],
          "log": "LOG-2"}
CHANGE = {"id": "PCR-1", "kind": "dependant_add", "field": "custom_dependants", "field_label": "Dependants",
          "requested_value": "Add Lwazi (child)", "status": "Pending"}
LEAVE = {"name": "LA-1", "employee": "EMP-9", "employee_name": "Thandi Nxumalo", "leave_type": "Sick Leave",
         "from_date": "2026-11-02", "to_date": "2026-11-04", "status": "Open"}


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


def _frappe(monkeypatch: pytest.MonkeyPatch, deny: bool = False) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        if deny:
            raise FrappeError("frappe.exceptions.PermissionError: You can't open family and medical details. Only HR Managers can.", 403)
        if method.endswith("profile_changes.submit"):
            return CHANGE
        if method.endswith("leave.apply"):
            return LEAVE
        if method.endswith("leave.add_certificate"):
            return {"ok": True, "name": "LA-1", "has_certificate": True, "message": "Certificate sent. HR will check it."}
        return FAMILY

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_level_3_is_accepted_with_its_tables(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.post("/api/hr/employees/EMP-9/sensitive", json={"level": 3, "reason": "Medical aid claim query", "confirm": True})
    assert r.status_code == 200
    assert r.json()["tables"][0]["rows"][0]["Name"] == "Lwazi"
    assert calls == [("eswasa_hr.sensitive.view", {"employee": "EMP-9", "level": 3, "reason": "Medical aid claim query", "confirm": 1})]


@pytest.mark.asyncio
async def test_level_3_refused_to_hr_user(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, deny=True)
    r = await client.post("/api/hr/employees/EMP-9/sensitive", json={"level": 3, "reason": "Medical aid claim query", "confirm": True})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_my_family_details(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/me/sensitive?level=3")
    assert r.json()["level_label"] == "Family and medical"
    assert calls == [("eswasa_hr.sensitive.my_view", {"level": 3})]


@pytest.mark.asyncio
async def test_dependant_request_passes_the_row(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    body = {"kind": "dependant_add", "row": {"full_name": "Lwazi", "relationship": "Child"}, "shares": {"D1": 60},
            "reason": "New baby", "evidence": "https://media/birth.pdf"}
    assert (await client.post("/api/hr/me/profile-changes", json={**body, "confirm": False})).status_code == 400
    r = await client.post("/api/hr/me/profile-changes", json={**body, "confirm": True})
    assert r.json()["kind"] == "dependant_add"
    [(method, sent)] = calls
    assert method == "eswasa_hr.profile_changes.submit"
    assert (sent["kind"], sent["row"], sent["shares"], sent["evidence"]) == ("dependant_add", body["row"], {"D1": 60.0}, "https://media/birth.pdf")


@pytest.mark.asyncio
async def test_leave_passes_the_certificate(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    body = {"leave_type": "Sick Leave", "from_date": "2026-11-02", "to_date": "2026-11-04", "certificate": "/api/media/hr/evidence/c.pdf", "confirm": True}
    r = await client.post("/api/hr/leave", json=body)
    assert r.status_code == 201
    [(method, sent)] = calls
    assert method == "eswasa_hr.leave.apply"
    assert sent["certificate"] == "http://test/api/media/hr/evidence/c.pdf"


@pytest.mark.asyncio
async def test_late_certificate(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    url = "/api/hr/me/leave/LA-1/certificate"
    assert (await client.post(url, json={"certificate": "https://media/c.pdf", "confirm": False})).status_code == 400
    r = await client.post(url, json={"certificate": "https://media/c.pdf", "confirm": True})
    assert r.json()["has_certificate"] is True
    assert calls == [("eswasa_hr.leave.add_certificate", {"name": "LA-1", "certificate": "https://media/c.pdf", "confirm": True})]
