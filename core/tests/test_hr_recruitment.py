"""Recruitment part 1 (J2) — /hr/recruitment/* for HR and /careers/* for the public."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.gateway import router as gw
from app.identity.deps import AuthContext, get_actor, require_auth, require_auth_csrf
from app.main import app
from app.media.store import get_media_store
from app.schemas import SessionUser

REQ = {"id": "HR-HIREQ-0001", "designation": "Certification Officer", "department": "Certification", "status": "Pending",
       "requested_by": "Nomvula Tsabedze", "posting_date": "2026-10-12", "expected_by": "2026-12-01", "opening": None, "applicants": {}}
OPENING = {"id": "HR-OPN-0001", "job_title": "Certification Officer", "department": "Certification", "designation": "Certification Officer",
           "description": "<p>Review applications…</p>", "posted_on": "2026-10-12", "closes_on": "2026-10-30"}


def _ctx(user: str = "hr@x") -> AuthContext:
    return AuthContext(
        token="t", user=SessionUser(username=user, full_name=user, email=user, roles=["HR Manager"]),
        frappe_sid="sid", mock=False, is_guest=user == "guest", csrf_token="csrf",
    )


class _Store:
    def __init__(self) -> None:
        self.saved: list[dict[str, Any]] = []

    def put_bytes(self, data: bytes, *, filename: str | None = None, content_type: str | None = None, prefix: str = "uploads"):
        self.saved.append({"size": len(data), "filename": filename, "prefix": prefix})
        return type("S", (), {"key": f"{prefix}/abc-{filename}", "size": len(data)})()


@pytest.fixture
def store() -> _Store:
    return _Store()


@pytest.fixture
async def client(store: _Store):
    app.dependency_overrides[require_auth] = _ctx
    app.dependency_overrides[require_auth_csrf] = _ctx
    app.dependency_overrides[get_actor] = lambda: _ctx("guest")
    app.dependency_overrides[get_media_store] = lambda: store
    gw._APPLY_HITS.clear()
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
async def test_hr_endpoints_require_auth() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        assert (await ac.get("/api/hr/recruitment")).status_code == 401
        assert (await ac.get("/api/hr/recruitment/vacancies")).status_code == 401


@pytest.mark.asyncio
async def test_vacancies_and_requisitions(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def h(m: str) -> Any:
        if m.endswith(".vacancies"):
            return [{"department": "Certification", "designation": "Certification Officer", "approved": 5, "filled": 4, "in_recruitment": 0, "vacant": 1}]
        return [REQ]

    _frappe(monkeypatch, h)
    assert (await client.get("/api/hr/recruitment/vacancies")).json()["items"][0]["vacant"] == 1
    assert (await client.get("/api/hr/recruitment")).json()["items"][0]["status"] == "Pending"


@pytest.mark.asyncio
async def test_raise_and_publish_need_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: REQ if m.endswith(".raise_requisition") else {**REQ, "status": "Open & Approved", "opening": {"id": "HR-OPN-0001", "status": "Open", "published": True, "closes_on": "2026-10-30"}})
    body = {"designation": "Certification Officer", "department": "Certification", "description": "Review applications",
            "expected_compensation": 24000, "confirm": False}
    assert (await client.post("/api/hr/recruitment/requisitions", json=body)).status_code == 400
    assert (await client.post("/api/hr/recruitment/requisitions", json={**body, "confirm": True})).status_code == 201
    assert calls[0][1]["designation"] == "Certification Officer" and calls[0][1]["confirm"] == 1
    pub = await client.post("/api/hr/recruitment/requisitions/HR-HIREQ-0001/publish", json={"closes_on": "2026-10-30", "confirm": True})
    assert pub.json()["opening"]["published"] is True
    assert calls[1] == ("eswasa_hr.recruitment.publish", {"requisition": "HR-HIREQ-0001", "closes_on": "2026-10-30", "job_title": None, "location": None, "confirm": 1})


@pytest.mark.asyncio
async def test_public_openings(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: [OPENING] if m.endswith(".public_openings") else OPENING)
    assert (await client.get("/api/careers/openings")).json()["items"][0]["job_title"] == "Certification Officer"
    one = (await client.get("/api/careers/openings/HR-OPN-0001")).json()
    assert one["closes_on"] == "2026-10-30" and one.get("salary") is None
    assert calls[1] == ("eswasa_hr.recruitment.public_opening_detail", {"opening": "HR-OPN-0001"})


def _form(**over: Any) -> dict[str, Any]:
    return {"applicant_name": "Ayanda Mthethwa", "email": "ayanda@example.com", "consent": "true", **over}


@pytest.mark.asyncio
async def test_apply_stores_cv_and_creates_applicant(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, store: _Store) -> None:
    calls = _frappe(monkeypatch, lambda m: {"reference": "HR-APP-0001", "job_title": "Certification Officer", "closes_on": "2026-10-30"})
    resp = await client.post(
        "/api/careers/openings/HR-OPN-0001/apply",
        data=_form(phone="+268 7600 0000"),
        files={"cv": ("cv.pdf", b"%PDF-1.4 cv", "application/pdf")},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["reference"] == "HR-APP-0001"
    assert store.saved == [{"size": 11, "filename": "cv.pdf", "prefix": "careers/cv"}]
    method, payload = calls[0]
    assert method == "eswasa_hr.recruitment.apply"
    assert payload["cv_link"] == "careers/cv/abc-cv.pdf" and payload["consent"] == 1 and payload["opening"] == "HR-OPN-0001"


@pytest.mark.asyncio
async def test_apply_rejects_bad_cv_and_missing_consent(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, store: _Store) -> None:
    calls = _frappe(monkeypatch, lambda m: {})
    exe = await client.post("/api/careers/openings/HR-OPN-0001/apply", data=_form(), files={"cv": ("cv.exe", b"MZ", "application/octet-stream")})
    assert exe.status_code == 415
    no_consent = await client.post("/api/careers/openings/HR-OPN-0001/apply", data=_form(consent="false"), files={"cv": ("cv.pdf", b"%PDF", "application/pdf")})
    assert no_consent.status_code == 422
    big = await client.post("/api/careers/openings/HR-OPN-0001/apply", data=_form(), files={"cv": ("cv.pdf", b"x" * (5 * 1024 * 1024 + 1), "application/pdf")})
    assert big.status_code == 413
    assert calls == [] and store.saved == []


@pytest.mark.asyncio
async def test_apply_is_rate_limited(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: {"reference": "HR-APP-1"})
    codes = []
    for i in range(11):
        r = await client.post("/api/careers/openings/HR-OPN-0001/apply", data=_form(email=f"a{i}@example.com"), files={"cv": ("cv.pdf", b"%PDF", "application/pdf")})
        codes.append(r.status_code)
    assert codes[:10] == [201] * 10 and codes[10] == 429
