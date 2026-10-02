"""Identity package — cookie+Bearer sessions; RBAC delegated to Frappe."""

from app.identity.deps import (
    AuthContext,
    GUEST_ALLOWED_TOOLS,
    STAFF_ROLES,
    assert_tool_allowed,
    get_actor,
    get_optional_auth,
    has_staff_role,
    require_auth,
    require_auth_csrf,
    require_csrf,
    require_staff,
)

__all__ = [
    "AuthContext",
    "GUEST_ALLOWED_TOOLS",
    "STAFF_ROLES",
    "assert_tool_allowed",
    "get_actor",
    "get_optional_auth",
    "has_staff_role",
    "require_auth",
    "require_auth_csrf",
    "require_csrf",
    "require_staff",
]
