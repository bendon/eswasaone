"""Agent routes — /api/agent/* and /api/guide."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.agent.ask import handle_ask
from app.agent.guide import router as guide_router
from app.identity.deps import (
    AuthContext,
    assert_tool_allowed,
    get_actor,
    require_csrf,
)
from app.schemas import AgentAskRequest, AgentAskResponse

ask_router = APIRouter(prefix="/agent", tags=["agent"])


@ask_router.post("/ask", response_model=AgentAskResponse)
async def agent_ask(
    body: AgentAskRequest,
    request: Request,
    auth: Annotated[AuthContext, Depends(get_actor)],
) -> AgentAskResponse:
    """Guests get public tools only; permissioned tools → 401 auth_required."""
    require_csrf(request, auth)

    # Pre-check inferred mutate / permissioned tools for guests
    from app.agent.ask import _infer_tool_call

    inferred = _infer_tool_call(body.message) if not body.confirm_action_id else None
    if inferred:
        assert_tool_allowed(auth, inferred[0])
    if body.confirm_action_id:
        # Mutating confirm always needs a real session
        assert_tool_allowed(auth, "create_certification_application")

    return await handle_ask(
        body,
        actor=auth.user.username,
        context=auth.to_agent_context(),
    )


# Composite: /api/agent/ask + /api/guide (OpenAPI /guide — anonymous)
router = APIRouter()
router.include_router(ask_router)
router.include_router(guide_router)
