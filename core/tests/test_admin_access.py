"""Access Security BFF — policy evaluate + confirm gates."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.admin import access as access_mod
from app.admin.access_store import AccessStore, get_access_store, make_device
from app.identity.deps import AuthContext, require_system_manager
from app.main import app
from app.schemas import AdminAccessPolicy, SessionUser


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


def _fresh_store() -> AccessStore:
    store = AccessStore.__new__(AccessStore)
    store.settings = None  # type: ignore[assignment]
    store._redis = None
    store._mem = {
        "policy": {
            "enforce_off_lan": False,
            "fail_closed": True,
            "redirect_path": "/",
            "notes": "test",
        },
        "networks": [
            {
                "id": "net-1",
                "label": "Lab LAN",
                "cidr": "10.10.0.0/16",
                "enabled": True,
                "notes": None,
            }
        ],
        "devices": [],
        "events": [],
    }
    return store


@pytest.fixture()
def access_store() -> AccessStore:
    store = _fresh_store()

    def _provide() -> AccessStore:
        return store

    app.dependency_overrides[get_access_store] = _provide
    app.dependency_overrides[access_mod.get_access_store] = _provide
    yield store
    app.dependency_overrides.pop(get_access_store, None)
    app.dependency_overrides.pop(access_mod.get_access_store, None)


@pytest.mark.asyncio
async def test_access_policy_requires_system_manager(
    access_store: AccessStore,
) -> None:
    staff = _ctx(roles=["ESWASA Staff"])

    async def _override() -> AuthContext:
        return staff

    from app.identity import deps as identity_deps

    app.dependency_overrides[identity_deps.require_staff] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/admin/access/policy")
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.pop(identity_deps.require_staff, None)


@pytest.mark.asyncio
async def test_access_policy_get_and_put(
    access_store: AccessStore,
) -> None:
    sys_auth = _ctx(roles=["System Manager"])

    async def _override() -> AuthContext:
        return sys_auth

    app.dependency_overrides[require_system_manager] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            get_resp = await client.get("/api/admin/access/policy")
            assert get_resp.status_code == 200
            assert get_resp.json()["enforce_off_lan"] is False

            bad = await client.put(
                "/api/admin/access/policy",
                json={
                    "confirm": False,
                    "policy": {
                        "enforce_off_lan": True,
                        "fail_closed": True,
                        "redirect_path": "/",
                    },
                },
            )
            assert bad.status_code == 400

            ok = await client.put(
                "/api/admin/access/policy",
                json={
                    "confirm": True,
                    "policy": {
                        "enforce_off_lan": True,
                        "fail_closed": True,
                        "redirect_path": "/",
                        "notes": "live",
                    },
                },
            )
            assert ok.status_code == 200
            assert ok.json()["enforce_off_lan"] is True
    finally:
        app.dependency_overrides.pop(require_system_manager, None)


@pytest.mark.asyncio
async def test_evaluate_trusted_network_and_device(
    access_store: AccessStore,
) -> None:
    access_store.set_policy(
        AdminAccessPolicy(enforce_off_lan=True, fail_closed=True, redirect_path="/")
    )
    access_store.save_devices(
        [
            make_device(
                label="Laptop",
                fingerprint="fp-abc",
                status="approved",
                approved_by="admin",
            )
        ]
    )
    assert access_store.find_device_by_fingerprint("fp-abc") is not None

    sys_auth = _ctx(roles=["System Manager"])

    async def _override() -> AuthContext:
        return sys_auth

    app.dependency_overrides[require_system_manager] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            on_lan = await client.post(
                "/api/admin/access/evaluate",
                json={"ip": "10.10.5.9", "fingerprint": None, "record": True},
            )
            assert on_lan.status_code == 200
            body = on_lan.json()
            assert body["allowed"] is True
            assert body["reason"] == "trusted_network"

            off_ok = await client.post(
                "/api/admin/access/evaluate",
                json={"ip": "8.8.8.8", "fingerprint": "fp-abc", "record": True},
            )
            assert off_ok.status_code == 200
            body2 = off_ok.json()
            assert body2["allowed"] is True, body2
            assert body2["reason"] == "device_approved"

            denied = await client.post(
                "/api/admin/access/evaluate",
                json={"ip": "8.8.8.8", "fingerprint": "unknown", "record": True},
            )
            assert denied.json()["allowed"] is False
            assert denied.json()["reason"] == "device_missing"
    finally:
        app.dependency_overrides.pop(require_system_manager, None)


@pytest.mark.asyncio
async def test_institution_access_gate_allows_when_not_enforced(
    access_store: AccessStore,
) -> None:
    access_store.set_policy(
        AdminAccessPolicy(enforce_off_lan=False, fail_closed=True, redirect_path="/")
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/auth/institution-access")
    assert resp.status_code == 200, resp.text
    assert resp.json()["allowed"] is True
    assert resp.json()["reason"] == "enforce_off_lan_disabled"
