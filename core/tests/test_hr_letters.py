"""HR letters library (HR additions plan 03) — pass through to eswasa_hr.letters; the PDF route is audited."""

from __future__ import annotations

import base64
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

PDF = b"%PDF-1.4 letter"
LETTER = {"name": "HRL-2026-00001", "employee": "EMP-7", "employee_name": "Gcina Mavuso", "letter_type": "Promotion", "source_doctype": "Employee Promotion",
          "source_name": "PROM-1", "status": "Issued", "issued_by": "hr@x", "issued_on": "2026-10-16", "has_file": True}
TYPES = [{"letter_type": "Promotion", "ready": False, "reason": "Awaiting ESWASA (A3): no wording for Promotion.", "source_doctype": "Employee Promotion"},
         {"letter_type": "Certificate of service", "ready": True, "generated_here": False}]
LIST = {"employee": "EMP-7", "employee_name": "Gcina Mavuso", "letters": [LETTER], "types": TYPES, "can_cancel": True,
        "eligible": [{"letter_type": "Promotion", "source_doctype": "Employee Promotion", "source_name": "PROM-1", "label": "Promotion on 2026-10-01",
                      "date": "2026-10-01", "letter": "HRL-2026-00001"}]}
MINE = {"employee": "EMP-7", "letters": [{**LETTER, "letter_type": "Employment confirmation", "status": "Requested", "purpose": "Bank"}],
        "can_request": False, "ready": True}
FILE = {"name": "HRL-2026-00001", "employee": "EMP-7", "file_name": "Promotion letter HRL-2026-00001.pdf", "content_type": "application/pdf",
        "content": base64.b64encode(PDF).decode()}


def _ctx() -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="hr@x", full_name="HR", email="hr@x", roles=["HR User"]),
                       frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")


@pytest.fixture
async def client():
    app.dependency_overrides[require_auth] = _ctx
    app.dependency_overrides[require_auth_csrf] = _ctx
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch, fail: Exception | None = None, file: dict[str, Any] | None = None) -> list[tuple[str, Any]]:
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        if fail:
            raise fail
        return {
            "letter_types": {"types": TYPES, "awaiting": "A3"}, "my_letters": MINE, "request": MINE, "letter_file": file or FILE,
            "file_link": {"id": "DOC-1", "employee": "EMP-7", "document_type": "Letter", "file": "hr-letter:HRL-2026-00001"},
        }.get(method.rsplit(".", 1)[-1], LIST)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.fixture
def audits(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    from app.gateway import router as gw

    seen: list[dict[str, Any]] = []
    monkeypatch.setattr(gw, "audit_log", lambda **kw: seen.append(kw))
    return seen


@pytest.mark.asyncio
async def test_types_show_awaiting(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch)
    out = (await client.get("/api/hr/letters/types")).json()
    assert out["awaiting"] == "A3"
    assert out["types"][0]["reason"].startswith("Awaiting ESWASA (A3)")


@pytest.mark.asyncio
async def test_list_and_generate_need_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, audits: list[dict[str, Any]]) -> None:
    calls = _frappe(monkeypatch)
    assert (await client.get("/api/hr/employees/EMP-7/letters")).json()["eligible"][0]["letter"] == "HRL-2026-00001"
    body = {"letter_type": "Promotion", "source_name": "PROM-1", "addressed_to": "To whom it may concern"}
    assert (await client.post("/api/hr/employees/EMP-7/letters", json=body)).status_code == 400
    r = await client.post("/api/hr/employees/EMP-7/letters", json={**body, "confirm": True})
    assert r.status_code == 200
    assert calls[-1] == ("eswasa_hr.letters.generate", {"employee": "EMP-7", **body, "confirm": 1})
    assert audits[-1]["action"] == "hr.letter.generate"


@pytest.mark.asyncio
async def test_generate_refusal_is_a_422(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    from app.gateway import router as gw

    def _raise(exc: Any) -> None:
        raise HTTPException(status_code=400, detail="Awaiting ESWASA (A3): no wording for Promotion.")

    monkeypatch.setattr(gw, "_raise_from_frappe", _raise)
    _frappe(monkeypatch, fail=FrappeError("ValidationError"))
    r = await client.post("/api/hr/employees/EMP-7/letters", json={"letter_type": "Promotion", "confirm": True})
    assert r.status_code == 422
    assert "Awaiting ESWASA (A3)" in r.json()["detail"]


@pytest.mark.asyncio
async def test_pdf_route_is_inline_no_store_and_audited(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, audits: list[dict[str, Any]]) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/letters/HRL-2026-00001/file")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["cache-control"] == "private, no-store"
    assert r.headers["content-disposition"].startswith("inline;")
    assert r.content == PDF
    assert calls == [("eswasa_hr.letters.letter_file", {"name": "HRL-2026-00001"})]
    assert audits[-1]["action"] == "hr.letter.viewed"
    assert audits[-1]["resource"] == "HR Letter:HRL-2026-00001"


@pytest.mark.asyncio
async def test_pdf_route_refuses_a_bad_payload(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, audits: list[dict[str, Any]]) -> None:
    _frappe(monkeypatch, file={"content": "not base64!"})
    assert (await client.get("/api/hr/letters/HRL-2026-00001/file")).status_code == 502
    assert audits == []


@pytest.mark.asyncio
async def test_a_letter_filed_as_a_document_streams_the_letter(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, audits: list[dict[str, Any]]) -> None:
    calls = _frappe(monkeypatch)
    r = await client.get("/api/hr/documents/DOC-1/file")
    assert r.status_code == 200
    assert r.content == PDF
    assert [c[0].rsplit(".", 1)[-1] for c in calls] == ["file_link", "letter_file"]


@pytest.mark.asyncio
async def test_role_refusal_is_403(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, fail=FrappeError("frappe.exceptions.PermissionError: You can't open this letter.", status_code=403))
    assert (await client.get("/api/hr/letters/HRL-2026-00001/file")).status_code == 403
    assert (await client.post("/api/hr/letters/HRL-2026-00001/cancel", json={"note": "Wrong", "confirm": True})).status_code == 403


@pytest.mark.asyncio
async def test_fulfil_cancel_and_my_letters(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch)
    assert (await client.post("/api/hr/letters/HRL-2026-00001/generate", json={})).status_code == 400
    assert (await client.post("/api/hr/letters/HRL-2026-00001/generate", json={"confirm": True})).status_code == 200
    assert (await client.post("/api/hr/letters/HRL-2026-00001/cancel", json={"note": "Wrong date", "confirm": True})).status_code == 200
    assert (await client.get("/api/hr/me/letters")).json()["letters"][0]["purpose"] == "Bank"
    assert (await client.post("/api/hr/me/letters", json={"purpose": "Bank"})).status_code == 400
    assert (await client.post("/api/hr/me/letters", json={"purpose": "Bank", "addressed_to": "Standard Bank", "confirm": True})).status_code == 200
    assert calls == [
        ("eswasa_hr.letters.fulfil", {"name": "HRL-2026-00001", "addressed_to": None, "confirm": 1}),
        ("eswasa_hr.letters.cancel", {"name": "HRL-2026-00001", "note": "Wrong date", "confirm": 1}),
        ("eswasa_hr.letters.my_letters", None),
        ("eswasa_hr.letters.request", {"purpose": "Bank", "addressed_to": "Standard Bank", "confirm": 1}),
    ]
