"""Job profile apply — catalog expands without requiring Frappe Role Profile docs."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException

from app.admin.router import _apply_job_profile
from app.frappe_client import FrappeError


class _FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.role_profiles: set[str] = set()
        self.user_roles: list[str] = []
        self.linked: str | None = None

    async def method(self, path: str, *, json: dict[str, Any] | None = None) -> Any:
        json = json or {}
        self.calls.append((path, json))
        if path == "frappe.client.get_value":
            name = (json.get("filters") or {}).get("name")
            if name in self.role_profiles:
                return {"name": name}
            return None
        if path == "frappe.client.set_value":
            if json.get("fieldname") == "role_profile_name":
                self.linked = json.get("value")
            return None
        return None

    async def add_user_role(self, user: str, role: str) -> None:
        self.calls.append(("add_user_role", {"user": user, "role": role}))
        if role and role not in self.user_roles:
            self.user_roles.append(role)

    async def post(self, path: str, *, json: dict[str, Any] | None = None) -> Any:
        json = json or {}
        self.calls.append((f"POST {path}", json))
        if "Role Profile" in path:
            name = json.get("role_profile") or json.get("name")
            if name:
                self.role_profiles.add(str(name))
            return {"data": {"name": name}}
        raise FrappeError(f"unexpected post {path}")


@pytest.mark.asyncio
async def test_apply_institution_staff_without_existing_frappe_profile():
    client = _FakeClient()
    await _apply_job_profile(client, user="staff@example.com", profile_name="Institution Staff")
    assert "ESWASA Staff" in client.user_roles
    assert "Desk User" in client.user_roles
    assert "Employee" in client.user_roles
    assert "Institution Staff" in client.role_profiles
    assert client.linked == "Institution Staff"


@pytest.mark.asyncio
async def test_apply_still_succeeds_when_role_profile_create_fails():
    client = _FakeClient()

    async def _fail_post(path: str, *, json: dict[str, Any] | None = None) -> Any:
        raise FrappeError("no permission", status_code=403)

    client.post = _fail_post  # type: ignore[method-assign]
    await _apply_job_profile(client, user="staff@example.com", profile_name="Institution Staff")
    assert "ESWASA Staff" in client.user_roles
    assert client.linked is None


@pytest.mark.asyncio
async def test_apply_unknown_profile_rejected():
    client = _FakeClient()
    with pytest.raises(HTTPException) as exc:
        await _apply_job_profile(client, user="x", profile_name="Not A Real Pack")
    assert exc.value.status_code == 422
