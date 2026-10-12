"""Plan 06 — the person record, documents, profile change requests and the certificate of service pass through to eswasa_hr."""

from __future__ import annotations

import base64
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.media.store import MediaStore, StoredObject, get_media_store
from app.schemas import SessionUser

RECORD = {
    "name": "HR-EMP-0044", "employee_name": "Thandi Mamba", "department": "Certification", "designation": "Officer", "status": "Active",
    "date_of_joining": "2020-03-02", "user_id": "thandi@x", "company_email": "thandi@eswasa.org.sz", "reports_to": "HR-EMP-0002",
    "employee_number": "S-044", "employment_type": "Permanent", "viewer": "manager", "reports_to_name": "Sipho Dlamini",
    "job": {"name": "HR-EMP-0044"},
    "leave": {"balances": [{"leave_type": "Annual", "allocated": 24, "used": 4, "balance": 20}], "awaiting": None,
              "next": {"leave_type": "Annual", "from_date": "2026-11-02", "to_date": "2026-11-06"}},
    "authorisations": [{"id": "SA-1", "employee": "HR-EMP-0044", "skill": "ISO 9001 auditor", "status": "Current"}],
    "documents": {"items": [{"id": "D1", "employee": "HR-EMP-0044", "document_type": "ID", "status": "Verified", "file": None}],
                  "missing": ["Qualification"], "required_set": True},
    "history": [{"id": "PRO-1", "kind": "promotion", "date": "2024-04-01", "state": "Done", "changes": []}],
    "contract": {"employment_type": "Permanent", "contract_end_date": None, "pending": None},
    "open_items": [{"kind": "probation", "title": "Probation review due", "due": "2026-11-01"}],
}
DOCS = {"employee": "HR-EMP-0044", "employee_name": "Thandi Mamba", "items": [], "missing": [], "required_set": False}
CHANGE = {"id": "PCR-00001", "employee": "HR-EMP-0044", "field": "cell_number", "field_label": "Mobile", "requested_value": "7600 0000",
          "status": "Pending", "has_evidence": False}


def _ctx() -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="thandi@x", full_name="Thandi", email="thandi@x", roles=["Employee"]),
                       frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")


class _Store(MediaStore):
    def __init__(self) -> None:
        self.saved: dict[str, tuple[bytes, str]] = {}

    def put_bytes(self, data: bytes, *, filename: str | None = None, content_type: str | None = None, prefix: str = "uploads") -> StoredObject:
        key = f"{prefix}/{filename}"
        self.saved[key] = (data, content_type or "")
        return StoredObject(key=key, bucket=None, content_type=content_type or "", size=len(data), url=f"/api/media/{key}", backend="local")

    def get_bytes(self, key: str) -> tuple[bytes, str]:
        if key not in self.saved:
            raise FileNotFoundError(key)
        return self.saved[key]


STORE = _Store()


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx
    app.dependency_overrides[require_auth_csrf] = _ctx
    app.dependency_overrides[get_media_store] = lambda: STORE
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch, handler) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _health(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        out = handler(method)
        if isinstance(out, Exception):
            raise out
        return out

    monkeypatch.setattr(FrappeClient, "health", _health)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


def _thrown(kind: str, message: str, code: int = 403) -> FrappeError:
    return FrappeError(f'Frappe GET /api/method/x failed: {{"exception": "frappe.exceptions.{kind}: {message}"}}', status_code=code)


@pytest.mark.asyncio
async def test_record_keeps_the_summary_fields(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: RECORD)
    r = await client.get("/api/hr/employees/HR-EMP-0044")
    assert r.status_code == 200, r.text
    body = r.json()
    for field in ("id", "employee_name", "department", "designation", "status", "date_of_joining", "email", "initials", "reports_to", "user_id", "desk_path"):
        assert field in body
    assert (body["id"], body["email"], body["initials"], body["desk_path"]) == ("HR-EMP-0044", "thandi@eswasa.org.sz", "TM", "/app/employee/HR-EMP-0044")
    assert body["leave"]["balances"][0]["balance"] == 20
    assert body["documents"]["missing"] == ["Qualification"]
    assert body["documents"]["items"][0]["file"] is None
    assert body["open_items"][0]["kind"] == "probation"
    assert calls == [("eswasa_hr.record.record", {"employee": "HR-EMP-0044"})]


@pytest.mark.asyncio
async def test_record_out_of_scope_is_403(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: _thrown("PermissionError", "You can only see your own record and your team's."))
    r = await client.get("/api/hr/employees/HR-EMP-0099")
    assert r.status_code == 403
    assert "your own record" in r.json()["detail"]


@pytest.mark.asyncio
async def test_my_record(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {**RECORD, "viewer": "self"})
    r = await client.get("/api/hr/me/record")
    assert r.status_code == 200, r.text
    assert r.json()["viewer"] == "self"
    assert calls[0][0] == "eswasa_hr.record.my_record"


@pytest.mark.asyncio
async def test_documents_list_and_mine(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: DOCS)
    assert (await client.get("/api/hr/employees/HR-EMP-0044/documents")).status_code == 200
    assert (await client.get("/api/hr/me/documents")).status_code == 200
    assert [c[0] for c in calls] == ["eswasa_hr.documents.documents", "eswasa_hr.documents.my_documents"]


@pytest.mark.asyncio
async def test_upload_stores_privately_and_passes_the_key(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: DOCS)
    files = {"file": ("permit.pdf", b"%PDF-1.4 test", "application/pdf")}
    r = await client.post("/api/hr/employees/HR-EMP-0044/documents", data={"document_type": "Work permit", "expires_on": "2027-06-30", "confirm": "true"}, files=files)
    assert r.status_code == 200, r.text
    assert calls == [("eswasa_hr.documents.upload", {"employee": "HR-EMP-0044", "document_type": "Work permit", "file": "hr/documents/permit.pdf",
                                                     "expires_on": "2027-06-30", "confirm": True})]
    r = await client.post("/api/hr/me/documents", data={"document_type": "ID", "confirm": "true"}, files={"file": ("id.png", b"png", "image/png")})
    assert r.status_code == 200, r.text
    assert calls[1][0] == "eswasa_hr.documents.upload_mine"


@pytest.mark.asyncio
async def test_upload_limits_and_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: DOCS)
    url = "/api/hr/me/documents"
    assert (await client.post(url, data={"document_type": "ID"}, files={"file": ("a.pdf", b"x", "application/pdf")})).status_code == 400
    assert (await client.post(url, data={"document_type": "ID", "confirm": "true"}, files={"file": ("a.docx", b"x", "application/msword")})).status_code == 415
    big = b"x" * (5 * 1024 * 1024 + 1)
    assert (await client.post(url, data={"document_type": "ID", "confirm": "true"}, files={"file": ("a.pdf", big, "application/pdf")})).status_code == 413
    assert calls == []


@pytest.mark.asyncio
async def test_verify_four_eyes_refusal_reaches_the_screen(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: _thrown("PermissionError", "You uploaded this, so someone else in HR must verify it."))
    assert (await client.post("/api/hr/documents/D1/verify", json={"confirm": False})).status_code == 400
    r = await client.post("/api/hr/documents/D1/verify", json={"confirm": True})
    assert r.status_code == 403
    assert "someone else in HR" in r.json()["detail"]
    assert calls == [("eswasa_hr.documents.verify", {"name": "D1", "confirm": True})]


@pytest.mark.asyncio
async def test_document_file_streams_only_after_frappe_allows(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    STORE.saved["hr/documents/id.pdf"] = (b"%PDF id", "application/pdf")
    _frappe(monkeypatch, lambda m: {"id": "D1", "employee": "HR-EMP-0044", "file": "hr/documents/id.pdf"})
    r = await client.get("/api/hr/documents/D1/file")
    assert r.status_code == 200
    assert r.content == b"%PDF id"
    assert r.headers["cache-control"] == "private, no-store"
    _frappe(monkeypatch, lambda m: _thrown("PermissionError", "Only HR and the person can open this document."))
    assert (await client.get("/api/hr/documents/D1/file")).status_code == 403


@pytest.mark.asyncio
async def test_profile_changes(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: [CHANGE] if m.endswith(".mine") else [] if m.endswith(".fields") else CHANGE)
    assert (await client.get("/api/hr/me/profile-changes")).json()["items"][0]["field_label"] == "Mobile"
    body = {"field": "cell_number", "requested_value": "7600 0000", "reason": "New number"}
    assert (await client.post("/api/hr/me/profile-changes", json={**body, "confirm": False})).status_code == 400
    r = await client.post("/api/hr/me/profile-changes", json={**body, "evidence": "/api/media/hr/evidence/x.pdf", "confirm": True})
    assert r.status_code == 200, r.text
    assert calls[2] == ("eswasa_hr.profile_changes.submit", {**body, "evidence": "http://test/api/media/hr/evidence/x.pdf", "confirm": True})


@pytest.mark.asyncio
async def test_profile_change_job_field_is_422(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: _thrown("ValidationError", "Job details change through a promotion, transfer or contract change, not a correction request.", 417))
    r = await client.post("/api/hr/me/profile-changes", json={"field": "designation", "requested_value": "Manager", "reason": "x", "confirm": True})
    assert r.status_code == 422
    assert "promotion" in r.json()["detail"]


@pytest.mark.asyncio
async def test_certificate_is_a_pdf(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    pdf = b"%PDF-1.4 certificate"
    calls = _frappe(monkeypatch, lambda m: {"file_name": "Certificate of service HR-EMP-0044.pdf", "content": base64.b64encode(pdf).decode()})
    r = await client.get("/api/hr/employees/HR-EMP-0044/certificate-of-service")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content == pdf
    assert calls == [("eswasa_hr.certificate.certificate", {"employee": "HR-EMP-0044"})]
    _frappe(monkeypatch, lambda m: _thrown("PermissionError", "Only HR can do this."))
    assert (await client.get("/api/hr/employees/HR-EMP-0044/certificate-of-service")).status_code == 403
