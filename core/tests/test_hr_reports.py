"""HR reports and export (HR additions plan 07) — pass through to eswasa_hr.hr_reports."""

from __future__ import annotations

import base64
import json
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.gateway import router as router_module
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

COLUMNS = [{"key": "employee", "label": "Employee ID", "type": "text"}, {"key": "employee_name", "label": "Name", "type": "text"}]
META = {"id": "staff-list", "title": "Staff list", "description": "Everyone", "group": "People", "team_scoped": True, "names": True, "scope": "all",
        "columns": COLUMNS, "filters": [{"key": "department", "label": "Department", "type": "department", "default": None, "options": ["ICT"]}]}
CATALOGUE = {"items": [META], "groups": ["People"]}
RESULT = {**META, "applied": {"department": "ICT", "status": "Active"}, "rows": [{"employee": "E2", "employee_name": "Ben Report"}], "total": 1,
          "truncated": False, "summary": [], "note": None}
CSV = "﻿Employee ID,Name\r\nE2,Ben Report\r\n".encode()


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


def _frappe(monkeypatch: pytest.MonkeyPatch, fail: Exception | None = None, fmt: str = "csv") -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        if fail:
            raise fail
        export = {"file_name": f"eswasa-hr-staff-list-2026-10-16.{fmt}", "content": base64.b64encode(CSV if fmt == "csv" else b"PK\x03\x04").decode(),
                  "rows": 1, "log": "HAL-1"}
        return {"catalogue": CATALOGUE, "run": RESULT, "export": export}[method.rsplit(".", 1)[-1]]

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


def _audit(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    seen: list[dict[str, Any]] = []
    monkeypatch.setattr(router_module, "audit_log", lambda **kw: seen.append(kw))
    return seen


@pytest.mark.asyncio
async def test_catalogue_passes_team(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/reports?team=1")
    assert r.status_code == 200
    assert r.json()["items"][0]["id"] == "staff-list"
    assert calls == [("eswasa_hr.hr_reports.catalogue", {"team": 1})]


@pytest.mark.asyncio
async def test_run_sends_query_params_as_filters(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/reports/staff-list?department=ICT&status=")
    assert r.status_code == 200
    assert r.json()["rows"][0]["employee_name"] == "Ben Report"
    method, params = calls[0]
    assert method == "eswasa_hr.hr_reports.run"
    assert params["report"] == "staff-list"
    assert json.loads(params["filters"]) == {"department": "ICT"}


@pytest.mark.asyncio
async def test_export_csv_is_an_audited_attachment(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    audit = _audit(monkeypatch)
    body = {"format": "csv", "filters": {"department": "ICT"}, "reason": "Board staff audit 2026", "confirm": True}
    r = await client.post("/api/hr/reports/staff-list/export", json=body)
    assert r.status_code == 200
    assert r.headers["content-type"] == "text/csv; charset=utf-8"
    assert r.headers["content-disposition"] == 'attachment; filename="eswasa-hr-staff-list-2026-10-16.csv"'
    assert r.headers["cache-control"] == "no-store"
    assert r.content == CSV
    assert calls == [("eswasa_hr.hr_reports.export", {"report": "staff-list", "filters": {"department": "ICT"}, "format": "csv",
                                                      "confirm": 1, "reason": "Board staff audit 2026"})]
    assert audit[0]["action"] == "hr.report.export"
    assert audit[0]["resource"] == "HR Report:staff-list"
    assert audit[0]["detail"]["reason"] is True  # whether one was given; the text itself is in the HR Access Log


@pytest.mark.asyncio
async def test_export_xlsx_content_type(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, fmt="xlsx")
    _audit(monkeypatch)
    r = await client.post("/api/hr/reports/disciplinary/export", json={"format": "xlsx", "confirm": True})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert r.headers["content-disposition"].startswith("attachment; ")


@pytest.mark.asyncio
async def test_export_needs_confirm_and_a_known_format(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    audit = _audit(monkeypatch)
    r = await client.post("/api/hr/reports/staff-list/export", json={"format": "csv"})
    assert r.status_code == 400
    r = await client.post("/api/hr/reports/staff-list/export", json={"format": "pdf", "confirm": True})
    assert r.status_code == 422
    assert calls == [] and audit == []


@pytest.mark.asyncio
async def test_refusals_are_403(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, fail=FrappeError("frappe.exceptions.PermissionError: You can't run this report.", status_code=403))
    _audit(monkeypatch)
    assert (await client.get("/api/hr/reports/leave-owed")).status_code == 403
    assert (await client.get("/api/hr/reports")).status_code == 403
    r = await client.post("/api/hr/reports/disciplinary/export", json={"format": "csv", "confirm": True})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_missing_reason_is_422(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    msg = "This export names people. Say why you need it (at least 10 characters). It is recorded."
    _frappe(monkeypatch, fail=FrappeError(f'Frappe POST /api/method/x failed: {{"exception": "frappe.exceptions.ValidationError: {msg}"}}', status_code=417))
    _audit(monkeypatch)
    r = await client.post("/api/hr/reports/staff-list/export", json={"format": "csv", "confirm": True})
    assert r.status_code == 422
    assert "names people" in r.text
