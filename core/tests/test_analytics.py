"""Analytics NL bridge — intent resolution + auth/no-mock gates."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.gateway.analytics import list_report_summaries, resolve_metric_key
from app.main import app
from tests.auth_helpers import login_full_session


@pytest.mark.parametrize(
    "question,expected",
    [
        ("What is revenue YTD?", "revenue"),
        ("show budget variance", "budget"),
        ("how many certificates", "certificates"),
        ("overdue audits please", "overdue_audits"),
        ("active headcount", "employees"),
        ("annual plan traffic lights", "plan"),
        ("regulator quarterly pack", "regulator_pack"),
        ("finance_kpis", "finance_kpis"),
    ],
)
def test_resolve_metric_key(question: str, expected: str) -> None:
    assert resolve_metric_key(question) == expected


def test_report_catalogue_has_rd1_ids() -> None:
    ids = {r["id"] for r in list_report_summaries()}
    assert "regulator_pack" in ids
    assert "plan" in ids
    assert "revenue" in ids


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_headers(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setenv("CORE_ALLOW_MOCK_AUTH", "true")
    body = await login_full_session(
        client, username="mock.staff", password="not-a-real-password"
    )
    return {"Authorization": f"Bearer {body['access_token']}"}


@pytest.mark.asyncio
async def test_analytics_reports_requires_auth(client: AsyncClient) -> None:
    bare = await client.get("/api/analytics/reports")
    assert bare.status_code == 401
    assert bare.json().get("auth_required") is True


@pytest.mark.asyncio
async def test_analytics_reports_no_mock_fallback(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.get("/api/analytics/reports", headers=auth_headers)
    assert resp.status_code in (502, 503), resp.text
