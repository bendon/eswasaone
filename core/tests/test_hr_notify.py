"""Plan 04: HR notification outbox sender, POST /events/hr-notify, and the HR rung of the SLA ladder."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.adapters.messaging import DeliveryStatus, MessageResult
from app.config import Settings, get_settings
from app.events.hr_notify import MARK, PENDING, run_hr_notify
from app.events.sla import escalate_item, next_escalation_role
from app.frappe_client import get_frappe_client
from app.identity.deps import AuthContext, get_optional_auth
from app.main import app
from app.schemas import SessionUser

ITEMS = [
    {"name": "N1", "channel": "email", "to": "thandi@eswasa.example", "subject": "Your leave request was approved", "body": "Hello"},
    {"name": "N2", "channel": "email", "to": "bounce@eswasa.example", "subject": "s", "body": "b"},
    {"name": "N3", "channel": "sms", "to": "+26876000000", "subject": "s", "body": "b"},
    {"name": "N4", "channel": "email", "to": None, "subject": "s", "body": "b"},
]


class FakeSession:
    def __init__(self, items: list[dict[str, Any]] | None = None) -> None:
        self.items = ITEMS if items is None else items
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.token: tuple[str, str] | None = None

    async def health(self) -> bool:
        return True

    def with_token(self, key: str, secret: str) -> FakeSession:
        self.token = (key, secret)
        return self

    def with_session(self, sid: str | None) -> FakeSession:
        return self

    async def method(self, method: str, *, json: dict[str, Any] | None = None, params: Any = None) -> Any:
        self.calls.append((method, json or {}))
        return self.items if method == PENDING else {"ok": True}

    def marks(self) -> dict[str, tuple[str, str | None]]:
        return {j["name"]: (j["status"], j["error"]) for m, j in self.calls if m == MARK}


class FakeMessaging:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def _result(self, channel: str, to: str) -> MessageResult:
        self.sent.append((channel, to))
        failed = to.startswith("bounce")
        return MessageResult(channel=channel, status=DeliveryStatus.FAILED if failed else DeliveryStatus.SENT, message_id="m", to=to,
                             detail="mailbox full" if failed else "ok")

    async def send_email(self, req: Any) -> MessageResult:
        return self._result("email", req.to)

    async def send_sms(self, req: Any) -> MessageResult:
        return self._result("sms", req.to)


@pytest.mark.asyncio
async def test_sends_through_the_adapter_and_marks_each_result() -> None:
    session, messaging = FakeSession(), FakeMessaging()
    report = await run_hr_notify(session, messaging=messaging, limit=10)  # type: ignore[arg-type]
    assert report.as_dict() == {"sent": 2, "failed": 1, "skipped": 1, "errors": []}
    assert messaging.sent == [("email", "thandi@eswasa.example"), ("email", "bounce@eswasa.example"), ("sms", "+26876000000")]
    marks = session.marks()
    assert marks["N1"] == ("Sent", None)
    assert marks["N2"] == ("Failed", "mailbox full")
    assert marks["N3"] == ("Sent", None)
    assert marks["N4"][0] == "Skipped"
    assert session.calls[0] == (PENDING, {"limit": 10})


@pytest.mark.asyncio
async def test_console_fallback_counts_as_sent_with_a_note() -> None:
    from app.adapters.messaging import MessagingAdapter, MessagingConfig

    session = FakeSession(ITEMS[:1])
    report = await run_hr_notify(session, messaging=MessagingAdapter(MessagingConfig()), limit=5)  # type: ignore[arg-type]
    assert report.sent == 1
    status, note = session.marks()["N1"]
    assert status == "Sent" and note and note.startswith("console fallback")


def _auth(roles: list[str]) -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="sm@x", full_name="SM", email="sm@x", roles=roles), frappe_sid="sid", mock=False)


@pytest.fixture
def overrides():
    session = FakeSession([])
    app.dependency_overrides[get_frappe_client] = lambda: session
    app.dependency_overrides[get_settings] = lambda: Settings(hr_notify_cron_token="cron-secret", frappe_service_api_key="k", frappe_service_api_secret="s")
    yield session
    app.dependency_overrides.clear()


async def _post(body: dict[str, Any], headers: dict[str, str] | None = None) -> Any:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.post("/api/events/hr-notify", json=body, headers=headers or {})


@pytest.mark.asyncio
async def test_route_needs_a_login_or_the_cron_token(overrides) -> None:
    app.dependency_overrides[get_optional_auth] = lambda: None
    assert (await _post({"confirm": True})).status_code == 401
    assert (await _post({"confirm": True}, {"X-Cron-Token": "wrong"})).status_code == 401
    r = await _post({"confirm": True}, {"X-Cron-Token": "cron-secret"})
    assert r.status_code == 200, r.text
    assert r.json() == {"sent": 0, "failed": 0, "skipped": 0, "errors": []}
    assert overrides.token == ("k", "s")


@pytest.mark.asyncio
async def test_route_is_system_manager_only_and_needs_confirm(overrides) -> None:
    app.dependency_overrides[get_optional_auth] = lambda: _auth(["HR Manager"])
    assert (await _post({"confirm": True})).status_code == 403
    app.dependency_overrides[get_optional_auth] = lambda: _auth(["System Manager"])
    assert (await _post({"confirm": False})).status_code == 400
    assert (await _post({"confirm": True})).status_code == 200


@pytest.mark.asyncio
async def test_generic_sweep_leaves_hr_to_frappe() -> None:
    assert next_escalation_role("hr", None) is None
    assert next_escalation_role("hr", "HR User") is None
    res = await escalate_item(FakeSession([]), {"doctype": "Leave Application", "name": "LA-1", "module": "hr"}, bus=None)  # type: ignore[arg-type]
    assert (res.status, res.to_role) == ("skipped", None)
