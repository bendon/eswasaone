"""Smoke tests for events bus, R-A2 SLA sweep, and /ws/feed."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.events.bus import FeedBus, reset_feed_bus
from app.events.sla import next_escalation_role, run_sla_sweep
from app.main import app
from tests.auth_helpers import login_full_session


@pytest.fixture(autouse=True)
def _fresh_bus() -> None:
    reset_feed_bus()


def test_next_escalation_role_ladder() -> None:
    assert next_escalation_role("certification", None) == "Certification Officer"
    assert (
        next_escalation_role("certification", "Certification Officer")
        == "Certification Manager"
    )
    assert next_escalation_role("certification", "Certification Manager") == "System Manager"
    assert next_escalation_role("certification", "System Manager") is None
    assert next_escalation_role("unknown-mod", None) == "Desk User"


@pytest.mark.asyncio
async def test_feed_bus_publish_feeditem_shape() -> None:
    bus = FeedBus()
    q = bus.subscribe()
    event = await bus.publish(
        "sla.escalated",
        {"doctype": "Certification Application", "name": "APP-1", "to_role": "Certification Manager"},
        title="SLA escalate: APP-1",
        body="Certification Application APP-1 → Certification Manager",
        severity="warn",
        href="/approvals",
    )
    assert event["id"].startswith("evt-")
    assert event["type"] == "sla.escalated"
    assert event["title"] == "SLA escalate: APP-1"
    assert event["severity"] == "warn"
    assert event["href"] == "/approvals"
    assert "created_at" in event
    assert event["payload"]["to_role"] == "Certification Manager"
    got = await q.get()
    assert got["id"] == event["id"]


@pytest.mark.asyncio
async def test_sla_sweep_dry_run_publishes_and_escalates_plan() -> None:
    bus = FeedBus()
    session = MagicMock()
    session.method = AsyncMock(return_value=[])  # no prior comments / todos

    items = [
        {
            "id": "Certification Application::APP-SLA",
            "doctype": "Certification Application",
            "name": "APP-SLA",
            "title": "Overdue assessment",
            "module": "certification",
            "status": "Assessment",
            "sla_breached": True,
            "_todo_role": "Certification Officer",
        },
        {
            "id": "Board Pack::BP-OK",
            "doctype": "Board Pack",
            "name": "BP-OK",
            "title": "On time",
            "module": "governance",
            "status": "Draft",
            "sla_breached": False,
        },
    ]

    report = await run_sla_sweep(
        session,
        bus=bus,
        dry_run=True,
        items=items,
        actor="pytest",
    )
    assert report.breached == 1
    assert report.escalated == 0
    assert report.results[0].status == "dry_run"
    assert report.results[0].to_role == "Certification Manager"
    # dry_run with breached still emits sweep.complete
    recent = bus.recent(5)
    assert any(e["type"] == "sla.sweep.complete" for e in recent)


@pytest.mark.asyncio
async def test_sla_sweep_escalates_with_mocked_frappe() -> None:
    bus = FeedBus()

    async def _method(path: str, **kwargs: Any) -> Any:
        if path == "frappe.client.get_list":
            payload = kwargs.get("json") or {}
            doctype = payload.get("doctype")
            if doctype == "Comment":
                return []
            if doctype == "ToDo":
                return [
                    {
                        "name": "TODO-1",
                        "role": "Certification Officer",
                        "description": "Approval pending",
                        "priority": "Medium",
                    }
                ]
            return []
        if path == "frappe.client.set_value":
            return {"message": "ok"}
        if path == "frappe.client.insert":
            return {"name": "new"}
        raise AssertionError(f"unexpected method {path}")

    session = MagicMock()
    session.method = AsyncMock(side_effect=_method)
    session.resource = AsyncMock(
        return_value={"data": {"description": "Approval pending", "role": "Certification Officer"}}
    )

    items = [
        {
            "doctype": "Certification Application",
            "name": "APP-2",
            "title": "Stuck in Assessment",
            "module": "certification",
            "sla_breached": True,
        }
    ]
    report = await run_sla_sweep(session, bus=bus, dry_run=False, items=items, actor="pytest")
    assert report.escalated == 1
    assert report.results[0].to_role == "Certification Manager"
    assert report.results[0].feed_id
    feed_types = [e["type"] for e in bus.recent(10)]
    assert "sla.escalated" in feed_types
    assert "sla.sweep.complete" in feed_types


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_webhook_publishes_to_feed(client: AsyncClient) -> None:
    bus = reset_feed_bus()
    resp = await client.post("/api/events/webhooks/tbt", json={"id": "N-1"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"
    recent = bus.recent(1)
    assert recent
    assert recent[0]["type"] == "webhook.tbt"
    assert recent[0]["title"].startswith("Webhook")


@pytest.mark.asyncio
async def test_sla_sweep_requires_confirm(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORE_ALLOW_MOCK_AUTH", "true")
    body = await login_full_session(client, username="demo", password="demo")
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    denied = await client.post(
        "/api/events/sla/sweep",
        headers=headers,
        json={"confirm": False},
    )
    assert denied.status_code == 400


@pytest.mark.asyncio
async def test_ws_feed_receives_history() -> None:
    from starlette.testclient import TestClient

    bus = reset_feed_bus()
    await bus.publish("ping", title="hello", body="world", severity="info")

    with TestClient(app) as tc:
        with tc.websocket_connect("/ws/feed") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "ping"
            assert msg["title"] == "hello"
            assert "created_at" in msg
