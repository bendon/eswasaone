"""Plan 09: /hr/import/* and /hr/setup/master-data pass through to eswasa_hr; confirm, file checks and roles in Core."""

from __future__ import annotations

import base64
import json
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

CSV = b"Staff number,First name\n1,Thandi\n"
RESULT = {"pass_no": 1, "rows": 1, "create": 1, "update": 0, "unchanged": 0, "errors": [], "warnings": [], "ok": True}


def _ctx(roles: list[str]):
    def ctx() -> AuthContext:
        return AuthContext(token="t", user=SessionUser(username="hr@x", full_name="HR", email="hr@x", roles=roles),
                           frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")

    return ctx


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx(["HR Manager"])
    app.dependency_overrides[require_auth_csrf] = _ctx(["HR Manager"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch, handler) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _health(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        return handler(method)

    monkeypatch.setattr(FrappeClient, "health", _health)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_dry_run_sends_the_file_and_writes_nothing(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: RESULT)
    r = await client.post("/api/hr/import/dry-run", data={"pass": "1"}, files={"file": ("staff.csv", CSV, "text/csv")})
    assert r.status_code == 200, r.text
    assert r.json()["create"] == 1
    assert [c[0] for c in calls] == ["eswasa_hr.employee_import.dry_run"]  # no write method is called
    sent = calls[0][1]
    assert (sent["pass_no"], sent["file"]["file_name"]) == (1, "staff.csv")
    assert base64.b64decode(sent["file"]["content"]) == CSV


@pytest.mark.asyncio
async def test_run_needs_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {"job_id": "HR-IMP-00001", "run": "HR-IMP-00001", "status": "Queued"})
    r = await client.post("/api/hr/import/run", data={"pass": "2"}, files={"file": ("links.csv", CSV, "text/csv")})
    assert r.status_code == 400
    assert calls == []
    r = await client.post("/api/hr/import/run", data={"pass": "2", "confirm": "true"}, files={"file": ("links.csv", CSV, "text/csv")})
    assert r.status_code == 202, r.text
    assert r.json()["job_id"] == "HR-IMP-00001"
    assert calls[0][0] == "eswasa_hr.employee_import.run" and calls[0][1]["confirm"] is True


@pytest.mark.asyncio
async def test_only_csv_or_xlsx(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: RESULT)
    r = await client.post("/api/hr/import/dry-run", data={"pass": "1"}, files={"file": ("staff.pdf", b"%PDF", "application/pdf")})
    assert r.status_code == 415
    assert calls == []


@pytest.mark.asyncio
async def test_template_is_an_xlsx_download(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: {"file_name": "eswasa-employee-import-pass-3.xlsx", "content": base64.b64encode(b"PK..").decode()})
    r = await client.get("/api/hr/import/template", params={"pass": 3})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert "pass-3.xlsx" in r.headers["content-disposition"]
    assert r.content == b"PK.."


@pytest.mark.asyncio
async def test_runs_list_and_detail(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    row = {"id": "HR-IMP-00001", "pass_no": 1, "status": "Failed", "rows": 2, "error_count": 1,
           "errors": [{"row": 3, "employee_number": "2", "field": "date_of_joining", "message": "bad"}]}
    calls = _frappe(monkeypatch, lambda m: [row] if m.endswith(".runs") else row)
    r = await client.get("/api/hr/import/runs", params={"pass": 1})
    assert r.json()["items"][0]["status"] == "Failed"
    assert calls[0][1] == {"pass_no": 1}
    r = await client.get("/api/hr/import/runs/HR-IMP-00001")
    assert r.json()["errors"][0]["row"] == 3


@pytest.mark.asyncio
async def test_master_data_is_system_manager_only_and_needs_confirm_to_load(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    out = {"dry_run": False, "counts": {"branches": {"created": 1}}, "missing_departments": [], "kept": [], "errors": [], "ok": True}
    calls = _frappe(monkeypatch, lambda m: out)
    body = json.dumps({"branches": [{"name": "A"}]}).encode()
    r = await client.post("/api/hr/setup/master-data", data={"dry_run": "false", "confirm": "true"}, files={"file": ("md.json", body, "application/json")})
    assert r.status_code == 403
    app.dependency_overrides[require_auth_csrf] = _ctx(["System Manager"])
    r = await client.post("/api/hr/setup/master-data", data={"dry_run": "false"}, files={"file": ("md.json", body, "application/json")})
    assert r.status_code == 400
    assert calls == []
    r = await client.post("/api/hr/setup/master-data", data={"dry_run": "false", "confirm": "true"}, files={"file": ("md.json", body, "application/json")})
    assert r.status_code == 200, r.text
    assert calls[0] == ("eswasa_hr.master_data_load.load_file", {"data": {"branches": [{"name": "A"}]}, "dry_run": False, "confirm": True})
    r = await client.post("/api/hr/setup/master-data", files={"file": ("md.json", b"not json", "application/json")})
    assert r.status_code == 422
