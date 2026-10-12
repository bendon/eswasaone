"""Performance (J6) — cycles, self-assessment, manager review and objectives pass through to eswasa_hr.performance."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

APPRAISAL = {"id": "APR-1", "cycle": "CYC-1", "cycle_name": "Mid-year review", "employee": "EMP-1", "employee_name": "Thandi Mamba",
             "kras": ["Audit quality"], "goals": [{"id": "G-1", "goal_name": "Close 40 audits on time", "kra": "Audit quality", "strategic_goal": "Goal 2: faster certification"}],
             "criteria": [{"criteria": "Quality of work", "weight": 50, "self": 4, "manager": None}], "step": "manager", "self_done": True, "can_review": True}
CYCLE = {"name": "CYC-1", "cycle_name": "Mid-year review", "departments": [{"department": "Certification", "people": 2, "objectives_set": 1, "self_done": 1, "manager_done": 0}],
         "people": [{"appraisal": "APR-1", "employee": "EMP-1", "employee_name": "Thandi Mamba", "objectives": 1, "self_done": True, "step": "manager"}]}


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


def _h(method: str) -> Any:
    name = method.rsplit(".", 1)[1]
    return {
        "cycles": {"items": [{"name": "CYC-1", "cycle_name": "Mid-year review", "people": 2, "self_done": 1}]},
        "defaults": {"templates": [{"name": "Auditors", "title": "Auditors", "criteria": ["Quality of work"], "kras": ["Audit quality"]}], "departments": [{"name": "Certification", "people": 14}], "reminder_days": [10, 3]},
        "start_cycle": CYCLE, "cycle": CYCLE, "remind": {"sent": 3},
        "my_appraisal": None, "team_review": APPRAISAL,
    }.get(name, APPRAISAL)


@pytest.mark.asyncio
async def test_writes_need_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, _h)
    rating = [{"criteria": "Quality of work", "stars": 4}]
    for path, body in [
        ("/api/hr/performance/cycles", {"cycle_name": "Mid-year review", "start_date": "2026-10-01", "end_date": "2027-03-31", "template": "Auditors"}),
        ("/api/hr/performance/cycles/CYC-1/remind", {}),
        ("/api/hr/me/appraisal", {"ratings": rating}),
        ("/api/hr/team/EMP-1/review", {"ratings": rating, "feedback": "Strong half year."}),
        ("/api/hr/team/EMP-1/goals", {"goal_name": "Close 40 audits on time"}),
    ]:
        assert (await client.post(path, json={**body, "confirm": False})).status_code == 400, path
    assert calls == []


@pytest.mark.asyncio
async def test_hr_cycle_views(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, _h)
    assert (await client.get("/api/hr/performance")).json()["items"][0]["self_done"] == 1
    assert (await client.get("/api/hr/performance/defaults")).json()["reminder_days"] == [10, 3]
    r = await client.post("/api/hr/performance/cycles", json={"cycle_name": "Mid-year review", "start_date": "2026-10-01", "end_date": "2027-03-31", "template": "Auditors", "departments": ["Certification"], "confirm": True})
    assert r.json()["departments"][0]["people"] == 2
    assert (await client.get("/api/hr/performance/cycles/CYC-1?department=Certification")).json()["people"][0]["step"] == "manager"
    assert (await client.post("/api/hr/performance/cycles/CYC-1/remind", json={"confirm": True})).json() == {"sent": 3}
    assert calls[2] == ("eswasa_hr.performance.start_cycle", {"cycle_name": "Mid-year review", "start_date": "2026-10-01", "end_date": "2027-03-31", "template": "Auditors", "departments": ["Certification"], "confirm": 1})
    assert calls[3] == ("eswasa_hr.performance.cycle", {"name": "CYC-1", "department": "Certification"})


@pytest.mark.asyncio
async def test_self_assessment_and_review(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, _h)
    assert (await client.get("/api/hr/me/appraisal")).json() == {"appraisal": None}
    r = await client.post("/api/hr/me/appraisal", json={"ratings": [{"criteria": "Quality of work", "stars": 4}], "reflections": "40 audits on track.", "confirm": True})
    assert r.json()["criteria"][0]["self"] == 4
    assert (await client.get("/api/hr/team/EMP-1/review")).json()["appraisal"]["goals"][0]["strategic_goal"] == "Goal 2: faster certification"
    await client.post("/api/hr/team/EMP-1/review", json={"ratings": [{"criteria": "Quality of work", "stars": 3}], "feedback": "Strong half year.", "confirm": True})
    await client.post("/api/hr/team/EMP-1/goals", json={"goal_name": "Coach 2 auditors", "kra": "Audit quality", "strategic_goal": "Goal 5", "confirm": True})
    assert calls[1] == ("eswasa_hr.performance.save_self", {"ratings": [{"criteria": "Quality of work", "stars": 4}], "reflections": "40 audits on track.", "confirm": 1})
    assert calls[3] == ("eswasa_hr.performance.submit_review", {"employee": "EMP-1", "ratings": [{"criteria": "Quality of work", "stars": 3}], "feedback": "Strong half year.", "confirm": 1})
    assert calls[4] == ("eswasa_hr.performance.add_goal", {"employee": "EMP-1", "goal_name": "Coach 2 auditors", "kra": "Audit quality", "strategic_goal": "Goal 5", "confirm": 1})
