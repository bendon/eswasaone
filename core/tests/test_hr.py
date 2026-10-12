"""HR Phase 1–2 BFF — soft lists, confirm gates, mocked FrappeClient."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.gateway.router import _as_hr_employee, _quarter_start
from app.identity.deps import AuthContext, require_auth
from app.main import app
from app.schemas import SessionUser
from tests.auth_helpers import login_full_session

HR_READS = [
    "/api/hr/employees",
    "/api/hr/orgchart",
    "/api/hr/leave",
    "/api/hr/leave/balances",
    "/api/hr/holidays",
]

HR_WRITES = [
    (
        "/api/hr/employees",
        {"employee_name": "Thandi Dlamini", "confirm": True},
    ),
    (
        "/api/hr/leave",
        {
            "leave_type": "Annual Leave",
            "from_date": "2026-10-01",
            "to_date": "2026-10-05",
            "confirm": True,
        },
    ),
]


def _ctx(*, roles: list[str] | None = None) -> AuthContext:
    return AuthContext(
        token="test-token",
        user=SessionUser(
            username="hr@example.com",
            full_name="HR Tester",
            email="hr@example.com",
            roles=roles or ["ESWASA Staff", "HR Manager", "Desk User"],
        ),
        frappe_sid="sid-hr",
        mock=False,
        is_guest=False,
        csrf_token="csrf-hr",
    )


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_headers(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setenv("CORE_ALLOW_MOCK_AUTH", "true")
    body = await login_full_session(client, username="demo", password="demo")
    return {"Authorization": f"Bearer {body['access_token']}"}


def test_as_hr_employee_enriches_email_and_initials() -> None:
    emp = _as_hr_employee(
        {
            "name": "HR-EMP-001",
            "employee_name": "Thandi Dlamini",
            "department": "Standards",
            "designation": "Officer",
            "status": "Active",
            "date_of_joining": "2026-01-15",
            "user_id": "thandi@eswasa.org",
            "company_email": "thandi@eswasa.org",
        }
    )
    assert emp.id == "HR-EMP-001"
    assert emp.email == "thandi@eswasa.org"
    assert emp.initials == "TD"
    assert emp.date_of_joining == "2026-01-15"
    assert emp.desk_path == "/app/employee/HR-EMP-001"


def test_quarter_start_january() -> None:
    from datetime import date

    assert _quarter_start(date(2026, 2, 10)) == date(2026, 1, 1)
    assert _quarter_start(date(2026, 9, 22)) == date(2026, 7, 1)


@pytest.mark.asyncio
@pytest.mark.parametrize("path", HR_READS)
async def test_hr_reads_require_auth(client: AsyncClient, path: str) -> None:
    resp = await client.get(path)
    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("path,payload", HR_WRITES)
async def test_hr_writes_confirm_false_400(
    client: AsyncClient, auth_headers: dict[str, str], path: str, payload: dict
) -> None:
    body = {**payload, "confirm": False}
    resp = await client.post(path, headers=auth_headers, json=body)
    assert resp.status_code == 400, resp.text
    assert "confirm" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_hr_leave_act_confirm_false_400(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.post(
        "/api/hr/leave/LA-001/act",
        headers=auth_headers,
        json={"decision": "approve", "confirm": False},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_hr_patch_employee_confirm_false_400(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.patch(
        "/api/hr/employees/HR-EMP-001",
        headers=auth_headers,
        json={"department": "Metrology", "confirm": False},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_hr_employees_list_soft_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _ok_health(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kwargs: Any) -> Any:
        if method == "frappe.client.get_list":
            raise FrappeError("PermissionError: Insufficient Permission for Employee")
        raise AssertionError(f"unexpected {method}")

    monkeypatch.setattr(FrappeClient, "health", _ok_health)
    monkeypatch.setattr(FrappeClient, "method", _method)

    async def _override() -> AuthContext:
        return _ctx()

    app.dependency_overrides[require_auth] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/hr/employees", params={"q": "Thandi"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["items"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_hr_leave_balances_empty_without_a_leave_policy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _ok_health(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kwargs: Any) -> Any:
        if method == "eswasa_hr.leave.balances":
            return {"employee": "EMP-1", "items": [], "owed": None, "above_carry_over": None, "awaiting": "H14"}
        raise AssertionError(f"unexpected {method}")

    monkeypatch.setattr(FrappeClient, "health", _ok_health)
    monkeypatch.setattr(FrappeClient, "method", _method)

    async def _override() -> AuthContext:
        return _ctx()

    app.dependency_overrides[require_auth] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/hr/leave/balances")
        assert resp.status_code == 200, resp.text
        assert resp.json()["items"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_hr_organisation_overview_soft_empty_on_permission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _ok_health(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kwargs: Any) -> Any:
        if method == "frappe.client.get_list":
            raise FrappeError("PermissionError: Insufficient Permission for Company")
        raise AssertionError(f"unexpected {method}")

    monkeypatch.setattr(FrappeClient, "health", _ok_health)
    monkeypatch.setattr(FrappeClient, "method", _method)

    async def _override() -> AuthContext:
        return _ctx()

    app.dependency_overrides[require_auth] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/hr/organisation/overview")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["organisation"] is None
        assert body["departments"] == []
        assert body["designations_preview"] == []
        assert body["designations_total"] == 0
        assert body["locations"] == []
        assert body["cost_centres"] == []
        assert body["counts"]["employees"] == 0
        assert body["counts"]["departments"] == 0
        assert body["setup"]["steps_total"] == 7
        assert body["setup"]["steps_completed"] == 0
        assert body["setup"]["completion_pct"] == 0.0
        assert body["payroll"]["ready"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_hr_organisation_overview_soft_empty_when_frappe_down(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _bad_health(self: FrappeClient) -> bool:
        return False

    monkeypatch.setattr(FrappeClient, "health", _bad_health)

    async def _override() -> AuthContext:
        return _ctx()

    app.dependency_overrides[require_auth] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/hr/organisation/overview")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["organisation"] is None
        assert body["departments"] == []
        assert body["payroll"]["ready"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_hr_create_department_confirm_false_400(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.post(
        "/api/hr/departments",
        headers=auth_headers,
        json={"name": "Standards", "confirm": False},
    )
    assert resp.status_code == 400
    assert "confirm" in resp.json()["detail"].lower()