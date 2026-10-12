"""Plan 07: an assignment guard's refusal (frappe.throw in eswasa_hr / eswasa_certification) reaches the
portal as the same sentence, through raise_from_frappe."""

from __future__ import annotations

import json

import pytest
from fastapi import HTTPException

from app.frappe_client import FrappeError
from app.frappe_errors import raise_from_frappe

REASONS = [
    "Thandi Mamba's authorisation for FSMS expires on 30 November 2026, before the audit on 3 December 2026.",
    "Thandi Mamba has no signed impartiality declaration for 2026/27.",
    "Thandi Mamba has declared an interest in Sample Foods Ltd, so can't act on its work.",
    "Thandi Mamba is on approved leave 2 Nov 2026–6 Nov 2026, so can't take this calibration job.",
]


def _body(reason: str, via_messages: bool) -> str:
    if via_messages:  # a Desk-style save: the readable line is in _server_messages
        data = {"exc_type": "ValidationError", "_server_messages": json.dumps([json.dumps({"message": reason})])}
    else:
        data = {"exception": f"frappe.exceptions.ValidationError: {reason}"}
    return f"Frappe POST /api/method/frappe.client.save failed: {json.dumps(data)}"


@pytest.mark.parametrize("via_messages", [False, True])
@pytest.mark.parametrize("reason", REASONS)
def test_guard_reason_passes_through(reason: str, via_messages: bool) -> None:
    with pytest.raises(HTTPException) as caught:
        raise_from_frappe(FrappeError(_body(reason, via_messages), status_code=417))
    assert caught.value.status_code == 400
    assert caught.value.detail == reason
