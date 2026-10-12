"""Recruitment gaps plan 08 — requisition stage, offer letter PDF, onboarding without an offer, letter email."""

from __future__ import annotations

import base64
from email.message import EmailMessage
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.adapters.messaging import EmailAttachment, EmailRequest, MessagingAdapter, MessagingConfig
from app.events.hr_notify import PENDING, run_hr_notify
from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

PDF = b"%PDF-1.4 offer"
REQ = {"id": "HR-HIREQ-1", "designation": "Certification Officer", "department": "Certification", "status": "Pending",
       "requested_by": "Sipho", "applicants": {}, "stage": "Head", "waiting_on": "Nomsa Dube"}


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
        out = handler(method)
        if isinstance(out, Exception):
            raise out
        return out

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_requisition_detail_carries_stage_and_waiting_on(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: REQ)
    r = await client.get("/api/hr/recruitment/requisitions/HR-HIREQ-1")
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["stage"], r.json()["waiting_on"]) == ("Pending", "Head", "Nomsa Dube")
    assert calls == [("eswasa_hr.recruitment.requisition", {"name": "HR-HIREQ-1"})]


@pytest.mark.asyncio
async def test_offer_letter_is_a_pdf(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    raw = {"file_name": "Offer letter HR-OFF-1.pdf", "content_type": "application/pdf", "content": base64.b64encode(PDF).decode()}
    calls = _frappe(monkeypatch, lambda m: raw)
    r = await client.get("/api/hr/recruitment/offers/HR-OFF-1/letter")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content == PDF
    assert calls == [("eswasa_hr.hiring.offer_letter", {"offer": "HR-OFF-1"})]


@pytest.mark.asyncio
async def test_offer_letter_refused_for_non_hr(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    err = FrappeError('Frappe GET /api/method/x failed: {"exception": "frappe.exceptions.PermissionError: Only HR can do this."}', status_code=403)
    _frappe(monkeypatch, lambda m: err)
    assert (await client.get("/api/hr/recruitment/offers/HR-OFF-1/letter")).status_code == 403


@pytest.mark.asyncio
async def test_onboarding_without_an_offer_or_activities(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {"id": "HR-EMP-ONB-1", "employee": "E-7", "employee_name": "Sipho", "status": "Pending", "activities": []})
    r = await client.post("/api/hr/onboarding", json={"employee": "E-7", "start_date": "2026-10-20", "confirm": True}, headers={"X-CSRF-Token": "csrf"})
    assert r.status_code == 201, r.text
    method, sent = calls[0]
    assert method == "eswasa_hr.onboarding.start"
    assert (sent["employee"], sent["activities"], sent["boarding_begins_on"]) == ("E-7", [], "2026-10-20")


class _Session:
    def __init__(self, items: list[dict[str, Any]]) -> None:
        self.items = items

    async def method(self, method: str, *, json: Any = None, params: Any = None) -> Any:
        return self.items if method == PENDING else {"ok": True}


class _Messaging:
    def __init__(self) -> None:
        self.reqs: list[EmailRequest] = []

    async def send_email(self, req: EmailRequest) -> Any:
        self.reqs.append(req)
        return await MessagingAdapter(MessagingConfig()).send_email(req)  # console fallback


@pytest.mark.asyncio
async def test_offer_email_carries_the_letter() -> None:
    item = {"name": "N1", "channel": "email", "to": "a@b.co", "subject": "Your offer from ESWASA", "body": "Dear Ayanda",
            "attachments": [{"file_name": "Offer letter HR-OFF-1.pdf", "content_type": "application/pdf", "content": base64.b64encode(PDF).decode()}]}
    messaging = _Messaging()
    report = await run_hr_notify(_Session([item]), messaging=messaging, limit=5)  # type: ignore[arg-type]
    assert report.sent == 1
    att = messaging.reqs[0].attachments[0]
    assert (att.filename, att.content, att.content_type) == ("Offer letter HR-OFF-1.pdf", PDF, "application/pdf")


def test_smtp_message_includes_attachments(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _SMTP:
        def __init__(self, *a: Any, **k: Any) -> None:
            pass

        def __enter__(self) -> _SMTP:
            return self

        def __exit__(self, *a: Any) -> None:
            return None

        def starttls(self) -> None:
            return None

        def login(self, *a: Any) -> None:
            return None

        def send_message(self, msg: EmailMessage) -> None:
            sent.append(msg)

    import asyncio

    import app.adapters.messaging as m

    monkeypatch.setattr(m.smtplib, "SMTP", _SMTP)
    adapter = MessagingAdapter(MessagingConfig(smtp_host="smtp.x", smtp_from="hr@eswasa.example"))
    req = EmailRequest(to="a@b.co", subject="s", body="b", attachments=[EmailAttachment(filename="letter.pdf", content=PDF, content_type="application/pdf")])
    asyncio.run(adapter.send_email(req))
    parts = [p for p in sent[0].iter_attachments()]
    assert [(p.get_filename(), p.get_content()) for p in parts] == [("letter.pdf", PDF)]
