"""Gate mock login/register — production-ish demos must not silent-mock."""

from __future__ import annotations

import os

from app.frappe_client import FrappeError


def mock_auth_explicitly_allowed() -> bool:
    """True only when CORE_ALLOW_MOCK_AUTH is explicitly enabled."""
    flag = os.getenv("CORE_ALLOW_MOCK_AUTH", "").strip().lower()
    return flag in ("1", "true", "yes", "on")


def is_frappe_unreachable(exc: FrappeError) -> bool:
    """Transport / ping failure — not a credentials or validation rejection."""
    msg = str(exc).lower()
    if "unreachable" in msg:
        return True
    if exc.status_code is None and any(
        token in msg for token in ("connect", "timeout", "name or service", "refused")
    ):
        return True
    return False


def mock_auth_permitted(exc: FrappeError) -> bool:
    """Allow mock Citizen sessions only if flagged or Frappe is down."""
    return mock_auth_explicitly_allowed() or is_frappe_unreachable(exc)


def is_conflict(exc: FrappeError) -> bool:
    """Duplicate user / already registered."""
    if exc.status_code == 409:
        return True
    msg = str(exc).lower()
    return any(
        token in msg
        for token in (
            "duplicate",
            "already exists",
            "already registered",
            "uniqueconstraint",
            "integrityerror",
        )
    )
