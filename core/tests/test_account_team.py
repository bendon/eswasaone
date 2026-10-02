"""Account team helpers + invite validation smoke."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.account.router import _build_team_items, _designation_to_role
from app.main import app
from tests.auth_helpers import login_full_session


@pytest.fixture(autouse=True)
def _allow_mock_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORE_ALLOW_MOCK_AUTH", "true")


def test_designation_to_role_maps_common_labels():
    assert _designation_to_role("Admin") == ("admin", "Admin")
    assert _designation_to_role("viewer") == ("viewer", "Viewer")
    assert _designation_to_role("External · Auditor")[0] == "viewer"
    assert _designation_to_role(None) == ("member", "Member")


def test_build_team_items_dedupes_owner_contact():
    customer = {
        "name": "CUST-1",
        "customer_name": "Ubombo Honey",
        "email_id": "james@ubombohoney.co.sz",
        "creation": "2025-01-15 10:00:00",
    }
    contacts = [
        {
            "name": "CONT-1",
            "first_name": "James",
            "last_name": "Chelogoi",
            "email_id": "james@ubombohoney.co.sz",
            "designation": "Owner",
            "modified": "2025-02-01 10:00:00",
        },
        {
            "name": "CONT-2",
            "first_name": "Nomsa",
            "last_name": "Mabuza",
            "email_id": "nomsa@ubombohoney.co.sz",
            "designation": "Admin",
            "modified": "2025-03-01 10:00:00",
        },
    ]
    items = _build_team_items(
        customer=customer,
        contacts=contacts,
        owner_fallback_name="James Chelogoi",
        owner_fallback_email="james@ubombohoney.co.sz",
    )
    assert len(items) == 2
    assert items[0].role == "owner"
    assert items[0].email == "james@ubombohoney.co.sz"
    assert items[1].role == "admin"
    assert items[1].email == "nomsa@ubombohoney.co.sz"


@pytest.mark.asyncio
async def test_team_personal_empty_and_invite_requires_confirm():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        body = await login_full_session(client)
        headers = {"Authorization": f"Bearer {body['access_token']}"}
        personal = await client.get(
            "/api/account/team",
            params={"entity": "personal"},
            headers=headers,
        )
        assert personal.status_code == 200
        assert personal.json()["items"] == []

        bad = await client.post(
            "/api/account/team/invite",
            headers=headers,
            json={"email": "colleague@example.com", "role": "member", "confirm": False},
        )
        assert bad.status_code == 400
