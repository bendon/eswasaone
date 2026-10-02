"""Smoke tests for GuideCraft POST /api/guide."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

_FIXTURES = Path(__file__).resolve().parents[2] / "docs" / "fixtures"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_guide_honey_matches_fixture(client: AsyncClient) -> None:
    resp = await client.post("/api/guide", json={"goal": "Export honey to the EU"})
    assert resp.status_code == 200
    body = resp.json()
    expected = json.loads((_FIXTURES / "guide-honey.json").read_text(encoding="utf-8"))
    assert body["title"] == expected["title"]
    assert body["summary"] == expected["summary"]
    assert body["meta"] == expected["meta"]
    assert len(body["steps"]) == len(expected["steps"])
    assert body["steps"][1]["action"]["type"] == "buy"
    assert body["steps"][1]["action"]["auth_required"] is True
    assert body["steps"][1]["citations"][0]["rights"] == "licensed"


@pytest.mark.asyncio
async def test_guide_iso9001_matches_fixture(client: AsyncClient) -> None:
    resp = await client.post("/api/guide", json={"goal": "Get ISO 9001 certified"})
    assert resp.status_code == 200
    body = resp.json()
    expected = json.loads((_FIXTURES / "guide-iso9001.json").read_text(encoding="utf-8"))
    assert body["title"] == expected["title"]
    assert body["meta"]["steps"] == expected["meta"]["steps"]
    assert body["steps"][1]["action"]["auth_required"] is True


@pytest.mark.asyncio
async def test_guide_anonymous_no_auth_header(client: AsyncClient) -> None:
    resp = await client.post("/api/guide", json={"goal": "export honey to the EU"})
    assert resp.status_code == 200
    assert "steps" in resp.json()
