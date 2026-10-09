"""Tool registry — OpenAPI-aligned agent tools; WS2/WS3/WS8 Frappe methods."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from app.frappe_client import FrappeClient, FrappeError, get_frappe_client

ToolHandler = Callable[[dict[str, Any], dict[str, Any]], Awaitable[dict[str, Any]]]


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]
    mutates: bool = False
    handler: ToolHandler | None = None


TOOLS: list[ToolSpec] = []
_BY_NAME: dict[str, ToolSpec] = {}


def register(tool: ToolSpec) -> ToolSpec:
    TOOLS.append(tool)
    _BY_NAME[tool.name] = tool
    return tool


def get_tool(name: str) -> ToolSpec | None:
    return _BY_NAME.get(name)


def openai_tools() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            },
        }
        for t in TOOLS
    ]


def list_tool_names() -> list[str]:
    return [t.name for t in TOOLS]


def _client_from_ctx(ctx: dict[str, Any]) -> FrappeClient:
    client = get_frappe_client()
    sid = ctx.get("frappe_sid")
    if sid:
        return client.with_session(sid)
    key, secret = ctx.get("frappe_api_key"), ctx.get("frappe_api_secret")
    if key and secret:
        return client.with_token(str(key), str(secret))
    if ctx.get("is_guest"):
        settings = client.settings
        if settings.frappe_guest_api_key and settings.frappe_guest_api_secret:
            return client.with_token(
                settings.frappe_guest_api_key,
                settings.frappe_guest_api_secret,
            )
        return client
    return client


async def _search_standards(args: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    client = _client_from_ctx(ctx)
    if not ctx.get("mock") and await client.health():
        try:
            raw = await client.method(
                "eswasa_standards.api.list_standards",
                params={"q": args.get("q"), "sector": args.get("sector")},
            )
            return raw if isinstance(raw, dict) else {"items": raw}
        except FrappeError:
            pass
    from app.gateway.mocks import mock_standards

    return {"items": [i.model_dump() for i in mock_standards(args.get("q"), args.get("sector"))]}


async def _list_applications(args: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    client = _client_from_ctx(ctx)
    if not ctx.get("mock") and await client.health():
        try:
            raw = await client.method(
                "eswasa_certification.api.list_applications",
                params={"status": args.get("status"), "limit": args.get("limit") or 20},
            )
            return raw if isinstance(raw, dict) else {"items": raw}
        except FrappeError:
            pass
    from app.gateway.mocks import mock_applications

    items = mock_applications(args.get("status"), int(args.get("limit") or 20))
    return {"items": [i.model_dump() for i in items]}


async def _list_overdue_audits(args: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    client = _client_from_ctx(ctx)
    if not ctx.get("mock") and await client.health():
        try:
            raw = await client.method(
                "eswasa_certification.api.list_overdue",
                params={"auditor": args.get("auditor"), "scheme": args.get("scheme")},
            )
            return raw if isinstance(raw, dict) else {"items": raw}
        except FrappeError:
            pass
    from app.gateway.mocks import mock_overdue_audits

    items = mock_overdue_audits(args.get("auditor"), args.get("scheme"))
    return {"items": [i.model_dump() for i in items]}


async def _create_application(args: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    client = _client_from_ctx(ctx)
    if not ctx.get("mock") and await client.health():
        try:
            raw = await client.method(
                "eswasa_certification.api.create_application",
                json={
                    "scheme": args.get("scheme"),
                    "applicant_name": args.get("applicant_name"),
                    "contact_email": args.get("contact_email"),
                    "confirm": True,
                },
            )
            return raw if isinstance(raw, dict) else {"result": raw}
        except FrappeError as exc:
            return {"error": str(exc)}
    return {
        "status": "created_stub",
        "scheme": args.get("scheme"),
        "applicant_name": args.get("applicant_name"),
        # TODO: wire real when Frappe session available
    }


async def _check_applicability(args: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    from app.gateway.router import build_applicability
    from app.identity.deps import AuthContext
    from app.schemas import ApplicabilityRequest, SessionUser

    body = ApplicabilityRequest(
        query=str(args.get("query") or ""),
        jurisdiction=args.get("jurisdiction"),
        sector=args.get("sector"),
        hs_code=args.get("hs_code"),
    )
    auth = AuthContext(
        token="",
        user=SessionUser(
            username=str(ctx.get("username") or "agent"),
            full_name=str(ctx.get("username") or "agent"),
            roles=list(ctx.get("roles") or []),
        ),
        frappe_sid=ctx.get("frappe_sid"),
        mock=bool(ctx.get("mock")),
        is_guest=bool(ctx.get("is_guest")),
        frappe_api_key=ctx.get("frappe_api_key"),
        frappe_api_secret=ctx.get("frappe_api_secret"),
    )
    result = await build_applicability(body, auth=auth, frappe=get_frappe_client())
    return result.model_dump()


async def _verify_mark(args: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    client = get_frappe_client()
    token = str(args.get("token") or "")
    if await client.health():
        try:
            raw = await client.method(
                "eswasa_verification.api.verify_token",
                params={"token": token},
            )
            return raw if isinstance(raw, dict) else {"result": raw}
        except FrappeError:
            pass
    from app.gateway.mocks import mock_verify

    return mock_verify(token).model_dump()


async def _ask_analytics(args: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    """Staff analytics NL bridge — no mock KPI fallback."""
    from app.gateway import analytics as analytics_bridge

    question = str(args.get("question") or args.get("q") or "").strip()
    if not question:
        return {"error": "question is required"}
    if ctx.get("mock") or ctx.get("is_guest"):
        return {"error": "Frappe unavailable: analytics requires an authenticated live session"}
    client = _client_from_ctx(ctx)
    if not await client.health():
        return {"error": "Frappe unavailable: analytics requires live data"}
    try:
        return await analytics_bridge.ask_analytics(client, question)
    except FrappeError as exc:
        return {"error": str(exc)}


def bootstrap_tools() -> None:
    if TOOLS:
        return
    register(
        ToolSpec(
            name="search_standards",
            description="Search published standards summaries (no licensed full text).",
            parameters={
                "type": "object",
                "properties": {
                    "q": {"type": "string"},
                    "sector": {"type": "string"},
                },
            },
            handler=_search_standards,
        )
    )
    register(
        ToolSpec(
            name="list_certification_applications",
            description="List certification applications visible to the current user.",
            parameters={
                "type": "object",
                "properties": {
                    "status": {"type": "string"},
                    "limit": {"type": "integer"},
                },
            },
            handler=_list_applications,
        )
    )
    register(
        ToolSpec(
            name="list_overdue_audits",
            description="List overdue certification audits (Ask: show overdue audits).",
            parameters={
                "type": "object",
                "properties": {
                    "auditor": {"type": "string"},
                    "scheme": {"type": "string"},
                },
            },
            handler=_list_overdue_audits,
        )
    )
    register(
        ToolSpec(
            name="create_certification_application",
            description="Create a certification application (requires user confirmation).",
            parameters={
                "type": "object",
                "properties": {
                    "scheme": {"type": "string"},
                    "applicant_name": {"type": "string"},
                    "contact_email": {"type": "string"},
                },
                "required": ["scheme", "applicant_name"],
            },
            mutates=True,
            handler=_create_application,
        )
    )
    register(
        ToolSpec(
            name="check_applicability",
            description="Guided standards/regulation applicability via ingest + TBT RAG.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "jurisdiction": {"type": "string"},
                    "sector": {"type": "string"},
                    "hs_code": {"type": "string"},
                },
                "required": ["query"],
            },
            handler=_check_applicability,
        )
    )
    register(
        ToolSpec(
            name="verify_mark",
            description="Verify a public certificate / mark token.",
            parameters={
                "type": "object",
                "properties": {"token": {"type": "string"}},
                "required": ["token"],
            },
            handler=_verify_mark,
        )
    )
    register(
        ToolSpec(
            name="ask_analytics",
            description=(
                "Institution analytics: revenue, certificates, audits, headcount, "
                "budget, plan traffic lights (live Frappe metrics only)."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "Natural-language metric question",
                    },
                },
                "required": ["question"],
            },
            handler=_ask_analytics,
        )
    )


bootstrap_tools()
