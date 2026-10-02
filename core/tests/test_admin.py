"""System Administration BFF — RBAC and confirm gates."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient
from app.identity.deps import AuthContext, require_system_manager
from app.main import app
from app.schemas import SessionUser


def _ctx(*, roles: list[str], username: str = "admin@example.com") -> AuthContext:
    return AuthContext(
        token="test-token",
        user=SessionUser(
            username=username,
            full_name="Test Admin",
            email=username,
            roles=roles,
        ),
        frappe_sid="sid-test",
        mock=False,
        is_guest=False,
    )


@pytest.mark.asyncio
async def test_require_system_manager_allows_system_manager() -> None:
    auth = _ctx(roles=["System Manager", "Desk User"])
    result = await require_system_manager(auth)  # type: ignore[arg-type]
    assert result.user.username == auth.user.username


@pytest.mark.asyncio
async def test_require_system_manager_allows_administrator() -> None:
    auth = _ctx(roles=["Administrator"])
    result = await require_system_manager(auth)  # type: ignore[arg-type]
    assert result is auth


@pytest.mark.asyncio
async def test_require_system_manager_rejects_staff_without_sys_manager() -> None:
    auth = _ctx(roles=["ESWASA Staff", "Desk User"])
    with pytest.raises(HTTPException) as exc_info:
        await require_system_manager(auth)  # type: ignore[arg-type]
    assert exc_info.value.status_code == 403
    assert "System Manager" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_admin_clear_cache_confirm_false_returns_400(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _ok_health(self: FrappeClient) -> bool:
        return True

    monkeypatch.setattr(FrappeClient, "health", _ok_health)

    sys_auth = _ctx(roles=["System Manager"])

    async def _override_sys() -> AuthContext:
        return sys_auth

    app.dependency_overrides[require_system_manager] = _override_sys
    # require_staff is nested under require_system_manager; override top gate only
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/admin/actions/clear-cache",
                json={"confirm": False},
            )
        assert resp.status_code == 400
        assert "confirm" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_overview_requires_system_manager(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    staff = _ctx(roles=["ESWASA Staff"])

    async def _override_staff() -> AuthContext:
        return staff

    # Hit require_system_manager via real require_staff chain: override require_staff
    from app.identity import deps as identity_deps

    app.dependency_overrides[identity_deps.require_staff] = _override_staff
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/admin/overview")
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_clear_cache_confirm_true_ok(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _ok_health(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kwargs: Any) -> Any:
        if method == "frappe.clear_cache":
            return None
        raise AssertionError(f"unexpected method {method}")

    monkeypatch.setattr(FrappeClient, "health", _ok_health)
    monkeypatch.setattr(FrappeClient, "method", _method)

    sys_auth = _ctx(roles=["System Manager"])

    async def _override_sys() -> AuthContext:
        return sys_auth

    app.dependency_overrides[require_system_manager] = _override_sys
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/admin/actions/clear-cache",
                json={"confirm": True},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
    finally:
        app.dependency_overrides.clear()
