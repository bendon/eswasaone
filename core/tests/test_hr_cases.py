"""Cases (J10) — register, case page, steps, confidential concerns and Board counts pass through to eswasa_hr.cases."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

CASE = {"id": "HRC-2026-00005", "kind": "disciplinary", "stage": "Outcome issued", "stages": ["Opened", "Investigation", "Hearing scheduled", "Outcome issued", "Appeal", "Closed"],
        "next": ["Appeal", "Closed"], "owner": "hrm@x", "owner_name": "Nokuthula Shongwe", "people": [{"employee": "EMP-7", "employee_name": "Thandi Mamba", "role": "Subject of the case"}],
        "decided_by_name": "Nokuthula Shongwe", "notes": []}


def _ctx() -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="hrm@x", full_name="HR", email="hrm@x", roles=["HR Manager"]),
                       frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx
    app.dependency_overrides[require_auth_csrf] = _ctx
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        name = method.rsplit(".", 1)[1]
        return {
            "register": {"items": [{"id": "HRC-2026-00005", "kind": "disciplinary", "stage": "Hearing scheduled", "owner_name": "Nokuthula Shongwe"}], "can_open": True},
            "board": {"kinds": [{"kind": "grievance", "open": 1, "closed_this_year": 2, "avg_days_to_close": 12.5}]},
            "my_concerns": {"items": [], "categories": ["Working conditions"], "handlers": [{"user": "hrm@x", "name": "Nokuthula Shongwe"}]},
            "raise_concern": {"id": "HR-GRV-2026-0001", "raised_on": "2026-10-12", "status": "Open", "handled_by": "Nokuthula Shongwe"},
        }.get(name, CASE)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_writes_need_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    for path, body in [
        ("/api/hr/cases", {"kind": "disciplinary", "employee": "EMP-7", "owner": "hrm@x", "description": "x"}),
        ("/api/hr/cases/disciplinary/HRC-2026-00005/act", {"to_stage": "Appeal", "note": "x", "appeal_owner": "ed@x"}),
        ("/api/hr/cases/disciplinary/HRC-2026-00005/notes", {"text": "x"}),
        ("/api/hr/cases/disciplinary/HRC-2026-00005/owner", {"owner": "hrm2@x", "note": "x"}),
        ("/api/hr/me/concerns", {"description": "x"}),
    ]:
        assert (await client.post(path, json={**body, "confirm": False})).status_code == 400, path
    assert calls == []


@pytest.mark.asyncio
async def test_register_case_and_steps(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    reg = (await client.get("/api/hr/cases")).json()
    assert reg["items"][0]["owner_name"] == "Nokuthula Shongwe" and "employee_name" not in reg["items"][0]
    assert (await client.get("/api/hr/cases/disciplinary/HRC-2026-00005")).json()["next"] == ["Appeal", "Closed"]
    assert (await client.get("/api/hr/cases/payroll/X")).status_code == 404
    await client.post("/api/hr/cases/disciplinary/HRC-2026-00005/act", json={"to_stage": "Appeal", "note": "Appeal lodged", "appeal_owner": "ed@x", "confirm": True})
    assert calls[-1] == ("eswasa_hr.cases.act", {"kind": "disciplinary", "name": "HRC-2026-00005", "to_stage": "Appeal", "note": "Appeal lodged",
                                                 "next_step": None, "next_step_due": None, "outcome": None, "appeal_owner": "ed@x",
                                                 "offence": None, "sanction": None, "appeal_result": None, "confirm": 1})
    assert (await client.get("/api/hr/cases/board")).json()["kinds"][0] == {"kind": "grievance", "open": 1, "closed_this_year": 2, "avg_days_to_close": 12.5}


@pytest.mark.asyncio
async def test_raise_a_concern(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    assert (await client.get("/api/hr/me/concerns")).json()["categories"] == ["Working conditions"]
    r = await client.post("/api/hr/me/concerns", json={"description": "Workload", "grievance_type": "Working conditions", "not_handled_by": ["hrm2@x"], "talk_first": True, "confirm": True})
    assert r.json()["handled_by"] == "Nokuthula Shongwe"
    assert calls[-1] == ("eswasa_hr.cases.raise_concern", {"description": "Workload", "grievance_type": "Working conditions", "not_handled_by": ["hrm2@x"], "talk_first": True, "confirm": 1})
