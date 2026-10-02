"""Institution module BFF routes — auth gate; seed-over-mocks (no fake payloads)."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.auth_helpers import login_full_session

STAFF_ENDPOINTS = [
    "/api/approvals",
    "/api/tbt/alerts",
    "/api/finance/kpis",
    "/api/finance/invoices",
    "/api/finance/revenue",
    "/api/finance/budget",
    "/api/hr/summary",
    "/api/hr/overview",
    "/api/hr/employees",
    "/api/hr/orgchart",
    "/api/hr/leave",
    "/api/hr/leave/balances",
    "/api/hr/holidays",
    "/api/hr/attendance",
    "/api/hr/out-today",
    "/api/hr/appraisals",
    "/api/governance/board-pack",
    "/api/metrology/jobs",
    "/api/crm/pipeline",
    "/api/crm/leads",
    "/api/crm/deals",
    "/api/training/courses",
    "/api/training/enrolments",
    "/api/marketing/campaigns",
    "/api/analytics/reports",
    "/api/analytics/revenue",
    "/api/analytics/certificates",
]

ANALYTICS_ASK = "/api/analytics/ask"

WRITE_ENDPOINTS = [
    ("/api/finance/invoices", {"customer": "Acme", "confirm": True}),
    (
        "/api/hr/leave",
        {
            "leave_type": "Annual Leave",
            "from_date": "2026-10-01",
            "to_date": "2026-10-05",
            "confirm": True,
        },
    ),
    ("/api/hr/employees", {"employee_name": "Thandi Dlamini", "confirm": True}),
    ("/api/crm/leads", {"title": "Prospect", "confirm": True}),
    ("/api/crm/deals", {"title": "Deal", "amount": 1000, "confirm": True}),
    ("/api/training/enrol", {"course": "iso-45001", "confirm": True}),
    ("/api/tbt/subscribe", {"sector": "textiles", "confirm": True}),
    ("/api/standards/publish", {"standard": "SZNS-001", "confirm": True}),
    ("/api/governance/pack/BP-2025-Q3", {"confirm": True}),
    ("/api/marketing/campaigns", {"title": "Outreach", "confirm": True}),
]


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_headers(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setenv("CORE_ALLOW_MOCK_AUTH", "true")
    body = await login_full_session(client, username="demo", password="demo")
    token = body["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
@pytest.mark.parametrize("path", STAFF_ENDPOINTS)
async def test_institution_requires_auth(client: AsyncClient, path: str) -> None:
    resp = await client.get(path)
    assert resp.status_code == 401
    assert resp.json().get("auth_required") is True


@pytest.mark.asyncio
@pytest.mark.parametrize("path", STAFF_ENDPOINTS)
async def test_institution_no_mock_fallback(
    client: AsyncClient, auth_headers: dict[str, str], path: str
) -> None:
    """STEP 0: mock auth must not invent KPI/list numbers — fail loudly."""
    resp = await client.get(path, headers=auth_headers)
    assert resp.status_code in (502, 503), resp.text


@pytest.mark.asyncio
@pytest.mark.parametrize("path,payload", WRITE_ENDPOINTS)
async def test_institution_write_requires_auth(
    client: AsyncClient, path: str, payload: dict
) -> None:
    resp = await client.post(path, json=payload)
    assert resp.status_code == 401
    assert resp.json().get("auth_required") is True


@pytest.mark.asyncio
@pytest.mark.parametrize("path,payload", WRITE_ENDPOINTS)
async def test_institution_write_confirm_required(
    client: AsyncClient, auth_headers: dict[str, str], path: str, payload: dict
) -> None:
    body = {**payload, "confirm": False}
    resp = await client.post(path, headers=auth_headers, json=body)
    assert resp.status_code == 400, resp.text


@pytest.mark.asyncio
@pytest.mark.parametrize("path,payload", WRITE_ENDPOINTS)
async def test_institution_write_no_mock_fallback(
    client: AsyncClient, auth_headers: dict[str, str], path: str, payload: dict
) -> None:
    resp = await client.post(path, headers=auth_headers, json=payload)
    assert resp.status_code in (502, 503), resp.text


@pytest.mark.asyncio
async def test_approvals_decide_removed(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.post(
        "/api/approvals/APR-001/decide",
        headers=auth_headers,
        json={"decision": "approve", "confirm": True},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_approvals_act_path_exists(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.post(
        "/api/approvals/Certification%20Application/CERT-0042/act",
        headers=auth_headers,
        json={"action": "approve", "confirm": True},
    )
    # Mock session → Frappe unavailable (503) or method missing (502)
    assert resp.status_code in (400, 502, 503), resp.text


@pytest.mark.asyncio
async def test_analytics_ask_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(ANALYTICS_ASK, json={"question": "What is revenue YTD?"})
    assert resp.status_code == 401
    assert resp.json().get("auth_required") is True


@pytest.mark.asyncio
async def test_analytics_ask_no_mock_fallback(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    """S10: mock auth must not invent analytics figures — fail loudly."""
    resp = await client.post(
        ANALYTICS_ASK,
        headers=auth_headers,
        json={"question": "What is revenue YTD?"},
    )
    assert resp.status_code in (502, 503), resp.text


@pytest.mark.asyncio
async def test_analytics_metric_unknown_still_no_mock(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.get("/api/analytics/not_a_real_metric", headers=auth_headers)
    assert resp.status_code in (404, 502, 503), resp.text
    if resp.status_code == 200:
        raise AssertionError("must not return invented metric payload")
