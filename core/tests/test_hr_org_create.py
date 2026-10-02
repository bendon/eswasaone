
"""Create Company via POST /hr/organisation."""
from __future__ import annotations
from typing import Any
import pytest
from httpx import ASGITransport, AsyncClient
from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

def _ctx() -> AuthContext:
    return AuthContext(
        token="t",
        user=SessionUser(username="admin", full_name="Admin", email="a@x.com", roles=["System Manager", "Desk User"]),
        frappe_sid="sid",
        mock=False,
    )

@pytest.mark.asyncio
async def test_create_hr_organisation(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _ok_health(self: FrappeClient) -> bool:
        return True
    inserted: dict[str, Any] = {}
    async def _method(self: FrappeClient, method: str, **kwargs: Any) -> Any:
        payload = kwargs.get("json") or {}
        if method == "frappe.client.get_list" and payload.get("doctype") == "Company":
            return []
        if method == "frappe.client.insert":
            doc = payload.get("doc") or {}
            inserted.update(doc)
            return {"name": doc.get("company_name"), **doc}
        if method == "frappe.client.get":
            return inserted or {"name": "ESWASA", "company_name": "ESWASA"}
        raise AssertionError(method)
    monkeypatch.setattr(FrappeClient, "health", _ok_health)
    monkeypatch.setattr(FrappeClient, "method", _method)
    app.dependency_overrides[require_auth] = lambda: _ctx()
    app.dependency_overrides[require_auth_csrf] = lambda: _ctx()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/hr/organisation", json={
                "confirm": True,
                "legal_name": "Eswatini Standards Authority",
                "abbr": "ESW",
                "default_currency": "SZL",
            })
        assert resp.status_code == 201, resp.text
        assert resp.json()["legal_name"] == "Eswatini Standards Authority"
        assert inserted.get("abbr") == "ESW"
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_finance_settings_without_company(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _ok_health(self: FrappeClient) -> bool:
        return True
    async def _method(self: FrappeClient, method: str, **kwargs: Any) -> Any:
        if method == "frappe.client.get_list":
            return []
        raise AssertionError(method)
    monkeypatch.setattr(FrappeClient, "health", _ok_health)
    monkeypatch.setattr(FrappeClient, "method", _method)
    app.dependency_overrides[require_auth] = lambda: _ctx()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/finance/settings")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("company_id") is None
        assert any(s["id"] == "company" and s["done"] is False for s in body["steps"])
    finally:
        app.dependency_overrides.clear()
