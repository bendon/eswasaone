"""Agent ask orchestration — function-calling pattern + RAG + guardrails."""

from __future__ import annotations

import logging
import re
from typing import Any

from app.agent.guardrails import (
    enforce_licence,
    get_pending_store,
    paraphrase_licensed_answer,
    run_tool_with_guardrails,
)
from app.agent.rag import search_sources
from app.agent.tool_registry import list_tool_names
from app.schemas import AgentAskRequest, AgentAskResponse, Citation

logger = logging.getLogger(__name__)

# Simple intent → tool mapping until LLM_API_KEY is configured
_INTENT_PATTERNS: list[tuple[re.Pattern[str], str, dict[str, Any]]] = [
    (re.compile(r"\boverdue\b.*\baudit|\baudit\b.*\boverdue", re.I), "list_overdue_audits", {}),
    (
        re.compile(
            r"\brevenue|\bbudget|\bheadcount|\banalytics|\bkpi|\btraffic\s*light|"
            r"\bhow many\b.*\b(certificat|application|employee|enrol)",
            re.I,
        ),
        "ask_analytics",
        {},
    ),
    (re.compile(r"\bverify\b|\bmark\b|\bcertificate\b", re.I), "verify_mark", {}),
    (re.compile(r"\bapplicab|\bhs\s*code|\bregul|\btbt\b|\beping\b", re.I), "check_applicability", {}),
    (
        re.compile(r"\bcreate\b.*\bapplication\b|\bapply\b", re.I),
        "create_certification_application",
        {},
    ),
    (re.compile(r"\bapplication", re.I), "list_certification_applications", {}),
    (re.compile(r"\bstandard|\bszns|\bestore", re.I), "search_standards", {}),
]


def _infer_tool_call(message: str) -> tuple[str, dict[str, Any]] | None:
    for pattern, tool_name, base_args in _INTENT_PATTERNS:
        if pattern.search(message):
            args = dict(base_args)
            if tool_name == "search_standards":
                args["q"] = message
            elif tool_name == "check_applicability":
                args["query"] = message
            elif tool_name == "verify_mark":
                m = re.search(r"(ESW-[A-Z0-9-]+|CERT-[A-Z0-9-]+)", message, re.I)
                args["token"] = m.group(1) if m else message.strip().split()[-1]
            elif tool_name == "create_certification_application":
                args.setdefault("scheme", "Product Certification")
                args.setdefault("applicant_name", "Applicant")
            elif tool_name == "ask_analytics":
                args["question"] = message
            return tool_name, args
    return None


async def handle_ask(
    body: AgentAskRequest,
    *,
    actor: str,
    context: dict[str, Any] | None = None,
) -> AgentAskResponse:
    ctx = {**(context or {}), **(body.context or {})}
    tools_used: list[str] = []
    pending = None
    tool_result: dict[str, Any] | None = None

    if body.confirm_action_id:
        stored = get_pending_store().items.get(body.confirm_action_id)
        tool_name = stored["tool"] if stored else "create_certification_application"
        result, pending, err = await run_tool_with_guardrails(
            tool_name=tool_name,
            args=(stored or {}).get("args") or {},
            actor=actor,
            confirm_action_id=body.confirm_action_id,
            context=ctx,
        )
        if err:
            return AgentAskResponse(answer=err, tools_used=tools_used)
        tools_used.append(tool_name)
        tool_result = result
    else:
        inferred = _infer_tool_call(body.message)
        if inferred:
            tool_name, args = inferred
            # TODO: wire real LLM function-calling when LLM_API_KEY is set
            result, pending, err = await run_tool_with_guardrails(
                tool_name=tool_name,
                args=args,
                actor=actor,
                confirm_action_id=None,
                context=ctx,
            )
            if err:
                return AgentAskResponse(answer=err, tools_used=tools_used)
            tools_used.append(tool_name)
            if pending:
                return AgentAskResponse(
                    answer=(
                        "This action will change data. Confirm to proceed "
                        f"(action id: {pending.id})."
                    ),
                    tools_used=tools_used,
                    pending_action=pending,
                )
            tool_result = result

    hits = await search_sources(body.message, limit=3)
    citations = [
        Citation(
            source_id=h["source_id"],
            title=h["title"],
            rights=h["rights"],
            url=h.get("url"),
            excerpt=h.get("excerpt"),
        )
        for h in hits
    ]
    citations, buy_links = enforce_licence(citations)

    if tool_result is not None:
        answer = f"Tool result for your request: {tool_result}"
    else:
        answer = (
            f"I searched standards and open sources for “{body.message}”. "
            f"Available tools: {', '.join(list_tool_names())}."
        )
    answer = paraphrase_licensed_answer(answer, citations)

    return AgentAskResponse(
        answer=answer,
        citations=citations,
        tools_used=tools_used or None,
        pending_action=pending,
        buy_links=buy_links or None,
    )
