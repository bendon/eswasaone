"""Plan 07 steps 5–8 — evidence files, training evidence, external people and the evidence pack pass through to eswasa_hr."""

from __future__ import annotations

import base64
import io
import zipfile
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.media.store import MediaStore, StoredObject, get_media_store
from app.schemas import SessionUser

DETAIL = {"id": "SA-1", "employee": "EMP-44", "employee_name": "Thandi Mamba", "skill": "FSMS", "status": "In training",
          "evidence": [{"evidence_type": "File", "reference": None, "notes": None, "id": "ev1", "file": "hr/evidence/cert.pdf"}]}


def _ctx() -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="hr@x", full_name="HR", email="hr@x", roles=["HR Manager"]),
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

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        return handler(method)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_require_auth() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for path in ("/api/hr/competence/training?employee=E", "/api/hr/external-people", "/api/hr/evidence-pack/P1"):
            assert (await ac.get(path)).status_code == 401


@pytest.mark.asyncio
async def test_evidence_upload_stores_privately_and_passes_the_key(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: DETAIL)
    url = "/api/hr/competence/authorisations/SA-1/evidence"
    files = {"file": ("cert.pdf", b"%PDF", "application/pdf")}
    assert (await client.post(url, data={"evidence_type": "File"}, files=files)).status_code == 400
    assert calls == []
    r = await client.post(url, data={"evidence_type": "File", "notes": "Lead auditor certificate", "confirm": "true"}, files=files)
    assert r.status_code == 200, r.text
    assert calls == [("eswasa_hr.authorisations.add_evidence", {"name": "SA-1", "evidence_type": "File", "file": "hr/evidence/cert.pdf",
                                                                 "reference": None, "notes": "Lead auditor certificate", "confirm": True})]
    assert r.json()["evidence"][0]["file"] == "hr/evidence/cert.pdf"
    bad = await client.post(url, data={"evidence_type": "File", "confirm": "true"}, files={"file": ("a.exe", b"MZ", "application/x-msdownload")})
    assert bad.status_code == 415


@pytest.mark.asyncio
async def test_evidence_file_streams_after_frappe_allows(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    STORE.saved["hr/evidence/cert.pdf"] = (b"%PDF", "application/pdf")
    _frappe(monkeypatch, lambda m: {"id": "ev1", "authorisation": "SA-1", "employee": "EMP-44", "file": "hr/evidence/cert.pdf"})
    r = await client.get("/api/hr/competence/evidence/ev1/file")
    assert r.status_code == 200 and r.content == b"%PDF"
    assert r.headers["cache-control"] == "private, no-store"


@pytest.mark.asyncio
async def test_request_keeps_the_screen_shape_and_adds_external(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: DETAIL)
    body = {"external_person": "EXT-1", "department": "Certification", "skill": "FSMS", "valid_from": "2026-12-01",
            "evidence": [{"evidence_type": "Training Result", "reference": "TR-1"}], "confirm": True}
    assert (await client.post("/api/hr/competence/authorisations", json=body)).status_code == 201
    payload = calls[0][1]
    assert (payload["employee"], payload["external_person"], payload["department"]) == (None, "EXT-1", "Certification")
    assert payload["evidence"] == [{"evidence_type": "Training Result", "reference": "TR-1"}]


@pytest.mark.asyncio
async def test_training_evidence(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {"employee": "EMP-44", "skill": "FSMS", "lms_installed": True, "items": [
        {"source": "Training Result", "reference": "TR-1", "title": "ISO 22000 refresher", "date": "2026-11-04", "tagged": True}]})
    r = await client.get("/api/hr/competence/training?employee=EMP-44&skill=FSMS")
    assert r.status_code == 200 and r.json()["items"][0]["reference"] == "TR-1"
    assert calls == [("eswasa_hr.training.evidence", {"employee": "EMP-44", "skill": "FSMS"})]


@pytest.mark.asyncio
async def test_external_people_disabled_is_404_with_reason(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, lambda m: {"enabled": False, "items": []} if m.endswith("list_people") else {"disabled": True, "message": "off (H10)"})
    assert (await client.get("/api/hr/external-people")).json() == {"enabled": False, "items": []}
    body = {"full_name": "Sipho Dube", "role": "Contract auditor", "confirm": True}
    r = await client.post("/api/hr/external-people", json=body)
    assert r.status_code == 404
    assert r.json()["detail"]["reason"] == "disabled"
    assert (await client.post("/api/hr/external-people", json={**body, "confirm": False})).status_code == 400


@pytest.mark.asyncio
async def test_external_person_created(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {"id": "EXT-1", "full_name": "Sipho Dube", "role": "Contract auditor", "status": "Active"})
    r = await client.post("/api/hr/external-people", json={"full_name": "Sipho Dube", "role": "Contract auditor", "confirm": True})
    assert r.status_code == 201 and r.json()["id"] == "EXT-1"
    assert calls[0][0] == "eswasa_hr.external.create" and calls[0][1]["confirm"] is True


@pytest.mark.asyncio
async def test_evidence_pack_job_status_and_download(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("pack.json", "{}")
    STORE.saved["hr/evidence/a.pdf"] = (b"%PDF-a", "application/pdf")
    ready = {"id": "P1", "status": "Ready", "scope": {"kind": "scheme", "value": "ISO 22000"}, "people": 2, "ready": True}

    def h(m: str) -> Any:
        if m.endswith(".request"):
            return {**ready, "status": "Queued", "ready": False}
        if m.endswith(".status"):
            return ready
        return {"id": "P1", "file_name": "evidence-pack-P1.zip", "content": base64.b64encode(buf.getvalue()).decode(),
                "media_files": [{"key": "hr/evidence/a.pdf", "path": "files/EMP-1/1-a.pdf"}, {"key": "gone", "path": "files/x"}]}

    calls = _frappe(monkeypatch, h)
    assert (await client.post("/api/hr/evidence-pack", json={"scheme": "ISO 22000", "confirm": False})).status_code == 400
    r = await client.post("/api/hr/evidence-pack", json={"scheme": "ISO 22000", "confirm": True})
    assert r.status_code == 202 and r.json()["download"] is None
    assert calls[0] == ("eswasa_hr.evidence_pack.request", {"scheme": "ISO 22000", "sections": None, "confirm": True})
    st = (await client.get("/api/hr/evidence-pack/P1")).json()
    assert st["download"] == "/api/hr/evidence-pack/P1/download"
    dl = await client.get("/api/hr/evidence-pack/P1/download")
    assert dl.status_code == 200 and dl.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(dl.content)).namelist()
    assert names == ["pack.json", "files/EMP-1/1-a.pdf", "MISSING_FILES.txt"]
