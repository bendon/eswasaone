"""Plan 01: HR writes go through eswasa_hr guards, never raw frappe.client calls on HR DocTypes."""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.frappe_client import FrappeClient, FrappeError
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.main import app
from app.schemas import SessionUser

ROUTER = Path(__file__).resolve().parents[1] / "app" / "gateway" / "router.py"
LEAVE = {"name": "LA-9", "employee": "HR-001", "employee_name": "Thandi Dlamini", "leave_type": "Annual Leave",
         "from_date": "2026-10-20", "to_date": "2026-10-22", "status": "Approved"}
EMPLOYEE = {"name": "HR-EMP-9", "employee_name": "Nomsa Mabuza", "department": "Metrology - ESW", "designation": None,
            "status": "Active", "date_of_joining": "2026-11-01", "user_id": None, "company_email": None, "reports_to": None}


def _thrown(kind: str, message: str) -> FrappeError:
    return FrappeError(f'Frappe POST /api/method/x failed: {{"exception": "frappe.exceptions.{kind}: {message}"}}', status_code=417)


def _ctx(roles: list[str]) -> AuthContext:
    return AuthContext(token="t", user=SessionUser(username="hr@x", full_name="HR", email="hr@x", roles=roles),
                       frappe_sid="sid", mock=False, is_guest=False, csrf_token="csrf")


@pytest.fixture
def roles() -> list[str]:
    return ["ESWASA Staff", "HR Manager"]


@pytest.fixture
async def client(roles: list[str]):
    app.dependency_overrides[require_auth] = lambda: _ctx(roles)
    app.dependency_overrides[require_auth_csrf] = lambda: _ctx(roles)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _frappe(monkeypatch: pytest.MonkeyPatch, answers: dict[str, Any]) -> list[tuple[str, Any]]:
    """answers: method -> return value, or an exception to raise."""
    calls: list[tuple[str, Any]] = []

    async def _ok(self: FrappeClient) -> bool:
        return True

    async def _method(self: FrappeClient, method: str, **kw: Any) -> Any:
        calls.append((method, kw.get("json") or kw.get("params")))
        if method not in answers:
            raise AssertionError(f"unexpected {method}")
        out = answers[method]
        if isinstance(out, Exception):
            raise out
        return out

    monkeypatch.setattr(FrappeClient, "health", _ok)
    monkeypatch.setattr(FrappeClient, "method", _method)
    return calls


# ---------------------------------------------------------------- leave decisions


@pytest.mark.asyncio
async def test_leave_act_goes_through_the_approvals_handler(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, {"eswasa_governance.api.act_on_approval": {"ok": True}, "frappe.client.get": LEAVE})
    r = await client.post("/api/hr/leave/LA-9/act", json={"decision": "approve", "confirm": True})
    assert r.status_code == 200, r.text
    assert r.json() == {"id": "LA-9", "employee": "Thandi Dlamini", "leave_type": "Annual Leave",
                        "from_date": "2026-10-20", "to_date": "2026-10-22", "status": "Approved", "days": None}
    assert calls[0] == ("eswasa_governance.api.act_on_approval",
                        {"doctype": "Leave Application", "name": "LA-9", "action": "approve", "comment": None, "confirm": True})
    assert [m for m, _ in calls] == ["eswasa_governance.api.act_on_approval", "frappe.client.get"]


@pytest.mark.asyncio
@pytest.mark.parametrize("roles", [["ESWASA Staff", "HR User"]])
async def test_leave_act_non_approver_gets_403_with_the_reason(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    text = "Only the employee's leave approver or the HR Manager can decide this request."
    _frappe(monkeypatch, {"eswasa_governance.api.act_on_approval": _thrown("PermissionError", text)})
    r = await client.post("/api/hr/leave/LA-9/act", json={"decision": "approve", "confirm": True})
    assert r.status_code == 403
    assert r.json()["detail"] == text


@pytest.mark.asyncio
async def test_leave_reject_without_a_note_is_refused_in_plain_words(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    text = "Say why you're not approving it. The employee sees your note."
    _frappe(monkeypatch, {"eswasa_governance.api.act_on_approval": _thrown("ValidationError", text)})
    r = await client.post("/api/hr/leave/LA-9/act", json={"decision": "reject", "confirm": True})
    assert r.status_code == 400
    assert r.json()["detail"] == text


def test_frappe_insufficient_permission_text_stays_generic() -> None:
    from fastapi import HTTPException

    from app.frappe_errors import raise_from_frappe

    with pytest.raises(HTTPException) as e:
        raise_from_frappe(FrappeError("frappe.exceptions.PermissionError: Insufficient Permission for Employee", status_code=403))
    assert e.value.status_code == 403
    assert e.value.detail.startswith("You don't have permission to access Employee")


# ---------------------------------------------------------------- people


@pytest.mark.asyncio
async def test_create_employee_keeps_body_and_response(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, {"eswasa_hr.employees.create": EMPLOYEE})
    body = {"employee_name": "Nomsa Mabuza", "email": "nomsa@x", "department": "Metrology - ESW", "designation": None,
            "invite": False, "confirm": True}
    r = await client.post("/api/hr/employees", json=body)
    assert r.status_code == 201, r.text
    assert (r.json()["id"], r.json()["employee_name"], r.json()["department"]) == ("HR-EMP-9", "Nomsa Mabuza", "Metrology - ESW")
    method, sent = calls[0]
    assert method == "eswasa_hr.employees.create"
    assert (sent["employee_name"], sent["email"], sent["department"], sent["invite"], sent["confirm"]) == ("Nomsa Mabuza", "nomsa@x", "Metrology - ESW", False, 1)
    assert "company" not in sent  # the company comes from Frappe defaults


@pytest.mark.asyncio
async def test_create_employee_missing_hrms_fields_is_a_plain_422(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    text = "Gender is required. Date of birth is required. Date of joining is required."
    _frappe(monkeypatch, {"eswasa_hr.employees.create": _thrown("ValidationError", text)})
    r = await client.post("/api/hr/employees", json={"employee_name": "Nomsa Mabuza", "confirm": True})
    assert r.status_code == 422
    assert r.json()["detail"] == text


@pytest.mark.asyncio
async def test_patch_employee_goes_through_update(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _frappe(monkeypatch, {"eswasa_hr.employees.update": EMPLOYEE})
    r = await client.patch("/api/hr/employees/HR-EMP-9", json={"employee_name": "Nomsa Mabuza", "email": "n@x", "confirm": True})
    assert r.status_code == 200, r.text
    assert calls == [("eswasa_hr.employees.update", {"employee": "HR-EMP-9", "changes": {"employee_name": "Nomsa Mabuza", "company_email": "n@x"}, "confirm": 1})]


# ---------------------------------------------------------------- structure


@pytest.mark.asyncio
async def test_create_department_goes_through_master_data(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    row = {"name": "Standards - ESW", "department_name": "Standards", "company": "ESWASA", "parent_department": "All Departments", "disabled": 0}
    calls = _frappe(monkeypatch, {"eswasa_hr.master_data.create_department": row})
    r = await client.post("/api/hr/departments", json={"name": "Standards", "confirm": True})
    assert r.status_code == 201, r.text
    assert (r.json()["id"], r.json()["name"], r.json()["status"]) == ("Standards - ESW", "Standards", "active")
    assert calls == [("eswasa_hr.master_data.create_department",
                      {"name": "Standards", "parent_department_id": None, "cost_centre_id": None, "confirm": 1})]


@pytest.mark.asyncio
async def test_disable_in_use_department_returns_the_reason(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    text = "3 active people and 1 submitted Staffing Plan still use this department."
    _frappe(monkeypatch, {"eswasa_hr.master_data.update_department": _thrown("ValidationError", text)})
    r = await client.patch("/api/hr/departments/Metrology - ESW", json={"status": "archived", "confirm": True})
    assert (r.status_code, r.json()["detail"]) == (422, text)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path,method,kind",
    [
        ("/api/hr/designations", "create_designation", {"title": "Officer"}),
        ("/api/hr/locations", "create_location", {"name": "Matsapha"}),
        ("/api/hr/cost-centres", "create_cost_centre", {"name": "Lab"}),
        ("/api/hr/grade-bands", "create_grade_band", {"code": "G5"}),
    ],
)
async def test_other_master_data_creates(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, path: str, method: str, kind: dict[str, Any]) -> None:
    row = {"name": "X-1", "designation_name": "Officer", "branch": "Matsapha", "cost_center_name": "Lab"}
    calls = _frappe(monkeypatch, {f"eswasa_hr.master_data.{method}": row})
    r = await client.post(path, json={**kind, "confirm": True})
    assert r.status_code == 201, r.text
    assert calls[0][0] == f"eswasa_hr.master_data.{method}"


@pytest.mark.asyncio
async def test_company_profile_is_system_manager_only(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _frappe(monkeypatch, {})
    r = await client.post("/api/hr/organisation", json={"legal_name": "ESWASA", "confirm": True})
    assert r.status_code == 403
    r = await client.patch("/api/hr/organisation", json={"legal_name": "ESWASA", "confirm": True})
    assert r.status_code == 403


# ---------------------------------------------------------------- removed routes


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/hr/summary"),
        ("GET", "/api/hr/overview"),
        ("GET", "/api/hr/jobs"),
        ("POST", "/api/hr/jobs"),
        ("GET", "/api/hr/applicants"),
        ("GET", "/api/hr/appraisals"),
        ("GET", "/api/hr/attendance"),
        ("GET", "/api/hr/out-today"),
        ("DELETE", "/api/hr/departments/Metrology%20-%20ESW?confirm=true"),
        ("DELETE", "/api/hr/designations/Officer?confirm=true"),
    ],
)
async def test_removed_routes_are_gone(client: AsyncClient, method: str, path: str) -> None:
    r = await client.request(method, path, json={} if method == "POST" else None)
    assert r.status_code in (404, 405), (method, path, r.status_code)


# ---------------------------------------------------------------- static guard

PROTECTED = {"Employee", "Leave Application", "Job Opening", "Department", "Designation", "Branch", "Cost Center", "Employee Grade"}
WRITE_HELPERS = {"_frappe_insert", "_frappe_set_value", "_frappe_delete"}
WRITE_METHODS = {"frappe.client.insert", "frappe.client.set_value", "frappe.client.delete", "frappe.client.submit", "frappe.client.save"}
# Each entry says why the raw write is acceptable.
ALLOWED = {
    "assign_hr_department_head": "the one place a department head is set (plan 01 keeps it)",
    "clear_hr_department_head": "the one place a department head is cleared",
}


def _doctypes_written(fn: ast.AST, consts: dict[str, str]) -> set[str]:
    found: set[str] = set()
    writes = False
    for node in ast.walk(fn):
        if isinstance(node, ast.Call):
            f = node.func
            name = f.id if isinstance(f, ast.Name) else f.attr if isinstance(f, ast.Attribute) else None
            if name in WRITE_HELPERS:
                writes = True
                if len(node.args) > 1:
                    arg = node.args[1]
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                        found.add(arg.value)
                    elif isinstance(arg, ast.Name) and arg.id in consts:
                        found.add(consts[arg.id])
            elif name == "method" and node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value in WRITE_METHODS:
                writes = True
        if isinstance(node, ast.Dict):
            for k, v in zip(node.keys, node.values):
                if isinstance(k, ast.Constant) and k.value == "doctype":
                    if isinstance(v, ast.Constant) and isinstance(v.value, str):
                        found.add(v.value)
                    elif isinstance(v, ast.Name) and v.id in consts:
                        found.add(consts[v.id])
    return found if writes else set()


def test_router_never_writes_hr_doctypes_directly() -> None:
    tree = ast.parse(ROUTER.read_text())
    consts = {
        t.id: n.value.value
        for n in tree.body
        if isinstance(n, ast.Assign) and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str)
        for t in n.targets
        if isinstance(t, ast.Name)
    }
    offenders = []
    for fn in tree.body:
        if isinstance(fn, (ast.AsyncFunctionDef, ast.FunctionDef)) and fn.name not in ALLOWED:
            hit = _doctypes_written(fn, consts) & PROTECTED
            if hit:
                offenders.append(f"{fn.name} (line {fn.lineno}): {sorted(hit)}")
    assert not offenders, "Route these through an eswasa_hr method:\n" + "\n".join(offenders)


def test_allow_list_is_current() -> None:
    names = {n.name for n in ast.parse(ROUTER.read_text()).body if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))}
    assert set(ALLOWED) <= names
