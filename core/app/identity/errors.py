"""Auth error types — 401 bodies match AuthRequiredError contract."""

from __future__ import annotations


class AuthRequired(Exception):
    """Raised when a session is required; handled as top-level JSON 401."""

    def __init__(self, reason: str | None = None, detail: str | None = None) -> None:
        self.reason = reason
        self.detail = detail or "Authentication required"
        super().__init__(self.detail)
