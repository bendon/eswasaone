"""Training plan, needs, nominations, attendance and cost (HR additions plan 05) — pass through to eswasa_hr.training_plan."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

NEED = {"name": "TRN-2026-00001", "employee": "EMP-7", "employee_name": "Gcina Mavuso", "department": "ICT", "topic": "Mass refresher",
        "source": "Manager", "status": "Open"}
TOTALS = {"lines": 1, "people": 3, "scheduled": 0, "estimated_direct": 4500, "estimated_indirect": 800, "estimated": 5300,
          "actual_direct": 0, "actual_indirect": 0, "actual": 0}
PLAN = {"name": "TRP-2026-00001", "department": "ICT", "year": "2026", "status": "Waiting", "prepared_by": "hrm@x", "totals": TOTALS,
        "lines": [{"name": "ln1", "topic": "ISO/IEC 17025 internal audit", "quarter": "Q2", "needs": [NEED], "can_schedule": False}],
        "deciders": ["hrm2@x"], "can_edit": False, "can_decide": False}
PLANS = {"plans": [{k: v for k, v in PLAN.items() if k not in ("lines", "deciders", "can_edit", "can_decide")}], "years": ["2026"],
         "departments": ["ICT"], "can_prepare": True, "waiting": 1}
EVENT = {"name": "TE-1", "event_name": "ISO/IEC 17025 internal audit", "event_status": "Scheduled", "start_time": "2026-11-02 09:00:00",
         "nominees": [{"name": "r1", "employee": "EMP-7", "attendance": None, "present": None}], "can_nominate": True, "can_record": True,
         "direct_cost": 0, "indirect_cost": 0}
TEAM = {"team": [{"name": "EMP-7", "employee_name": "Gcina Mavuso"}], "needs": [NEED], "events": [{"name": "TE-1", "nominated": ["EMP-7"]}]}
MINE = {"employee": "EMP-7", "needs": [NEED], "upcoming": [{"event": "TE-1", "event_name": "ISO/IEC 17025 internal audit"}], "history": []}


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
            "plans": PLANS, "plan": PLAN, "save_plan": PLAN, "schedule_line": PLAN, "event": EVENT, "nominate": EVENT, "attendance": EVENT, "cost": EVENT,
            "needs": {"needs": [NEED], "open": 1}, "raise_need": {"needs": [NEED], "open": 1}, "team_training": TEAM, "my_training": MINE,
        }[method.rsplit(".", 1)[-1]]

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_plans_list_and_detail(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/training/plans", params={"year": "2026"})
    assert r.json()["plans"][0]["totals"]["estimated"] == 5300
    d = (await client.get("/api/hr/training/plans/TRP-2026-00001")).json()
    assert d["deciders"] == ["hrm2@x"]
    assert d["lines"][0]["needs"][0]["name"] == "TRN-2026-00001"
    assert calls == [("eswasa_hr.training_plan.plans", {"year": "2026"}), ("eswasa_hr.training_plan.plan", {"name": "TRP-2026-00001"})]


@pytest.mark.asyncio
async def test_save_plan_needs_confirm_and_joins_needs(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    body = {"department": "ICT", "year": "2026", "submit": True,
            "lines": [{"topic": "Audit", "quarter": "Q2", "needs": ["TRN-1", "TRN-2"], "estimated_direct": 100}]}
    assert (await client.post("/api/hr/training/plans", json={**body, "confirm": False})).status_code == 400
    assert calls == []
    assert (await client.post("/api/hr/training/plans", json={**body, "lines": [{"topic": "x", "quarter": "Q1", "estimated_direct": 1, "reason": "Fun"}], "confirm": True})).status_code == 422
    r = await client.post("/api/hr/training/plans", json={**body, "confirm": True})
    assert r.status_code == 200
    method, sent = calls[0]
    assert method == "eswasa_hr.training_plan.save_plan"
    assert (sent["submit"], sent["confirm"], sent["lines"][0]["needs"]) == (1, 1, "TRN-1\nTRN-2")


@pytest.mark.asyncio
async def test_schedule_nominate_attendance_cost(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    for path, body in (
        ("/api/hr/training/plans/TRP-2026-00001/lines/ln1/schedule", {"start": "2026-11-02", "end": "2026-11-03", "venue": "Mbabane"}),
        ("/api/hr/training/events/TE-1/nominate", {"employees": ["EMP-7"]}),
        ("/api/hr/training/events/TE-1/attendance", {"rows": [{"employee": "EMP-7", "present": True}]}),
        ("/api/hr/training/events/TE-1/cost", {"direct": 4000, "indirect": 650}),
    ):
        assert (await client.post(path, json={**body, "confirm": False})).status_code == 400
        assert (await client.post(path, json={**body, "confirm": True})).status_code == 200
    assert [c[0].rsplit(".", 1)[-1] for c in calls] == ["schedule_line", "nominate", "attendance", "cost"]
    assert calls[0][1] == {"plan": "TRP-2026-00001", "line": "ln1", "start": "2026-11-02", "end": "2026-11-03", "venue": "Mbabane",
                           "trainer": None, "event_type": None, "confirm": 1}
    assert calls[2][1] == {"event": "TE-1", "rows": [{"employee": "EMP-7", "present": True}], "confirm": 1}
    assert calls[3][1] == {"event": "TE-1", "direct": 4000, "indirect": 650, "confirm": 1}


@pytest.mark.asyncio
async def test_needs_team_and_me(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    assert (await client.get("/api/hr/training/needs", params={"status": "Open", "source": "Appraisal"})).json()["open"] == 1
    assert (await client.post("/api/hr/training/needs", json={"employee": "EMP-7", "topic": "Mass", "confirm": False})).status_code == 400
    assert (await client.post("/api/hr/training/needs", json={"employee": "EMP-7", "topic": "Mass", "confirm": True})).status_code == 200
    assert (await client.get("/api/hr/team/training")).json()["events"][0]["nominated"] == ["EMP-7"]
    assert (await client.get("/api/hr/me/training")).json()["upcoming"][0]["event"] == "TE-1"
    assert [c[0].rsplit(".", 1)[-1] for c in calls] == ["needs", "raise_need", "team_training", "my_training"]
    assert calls[0][1] == {"status": "Open", "source": "Appraisal"}


@pytest.mark.asyncio
async def test_review_passes_training_needs(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json")))
        return {"name": "APR-1", "employee": "EMP-7", "employee_name": "Gcina", "cycle": "C1", "cycle_name": "Mid-year", "step": "done", "criteria": []}

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    try:
        await client.post("/api/hr/team/EMP-7/review", json={"ratings": [], "feedback": "Good", "training_needs": [{"topic": "Report writing"}], "confirm": True})
    except Exception:  # the stub's reply isn't a full appraisal; only what was sent matters here
        pass
    assert calls[0][1]["training_needs"] == [{"topic": "Report writing", "skill": None}]


@pytest.mark.asyncio
async def test_permission_error_from_frappe_is_403(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.frappe_client import FrappeError

    _frappe(monkeypatch, fail=FrappeError("frappe.exceptions.PermissionError: You can only nominate people in your team.", status_code=403))
    r = await client.post("/api/hr/training/events/TE-1/nominate", json={"employees": ["EMP-9"], "confirm": True})
    assert r.status_code == 403
