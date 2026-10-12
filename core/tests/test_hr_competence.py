"""Staff authorisations (J4) — /hr/competence/* and /hr/me/competence pass through to eswasa_hr."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

ROW = {"id": "SA-0001", "employee": "EMP-44", "employee_name": "Thandi Mamba", "skill": "FSMS lead auditor",
       "valid_from": "2023-12-01", "valid_to": "2026-11-30", "status": "Expiring"}


def _ctx() -> AuthContext:
    return AuthContext(
        token="t",
        user=SessionUser(username="hr@x", full_name="HR", email="hr@x", roles=["HR Manager"]),
        frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf",
    )


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
        return handler(method)

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


@pytest.mark.asyncio
async def test_require_auth() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for path in ("/api/hr/competence/matrix", "/api/hr/competence/expiring", "/api/hr/me/competence"):
            assert (await ac.get(path)).status_code == 401


@pytest.mark.asyncio
async def test_matrix_and_expiring(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def h(m: str) -> Any:
        if m.endswith(".matrix"):
            return {"skills": [{"name": "FSMS lead auditor", "kind": "Audit", "scheme": "ISO 22000", "validity_months": 36, "holders": 2, "expiring": 1}],
                    "people": [{"employee": "EMP-44", "employee_name": "Thandi Mamba", "cells": {"FSMS lead auditor": {"id": "SA-0001", "status": "Expiring", "valid_to": "2026-11-30"}}}]}
        return [ROW]

    calls = _frappe(monkeypatch, h)
    mx = (await client.get("/api/hr/competence/matrix")).json()
    assert mx["skills"][0]["holders"] == 2
    assert mx["people"][0]["cells"]["FSMS lead auditor"]["status"] == "Expiring"
    ex = (await client.get("/api/hr/competence/expiring?days=30")).json()
    assert ex["items"][0]["id"] == "SA-0001"
    assert calls[1] == ("eswasa_hr.authorisations.expiring", {"days": 30})


@pytest.mark.asyncio
async def test_request_needs_confirm_and_passes_evidence(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: {**ROW, "status": "In training", "decides": "Nomvula Tsabedze", "evidence": [{"evidence_type": "Training Result", "reference": "Refresher"}]})
    body = {"employee": "EMP-44", "skill": "FSMS lead auditor", "valid_from": "2026-12-01",
            "evidence": [{"evidence_type": "Training Result", "reference": "Refresher"}], "confirm": False}
    assert (await client.post("/api/hr/competence/authorisations", json=body)).status_code == 400
    assert calls == []
    resp = await client.post("/api/hr/competence/authorisations", json={**body, "confirm": True})
    assert resp.status_code == 201, resp.text
    assert resp.json()["decides"] == "Nomvula Tsabedze"
    method, payload = calls[0]
    assert method == "eswasa_hr.authorisations.request"
    assert payload["evidence"][0]["reference"] == "Refresher" and payload["confirm"] == 1


@pytest.mark.asyncio
async def test_rule_errors_reach_the_user(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(m: str) -> Any:
        raise FrappeError('{"exc_type": "ValidationError", "exception": "frappe.exceptions.ValidationError: This department has no head set. Set one in Structure before sending authorisations."}')

    _frappe(monkeypatch, boom)
    resp = await client.post(
        "/api/hr/competence/authorisations",
        json={"employee": "EMP-44", "skill": "x", "valid_from": "2026-12-01", "evidence": [], "confirm": True},
    )
    assert 400 <= resp.status_code < 500
    assert "no head set" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_mine_and_renewal(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, lambda m: [ROW] if m.endswith(".mine") else {"sent_to": 2})
    assert (await client.get("/api/hr/me/competence")).json()["items"][0]["skill"] == "FSMS lead auditor"
    assert (await client.post("/api/hr/me/competence/renewal", json={"skill": "FSMS lead auditor", "note": "Course done", "confirm": False})).status_code == 400
    res = await client.post("/api/hr/me/competence/renewal", json={"skill": "FSMS lead auditor", "note": "Course done 4 Nov", "confirm": True})
    assert res.json() == {"sent_to": 2}
    assert calls[-1][1]["note"] == "Course done 4 Nov"
