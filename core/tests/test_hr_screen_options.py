"""Screen ↔ backend sweep: the choices HR screens read (expense form, correction fields, Add person genders,
document types) pass through from eswasa_hr, and a Frappe outage is a 503 the screen shows, not invented options."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from tests.test_hr_expenses import _frappe, client  # noqa: F401  (fixture)


@pytest.mark.asyncio
async def test_expense_options(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    calls = _frappe(monkeypatch, lambda m: {"types": ["Travel"], "receipt_required_above": 200.0, "awaiting": None})
    r = await client.get("/api/hr/me/expense-claims/options")
    assert r.status_code == 200, r.text
    assert r.json() == {"types": ["Travel"], "receipt_required_above": 200.0, "awaiting": None}
    assert calls[0][0] == "eswasa_hr.expenses.options"


@pytest.mark.asyncio
async def test_expense_options_awaiting_finance(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    _frappe(monkeypatch, lambda m: {"types": [], "receipt_required_above": None, "awaiting": "ESWASA Finance"})
    assert (await client.get("/api/hr/me/expense-claims/options")).json()["awaiting"] == "ESWASA Finance"


@pytest.mark.asyncio
async def test_profile_changes_carry_the_fields(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    field = {"field": "last_name", "label": "Last name", "evidence_required": True}

    def handler(m: str) -> Any:
        return [field] if m.endswith(".fields") else []

    calls = _frappe(monkeypatch, handler)
    body = (await client.get("/api/hr/me/profile-changes")).json()
    assert body == {"items": [], "fields": [field]}
    assert [c[0] for c in calls] == ["eswasa_hr.profile_changes.mine", "eswasa_hr.profile_changes.fields"]


@pytest.mark.asyncio
async def test_employee_options(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    calls = _frappe(monkeypatch, lambda m: {"genders": ["Female", "Male"]})
    assert (await client.get("/api/hr/employee-options")).json() == {"genders": ["Female", "Male"]}
    assert calls[0][0] == "eswasa_hr.employees.form_options"


@pytest.mark.asyncio
async def test_documents_carry_types(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    _frappe(monkeypatch, lambda m: {"employee": "E1", "items": [], "missing": [], "required_set": False, "types": ["ID", "Other"]})
    assert (await client.get("/api/hr/me/documents")).json()["types"] == ["ID", "Other"]


@pytest.mark.asyncio
async def test_frappe_down_is_a_503(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    _frappe(monkeypatch, lambda m: {}, up=False)
    for path in ("/api/hr/me/expense-claims/options", "/api/hr/employee-options", "/api/hr/me/profile-changes"):
        assert (await client.get(path)).status_code == 503, path


# Department head: the screen's Set/Remove head must never see a success that wasn't saved.

def _dept(monkeypatch: pytest.MonkeyPatch, doc: dict[str, Any], set_error: Exception | None = None) -> list[tuple]:
    from app.frappe_client import FrappeClient
    from app.gateway import router as r

    sets: list[tuple] = []

    async def _health(self: FrappeClient) -> bool:
        return True

    async def _get_doc(session, doctype, name, soft=False):  # noqa: ANN001
        return dict(doc) if doctype == "Department" else {"name": name, "employee_name": "Sipho Magagula"}

    async def _set_value(session, doctype, name, field, value=None):  # noqa: ANN001
        if set_error:
            raise set_error
        sets.append((doctype, name, field, value))

    monkeypatch.setattr(FrappeClient, "health", _health)
    monkeypatch.setattr(r, "_frappe_get_doc", _get_doc)
    monkeypatch.setattr(r, "_frappe_set_value", _set_value)
    return sets


@pytest.mark.asyncio
async def test_set_head_without_a_head_field_is_refused_not_faked(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    from app.frappe_client import FrappeError

    _dept(monkeypatch, {"name": "Certification - ES", "department_name": "Certification"}, set_error=FrappeError("no field", status_code=417))
    r = await client.post("/api/hr/departments/Certification - ES/head", json={"employee_id": "HR-EMP-0002", "confirm": True})
    assert r.status_code == 503
    assert "bench migrate" in r.json()["detail"]


@pytest.mark.asyncio
async def test_remove_head_clears_custom_head(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    sets = _dept(monkeypatch, {"name": "Certification - ES", "department_name": "Certification", "custom_head": "HR-EMP-0002"})
    assert (await client.delete("/api/hr/departments/Certification - ES/head")).status_code == 400  # confirm required
    r = await client.delete("/api/hr/departments/Certification - ES/head", params={"confirm": "true"})
    assert r.status_code == 200, r.text
    assert sets == [("Department", "Certification - ES", "custom_head", "")]


@pytest.mark.asyncio
async def test_remove_head_failure_is_reported(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    from app.frappe_client import FrappeError

    _dept(monkeypatch, {"name": "D", "custom_head": "E"}, set_error=FrappeError('Frappe POST /api/method/x failed: {"exception": "frappe.exceptions.PermissionError: Not permitted"}', status_code=403))
    r = await client.delete("/api/hr/departments/D/head", params={"confirm": "true"})
    assert r.status_code == 403
