"""Recruitment part 2 (J2) — pipeline, applicant, interviews, feedback, offer, answer, employee, CV."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.media.store import get_media_store
from app.schemas import SessionUser

DETAIL = {"id": "HR-APP-0001", "applicant_name": "Ayanda Mthethwa", "email": "ayanda@example.com", "status": "Shortlisted",
          "has_cv": True, "applied_on": "2026-10-14", "interviews": [], "offer": None, "stage": "Shortlist",
          "opening": {"name": "HR-OPN-0001", "job_title": "Certification Officer"}}


def _ctx() -> AuthContext:
    return AuthContext(
        token="t", user=SessionUser(username="hr@x", full_name="HR", email="hr@x", roles=["HR Manager"]),
        frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf",
    )


class _Store:
    def get_bytes(self, key: str):
        if key == "careers/cv/abc.pdf":
            return b"%PDF-1.4", "application/pdf"
        raise FileNotFoundError(key)


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx
    app.dependency_overrides[require_auth_csrf] = _ctx
    app.dependency_overrides[get_media_store] = _Store
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


@pytest.mark.asyncio
async def test_pipeline_and_applicant(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def h(m: str) -> Any:
        if m.endswith(".pipeline"):
            return {"opening": {"name": "HR-OPN-0001", "job_title": "Certification Officer"},
                    "applicants": [{"id": "HR-APP-0001", "applicant_name": "Ayanda Mthethwa", "status": "Open", "stage": "Applied"}]}
        return {**DETAIL, "stage": "Interview", "interviews": [{
            "id": "HR-INT-1", "status": "Under Review", "scheduled_on": "2026-11-03", "from_time": "10:00", "to_time": "11:00",
            "interview_type": "Panel", "panel": ["Sipho Magagula", "Zanele Nkosi"], "waiting_for": 1,
            "feedback": [{"interviewer": "Sipho Magagula", "result": "Cleared", "rating": 4.0, "feedback": "Strong"}]}]}

    _frappe(monkeypatch, h)
    p = (await client.get("/api/hr/recruitment/openings/HR-OPN-0001/pipeline")).json()
    assert p["applicants"][0]["stage"] == "Applied"
    a = (await client.get("/api/hr/recruitment/applicants/HR-APP-0001")).json()
    assert a["stage"] == "Interview" and a["has_cv"] is True
    i = a["interviews"][0]
    assert (i["panel"], i["waiting_for"], i["feedback"][0]["rating"]) == (["Sipho Magagula", "Zanele Nkosi"], 1, 4.0)


@pytest.mark.asyncio
async def test_writes_need_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: DETAIL)
    posts = [
        ("/api/hr/recruitment/applicants/HR-APP-0001/status", {"status": "Shortlisted"}),
        ("/api/hr/recruitment/applicants/HR-APP-0001/interviews", {"interview_type": "Panel", "scheduled_on": "2026-11-03", "from_time": "10:00", "to_time": "11:00", "interviewers": ["sipho@x"]}),
        ("/api/hr/recruitment/interviews/HR-INT-1/result", {"status": "Cleared"}),
        ("/api/hr/recruitment/applicants/HR-APP-0001/offer", {"offer_date": "2026-11-05"}),
        ("/api/hr/recruitment/offers/HR-OFF-1/answer", {"answer": "Accepted"}),
        ("/api/hr/recruitment/offers/HR-OFF-1/employee", {"date_of_joining": "2026-12-01", "gender": "Female", "date_of_birth": "1997-03-14"}),
        ("/api/hr/me/interviews/HR-INT-1/feedback", {"result": "Cleared", "ratings": [{"skill": "Auditing", "stars": 4}]}),
    ]
    for path, body in posts:
        assert (await client.post(path, json={**body, "confirm": False})).status_code == 400, path
    assert calls == []


@pytest.mark.asyncio
async def test_schedule_and_feedback_pass_through(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {"interview": "HR-INT-1", "result": "Cleared"} if m.endswith(".feedback") else DETAIL)
    await client.post(
        "/api/hr/recruitment/applicants/HR-APP-0001/interviews",
        json={"interview_type": "Panel", "scheduled_on": "2026-11-03", "from_time": "10:00", "to_time": "11:00", "interviewers": ["sipho@x", "zanele@x"], "confirm": True},
    )
    assert calls[0] == ("eswasa_hr.hiring.schedule", {"applicant": "HR-APP-0001", "interview_type": "Panel", "scheduled_on": "2026-11-03",
                                                       "from_time": "10:00", "to_time": "11:00", "interviewers": ["sipho@x", "zanele@x"], "confirm": 1})
    fb = await client.post("/api/hr/me/interviews/HR-INT-1/feedback", json={"result": "Cleared", "ratings": [{"skill": "Auditing", "stars": 4}], "feedback": "Strong", "confirm": True})
    assert fb.json() == {"interview": "HR-INT-1", "result": "Cleared"}
    assert calls[1][1]["ratings"] == [{"skill": "Auditing", "stars": 4}]


@pytest.mark.asyncio
async def test_offer_rules_reach_the_user(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(m: str) -> Any:
        raise FrappeError('{"exc_type": "ValidationError", "exception": "frappe.exceptions.ValidationError: There are no vacancies under staffing plan HR-SP-2026-0001"}')

    _frappe(monkeypatch, boom)
    resp = await client.post("/api/hr/recruitment/applicants/HR-APP-0001/offer", json={"offer_date": "2026-11-05", "confirm": True})
    assert 400 <= resp.status_code < 500
    assert "no vacancies" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_create_employee(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: {"employee": "HR-EMP-00087", "employee_name": "Ayanda Mthethwa"})
    resp = await client.post(
        "/api/hr/recruitment/offers/HR-OFF-1/employee",
        json={"date_of_joining": "2026-12-01", "gender": "Female", "date_of_birth": "1997-03-14", "reports_to": "HR-EMP-0031", "confirm": True},
    )
    assert resp.status_code == 201
    assert resp.json() == {"employee": "HR-EMP-00087", "employee_name": "Ayanda Mthethwa"}


@pytest.mark.asyncio
async def test_cv_download_is_checked_by_frappe_first(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: "careers/cv/abc.pdf")
    ok = await client.get("/api/hr/recruitment/applicants/HR-APP-0001/cv")
    assert ok.status_code == 200 and ok.content == b"%PDF-1.4" and ok.headers["cache-control"] == "private, no-store"

    def denied(m: str) -> Any:
        raise FrappeError('{"exc_type": "PermissionError", "exception": "frappe.exceptions.PermissionError: Only HR can do this."}')

    _frappe(monkeypatch, denied)
    assert (await client.get("/api/hr/recruitment/applicants/HR-APP-0001/cv")).status_code == 403
