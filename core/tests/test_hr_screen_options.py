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
