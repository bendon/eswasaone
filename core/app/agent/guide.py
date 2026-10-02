"""GuideCraft (WS10) — POST /api/guide.

Composes applicability (graph) + ordered steps + RAG + tool-registry actions
with rights-gated citations. Does not reimplement graph traversal.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agent.guardrails import enforce_licence
from app.agent.rag import search_sources
from app.agent.tool_registry import get_tool
from app.schemas import Citation

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agent"])

Rights = Literal["open", "public", "licensed"]
ActionType = Literal["buy", "apply", "book", "open"]

_AUTH_ACTION_TYPES: frozenset[str] = frozenset({"buy", "apply", "book"})

_FIXTURES_DIR = Path(__file__).resolve().parents[3] / "docs" / "fixtures"

_SEED_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    (
        "honey",
        re.compile(
            r"export\s+honey|honey\s+to\s+the\s+eu|honey.*eu|eu.*honey",
            re.IGNORECASE,
        ),
        "guide-honey.json",
    ),
    (
        "iso",
        re.compile(r"iso\s*9001|get\s+iso|qms|quality\s+management", re.IGNORECASE),
        "guide-iso9001.json",
    ),
    (
        "water",
        re.compile(r"bottled\s+water|sell\s+.*water|packaged\s+drinking", re.IGNORECASE),
        "",  # composed below — no separate fixture file
    ),
]


class GuideRequest(BaseModel):
    goal: str
    locale: str | None = None


class GuideMeta(BaseModel):
    standards: int
    est_fee: str
    est_timeline: str
    steps: int


class GuideCitation(BaseModel):
    label: str
    url: str
    rights: Rights


class GuideAction(BaseModel):
    type: ActionType
    label: str
    target: str
    auth_required: bool
    reason: str | None = None


class GuideStep(BaseModel):
    title: str
    detail: str
    citations: list[GuideCitation] = Field(default_factory=list)
    action: GuideAction | None = None


class GuideResponse(BaseModel):
    title: str
    summary: str
    meta: GuideMeta
    steps: list[GuideStep]


def _guest_ctx() -> dict[str, Any]:
    """Anonymous / guest service-account context for applicability."""
    return {
        "username": "guest",
        "roles": ["Guest"],
        "mock": True,
        "frappe_sid": None,
    }


def _detect_seed(goal: str) -> tuple[str, str] | None:
    for key, pattern, fixture in _SEED_PATTERNS:
        if pattern.search(goal):
            return key, fixture
    return None


def _load_fixture(name: str) -> GuideResponse | None:
    path = _FIXTURES_DIR / name
    if not path.is_file():
        logger.warning("Guide fixture missing: %s", path)
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    return GuideResponse.model_validate(raw)


def _map_action(
    action_type: ActionType,
    label: str,
    target: str,
    reason: str | None = None,
) -> GuideAction:
    """Map to tool-registry actions; buy/apply/book require auth."""
    auth_required = action_type in _AUTH_ACTION_TYPES
    default_reasons = {
        "buy": "Buying a standard requires an account so we can license the download to you.",
        "apply": "Applying creates a tracked case under your account.",
        "book": "Booking creates a tracked request under your account.",
    }
    # Ensure registry knows the related tool (buy→search_standards, apply→create, …)
    tool_hint = {
        "buy": "search_standards",
        "apply": "create_certification_application",
        "book": "create_certification_application",
        "open": "check_applicability",
    }.get(action_type)
    if tool_hint and get_tool(tool_hint) is None:
        logger.debug("tool registry missing %s for action %s", tool_hint, action_type)

    return GuideAction(
        type=action_type,
        label=label,
        target=target,
        auth_required=auth_required,
        reason=(reason or default_reasons.get(action_type)) if auth_required else reason,
    )


def _citation_from_rag(hit: dict[str, Any]) -> GuideCitation:
    rights = str(hit.get("rights") or "open").lower()
    if rights not in {"open", "public", "licensed"}:
        rights = "open"
    url = hit.get("url") or hit.get("buy_url") or "#"
    return GuideCitation(
        label=str(hit.get("title") or hit.get("source_id") or "Source"),
        url=str(url),
        rights=rights,  # type: ignore[arg-type]
    )


def _citation_from_schema(c: Citation) -> GuideCitation:
    return GuideCitation(
        label=c.title,
        url=c.url or (f"/estore/{c.source_id}" if c.rights == "licensed" else "#"),
        rights=c.rights,
    )


def _rights_gate_detail(detail: str, citations: list[GuideCitation]) -> str:
    """Licensed → paraphrase note; open/public may keep quotable detail."""
    if any(c.rights == "licensed" for c in citations):
        note = " Licensed standards are summarised only; purchase full text via the e-store."
        if note.strip() not in detail:
            return detail.rstrip() + note
    return detail


def _water_seed() -> GuideResponse:
    """Third demo seed (mock only — no fixture file)."""
    return GuideResponse(
        title="Sell bottled water locally",
        summary="Packaged drinking water for the Eswatini market",
        meta=GuideMeta(
            standards=2,
            est_fee="~SZL 1,800",
            est_timeline="4–6 weeks",
            steps=4,
        ),
        steps=[
            GuideStep(
                title="Identify the correct product standard",
                detail=(
                    "Packaged drinking water is covered by SZNS 042. "
                    "Confirm the exact product type (still, sparkling, mineral)."
                ),
                citations=[GuideCitation(label="SZNS catalogue", url="#", rights="public")],
                action=None,
            ),
            GuideStep(
                title="Buy and apply the standard",
                detail=(
                    "Obtain SZNS 042 and ensure your water meets the chemical, "
                    "microbiological and labelling requirements."
                ),
                citations=[GuideCitation(label="SZNS 042", url="#", rights="licensed")],
                action=_map_action(
                    "buy",
                    "Buy SZNS 042",
                    "szns-042",
                    "Buying a standard requires an account so we can license the download to you.",
                ),
            ),
            GuideStep(
                title="Arrange product testing",
                detail=(
                    "Submit samples to an accredited laboratory for the required "
                    "chemical and microbiological tests."
                ),
                citations=[GuideCitation(label="ESWASA Metrology", url="#", rights="public")],
                action=_map_action(
                    "book",
                    "Book lab testing",
                    "lab-water",
                    "Booking creates a tracked request under your account.",
                ),
            ),
            GuideStep(
                title="Apply for product certification",
                detail=(
                    "Once test results are ready, apply for the product certification "
                    "mark so you can sell legally."
                ),
                citations=[GuideCitation(label="Certification scheme", url="#", rights="public")],
                action=_map_action(
                    "apply",
                    "Apply for certification",
                    "cert-water",
                    "Applying creates a tracked case under your account.",
                ),
            ),
        ],
    )


async def _call_applicability(goal: str, *, hs_code: str | None = None) -> dict[str, Any]:
    """Call existing applicability via tool registry — do not reimplement graph."""
    tool = get_tool("check_applicability")
    if tool is None or tool.handler is None:
        return {"summary": "", "steps": [], "citations": [], "buy_links": []}
    args: dict[str, Any] = {
        "query": goal,
        "jurisdiction": "Eswatini",
    }
    if hs_code:
        args["hs_code"] = hs_code
    # Also accept direct build_applicability path used by the tool
    result = await tool.handler(args, _guest_ctx())
    return result if isinstance(result, dict) else {}


async def _compose_from_applicability(
    goal: str,
    appl: dict[str, Any],
    rag_hits: list[dict[str, Any]],
) -> GuideResponse:
    """Generic guide when goal is not a seeded demo."""
    raw_citations = [
        Citation.model_validate(c) if not isinstance(c, Citation) else c
        for c in (appl.get("citations") or [])
    ]
    cleaned, buy_links = enforce_licence(raw_citations)

    guide_cites = [_citation_from_schema(c) for c in cleaned]
    for hit in rag_hits[:3]:
        cite = _citation_from_rag(hit)
        if cite.label not in {c.label for c in guide_cites}:
            guide_cites.append(cite)

    appl_steps = appl.get("steps") or []
    steps: list[GuideStep] = []
    for i, s in enumerate(appl_steps):
        title = str(s.get("title") or f"Step {i + 1}")
        detail = str(s.get("detail") or "")
        href = s.get("href")
        step_cites = guide_cites[:2] if i == 0 else guide_cites[min(i, len(guide_cites) - 1) :][:1]
        if not step_cites and guide_cites:
            step_cites = [guide_cites[0]]
        detail = _rights_gate_detail(detail, step_cites)
        action: GuideAction | None = None
        if href and str(href).startswith("http"):
            action = _map_action("open", "Open source", str(href))
        steps.append(GuideStep(title=title, detail=detail, citations=step_cites, action=action))

    for bl_raw in buy_links or []:
        code = getattr(bl_raw, "standard_code", None) or bl_raw.get("standard_code")  # type: ignore[union-attr]
        url = getattr(bl_raw, "url", None) or bl_raw.get("url") or f"/estore/{code}"  # type: ignore[union-attr]
        title = getattr(bl_raw, "title", None) or (bl_raw.get("title") if isinstance(bl_raw, dict) else None)  # type: ignore[union-attr]
        steps.append(
            GuideStep(
                title=f"Obtain {code}",
                detail=_rights_gate_detail(
                    f"Purchase {title or code} from the e-store "
                    "for the normative text (paraphrase only in this guide).",
                    [GuideCitation(label=str(code), url=str(url), rights="licensed")],
                ),
                citations=[
                    GuideCitation(
                        label=str(title or code),
                        url=str(url),
                        rights="licensed",
                    )
                ],
                action=_map_action("buy", f"Buy {code}", str(code)),
            )
        )

    if not steps:
        steps = [
            GuideStep(
                title="Clarify your product and market",
                detail=(
                    f"We could not match a curated guide for “{goal}”. "
                    "Start by confirming HS code and destination market."
                ),
                citations=guide_cites[:1]
                or [GuideCitation(label="ESWASA guidance", url="#", rights="public")],
                action=None,
            )
        ]

    standards = len(buy_links or []) or max(1, len(guide_cites))
    return GuideResponse(
        title=goal.strip().title() if goal.strip() else "Your guided path",
        summary=str(appl.get("summary") or f"Guided steps for “{goal}”"),
        meta=GuideMeta(
            standards=standards,
            est_fee="Varies",
            est_timeline="See steps",
            steps=len(steps),
        ),
        steps=steps,
    )


async def build_guide(body: GuideRequest) -> GuideResponse:
    """
    Pipeline: NL intent → applicability → ordered steps → RAG citations
    (rights-gated) → tool-registry actions (auth_required for buy/apply/book).
    """
    goal = (body.goal or "").strip()
    if not goal:
        return GuideResponse(
            title="Describe your goal",
            summary="Tell us what you want to achieve in plain language.",
            meta=GuideMeta(standards=0, est_fee="—", est_timeline="—", steps=0),
            steps=[],
        )

    seed = _detect_seed(goal)
    hs_hint = "0409" if seed and seed[0] == "honey" else None

    # Always call applicability internally (guest SA)
    appl = await _call_applicability(goal, hs_code=hs_hint)

    rag_hits = await search_sources(goal, limit=5)

    if seed:
        key, fixture_name = seed
        if key == "water":
            return _water_seed()
        if fixture_name:
            loaded = _load_fixture(fixture_name)
            if loaded is not None:
                # Canonical fixture payloads — re-assert auth via registry mapper only
                fixed_steps: list[GuideStep] = []
                for step in loaded.steps:
                    action = step.action
                    if action is not None:
                        action = _map_action(
                            action.type,
                            action.label,
                            action.target,
                            action.reason,
                        )
                    fixed_steps.append(
                        GuideStep(
                            title=step.title,
                            detail=step.detail,
                            citations=list(step.citations),
                            action=action,
                        )
                    )
                return GuideResponse(
                    title=loaded.title,
                    summary=loaded.summary,
                    meta=loaded.meta,
                    steps=fixed_steps,
                )

    return await _compose_from_applicability(goal, appl, rag_hits)


@router.post("/guide", response_model=GuideResponse, operation_id="buildGuide")
async def guide_endpoint(body: GuideRequest) -> GuideResponse:
    """Anonymous guided flow — guest SA; no login required to read."""
    return await build_guide(body)
