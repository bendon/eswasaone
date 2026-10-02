"""Agent guardrails — permission-aware; mutates require confirm; licence rules."""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from typing import Any

from app.agent.tool_registry import ToolSpec, get_tool
from app.identity.deps import AuthContext, assert_tool_allowed
from app.audit import audit_log
from app.schemas import BuyLink, Citation, PendingAction, SessionUser


@dataclass
class PendingStore:
    """In-process pending mutate actions awaiting confirm_action_id."""

    items: dict[str, dict[str, Any]] = field(default_factory=dict)

    def put(self, tool: str, args: dict[str, Any], actor: str) -> PendingAction:
        action_id = secrets.token_urlsafe(12)
        self.items[action_id] = {
            "tool": tool,
            "args": args,
            "actor": actor,
        }
        return PendingAction(
            id=action_id,
            tool=tool,
            summary=f"Confirm {tool} with args {args}",
            mutates=True,
        )

    def pop(self, action_id: str) -> dict[str, Any] | None:
        return self.items.pop(action_id, None)


_pending = PendingStore()


def get_pending_store() -> PendingStore:
    return _pending


def enforce_licence(citations: list[Citation]) -> tuple[list[Citation], list[BuyLink]]:
    """
    Open/public sources may include excerpts.
    Licensed sources: paraphrase-and-cite only — strip excerpt, add buy link.
    """
    cleaned: list[Citation] = []
    buy_links: list[BuyLink] = []
    for c in citations:
        if c.rights == "licensed":
            cleaned.append(
                Citation(
                    source_id=c.source_id,
                    title=c.title,
                    rights=c.rights,
                    url=c.url,
                    excerpt=None,
                )
            )
            buy_links.append(
                BuyLink(
                    standard_code=c.source_id,
                    title=c.title,
                    url=c.url or f"/estore/{c.source_id}",
                )
            )
        else:
            cleaned.append(c)
    return cleaned, buy_links


async def run_tool_with_guardrails(
    *,
    tool_name: str,
    args: dict[str, Any],
    actor: str,
    confirm_action_id: str | None,
    context: dict[str, Any],
) -> tuple[dict[str, Any] | None, PendingAction | None, str | None]:
    """
    Returns (result, pending_action, error).
    Mutating tools never execute without a matching confirm_action_id.
    """
    tool = get_tool(tool_name)
    if tool is None:
        return None, None, f"Unknown tool: {tool_name}"
    if tool.handler is None:
        return None, None, f"Tool not implemented: {tool_name}"

    # Guest hitting permissioned tool → AuthRequired (401), never 500
    assert_tool_allowed(
        AuthContext(
            token="",
            user=SessionUser(
                username=actor,
                full_name=actor,
                roles=list(context.get("roles") or []),
            ),
            frappe_sid=context.get("frappe_sid"),
            mock=bool(context.get("mock")),
            is_guest=bool(context.get("is_guest")),
        ),
        tool_name,
    )

    if tool.mutates:
        store = get_pending_store()
        if confirm_action_id:
            pending = store.pop(confirm_action_id)
            if not pending or pending["tool"] != tool_name:
                return None, None, "Invalid or expired confirm_action_id"
            args = pending.get("args") or args
            audit_log(
                action=f"agent.tool.{tool_name}",
                actor=actor,
                resource=tool_name,
                detail=args,
                confirmed=True,
            )
            result = await tool.handler(args, context)
            return result, None, None

        pending_action = store.put(tool_name, args, actor)
        audit_log(
            action=f"agent.tool.{tool_name}.pending",
            actor=actor,
            resource=tool_name,
            detail=args,
            confirmed=False,
        )
        return None, pending_action, None

    result = await tool.handler(args, context)
    return result, None, None


def paraphrase_licensed_answer(message: str, citations: list[Citation]) -> str:
    """Ensure answers never paste licensed full text."""
    licensed = [c for c in citations if c.rights == "licensed"]
    if not licensed:
        return message
    note = (
        " Licensed standards are summarised only; purchase full text via the e-store links."
    )
    if note.strip() not in message:
        return message.rstrip() + note
    return message
