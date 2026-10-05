"""Core gateway routes for /api/governance/* (WS-I5).

Soft-fail reads return typed empty/demo-safe payloads when Frappe is down
or DocTypes are missing. Writes require confirm=true and still go through
Frappe permissions — no bypass.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError

from app.audit import audit_log
from app.frappe_client import FrappeClient, FrappeError, get_frappe_client
from app.governance.schemas import (
    BoardMember,
    ConfirmBody,
    GovernanceBody,
    GovernanceDeclaration,
    GovernanceMeeting,
    GovernanceMeetingAct,
    GovernanceMeetingCreate,
    GovernanceOverview,
    GovernancePack,
    GovernancePackAssembleResult,
    GovernancePackSectionsPatch,
    GovernanceResolution,
    GovernanceRisk,
    PackSection,
    PackTrack,
    ResolutionAction,
    empty_overview,
    empty_pack_summary_sections,
    plain_text,
    risk_band,
    risk_score,
)
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.schemas import BoardPackSummary

logger = logging.getLogger("eswasaone.core.governance")

# DocType names — several are still TODO in apps/eswasa_governance.
_DT_MEETING = "Board Meeting"
_DT_PACK = "Board Pack"
_DT_RESOLUTION = "Board Resolution"
_DT_ACTION = "Resolution Action"
_DT_RISK = "Governance Risk"
_DT_RISK_LEGACY = "Risk Register Entry"
_DT_MEMBER = "Board Member"
_DT_BODY = "Governance Body"
_DT_DECLARATION = "Declaration of Interest"


async def _soft_list(
    session: FrappeClient,
    doctype: str,
    *,
    fields: list[str],
    filters: list[Any] | dict[str, Any] | None = None,
    limit: int = 50,
    order_by: str | None = None,
) -> list[dict[str, Any]]:
    """Permission-bound get_list; returns [] on missing DocType / soft errors."""
    payload: dict[str, Any] = {
        "doctype": doctype,
        "fields": fields,
        "limit_page_length": limit,
    }
    if filters is not None:
        payload["filters"] = filters
    if order_by:
        payload["order_by"] = order_by
    try:
        raw = await session.method("frappe.client.get_list", json=payload)
    except FrappeError as exc:
        text = str(exc)
        if (
            "PermissionError" in text
            or "Insufficient Permission" in text
            or "DoesNotExistError" in text
            or "not found" in text.lower()
            or "ValidationError" in text
            or "AttributeError" in text
            or '"exception"' in text
            or "Traceback" in text
        ):
            return []
        raise
    if isinstance(raw, list):
        return [r for r in raw if isinstance(r, dict)]
    return []


async def _soft_get(
    session: FrappeClient, doctype: str, name: str
) -> dict[str, Any] | None:
    try:
        raw = await session.method(
            "frappe.client.get", json={"doctype": doctype, "name": name}
        )
    except FrappeError as exc:
        text = str(exc)
        if (
            "DoesNotExistError" in text
            or "not found" in text.lower()
            or "PermissionError" in text
        ):
            return None
        raise
    return raw if isinstance(raw, dict) else None


def _require_confirm(confirm: bool) -> None:
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm=true required before commit",
        )


def _li_from_legacy(value: Any) -> int:
    """Map legacy Low/Medium/High/Critical or int → 1..5."""
    if isinstance(value, int):
        return max(1, min(5, value))
    if value is None:
        return 3
    key = str(value).strip().lower()
    mapping = {
        "1": 1,
        "2": 2,
        "3": 3,
        "4": 4,
        "5": 5,
        "low": 1,
        "medium": 3,
        "high": 4,
        "critical": 5,
    }
    return mapping.get(key, 3)


def _as_meeting(row: dict[str, Any], *, detail: bool = False) -> GovernanceMeeting:
    mid = str(row.get("name") or row.get("meeting_code") or "")
    title = str(row.get("title") or mid or "Meeting")
    status_val = str(row.get("workflow_state") or row.get("status") or "Scheduled")
    mt_raw = row.get("meeting_type")
    meeting_type = mt_raw if mt_raw in ("Ordinary", "Special", "AGM") else None
    meeting = GovernanceMeeting(
        id=mid,
        title=title,
        status=status_val,
        body=row.get("body"),
        body_name=row.get("body_name"),
        meeting_type=meeting_type,
        date=row.get("date") or row.get("meeting_date"),
        start_time=row.get("start_time"),
        scheduled_at=row.get("scheduled_at"),
        venue=row.get("venue"),
        hybrid=bool(row.get("hybrid") or False),
        online_link=row.get("online_link"),
        pack_deadline=row.get("pack_deadline"),
        pack_id=row.get("pack") or row.get("pack_id"),
        allowed_actions=[],
    )
    if detail:
        # TODO: wire real — agenda / attendance child tables
        meeting.agenda = []
        meeting.attendance = []
        meeting.allowed_actions = []
    return meeting


def _as_pack(row: dict[str, Any], sections: list[PackSection] | None = None) -> GovernancePack:
    secs = sections or []
    outstanding = sum(1 for s in secs if s.included and s.status != "ready")
    status_raw = str(row.get("workflow_state") or row.get("status") or "Draft")
    status: Any = "Draft"
    if "ssued" in status_raw or status_raw == "Issued":
        status = "Issued"
    elif "ssembl" in status_raw or status_raw == "Assembled":
        status = "Assembled"
    return GovernancePack(
        id=str(row.get("name") or row.get("pack_code") or ""),
        meeting=str(row.get("meeting") or row.get("meeting_date") or ""),
        meeting_title=row.get("title"),
        version=int(row.get("version") or 1),
        status=status,
        sections=secs,
        assembled_file=row.get("assembled_file") or row.get("pack_file"),
        pages=row.get("pages"),
        issued_on=row.get("issued_on"),
        due_label=row.get("pack_deadline") or row.get("due_label"),
        outstanding_sections=outstanding,
        allowed_actions=[],
    )


def _as_risk(row: dict[str, Any]) -> GovernanceRisk:
    L = _li_from_legacy(
        row.get("residual_likelihood")
        if row.get("residual_likelihood") is not None
        else row.get("likelihood")
    )
    I = _li_from_legacy(
        row.get("residual_impact")
        if row.get("residual_impact") is not None
        else row.get("impact")
    )
    score = risk_score(L, I)
    return GovernanceRisk(
        id=str(row.get("name") or row.get("risk_id") or ""),
        title=str(row.get("title") or ""),
        status=str(row.get("status") or row.get("workflow_state") or "Open"),
        residual_likelihood=L,
        residual_impact=I,
        score=score,
        band=risk_band(score),
        cause_consequence=row.get("cause_consequence"),
        category=row.get("category"),
        owner=row.get("owner"),
        inherent_likelihood=_li_from_legacy(row["inherent_likelihood"])
        if row.get("inherent_likelihood") is not None
        else None,
        inherent_impact=_li_from_legacy(row["inherent_impact"])
        if row.get("inherent_impact") is not None
        else None,
        controls=row.get("controls") or row.get("mitigation"),
        trend=None,  # TODO: wire real — derive from last two Risk Updates
        appetite_threshold=row.get("appetite_threshold"),
        flagged_for_pack=bool(row.get("flagged_for_pack") or False),
    )


def _pack_track_from_pack(pack: GovernancePack) -> PackTrack:
    return PackTrack(
        pack_id=pack.id,
        meeting_id=pack.meeting,
        due_label=pack.due_label,
        outstanding_sections=pack.outstanding_sections,
        sections=pack.sections,
    )


def mount_governance_routes(router: APIRouter) -> None:
    """Register WS-I5 governance routes on the shared gateway router."""

    @router.get(
        "/governance/overview",
        response_model=GovernanceOverview,
        tags=["governance"],
    )
    async def get_governance_overview(
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    ) -> GovernanceOverview:
        if auth.mock or not await frappe.health():
            return empty_overview()
        session = auth.frappe(frappe)
        try:
            meetings = await _soft_list(
                session,
                _DT_MEETING,
                fields=[
                    "name",
                    "title",
                    "body",
                    "meeting_type",
                    "date",
                    "start_time",
                    "venue",
                    "pack_deadline",
                    "workflow_state",
                    "status",
                ],
                filters=[["status", "not in", ["Held", "Minutes approved", "Cancelled"]]],
                limit=5,
                order_by="date asc",
            )
            # Fallback: Board Pack rows as thin meeting stand-in
            if not meetings:
                packs = await _soft_list(
                    session,
                    _DT_PACK,
                    fields=[
                        "name",
                        "pack_code",
                        "title",
                        "meeting_date",
                        "workflow_state",
                    ],
                    limit=5,
                    order_by="meeting_date asc",
                )
                meetings = [
                    {
                        "name": p.get("pack_code") or p.get("name"),
                        "title": p.get("title"),
                        "date": p.get("meeting_date"),
                        "workflow_state": p.get("workflow_state"),
                        "pack": p.get("name"),
                    }
                    for p in packs
                ]

            next_meeting = _as_meeting(meetings[0]) if meetings else None
            pack_track = PackTrack()
            if next_meeting and next_meeting.pack_id:
                pack_row = await _soft_get(session, _DT_PACK, next_meeting.pack_id)
                if pack_row:
                    pack = _as_pack(pack_row, sections=[])
                    pack_track = _pack_track_from_pack(pack)

            resolutions = await _soft_list(
                session,
                _DT_RESOLUTION,
                fields=[
                    "name",
                    "resolution_number",
                    "title",
                    "meeting_date",
                    "workflow_state",
                ],
                limit=5,
                order_by="modified desc",
            )
            recent = [
                GovernanceResolution(
                    id=str(r.get("resolution_number") or r.get("name")),
                    title=str(r.get("title") or ""),
                    status=str(r.get("workflow_state") or "Passed"),
                    meeting=r.get("meeting_date"),
                    date=r.get("meeting_date"),
                )
                for r in resolutions
            ]

            action_rows = await _soft_list(
                session,
                _DT_ACTION,
                fields=[
                    "name",
                    "description",
                    "resolution",
                    "owner",
                    "due_date",
                    "progress",
                    "status",
                ],
                filters={"status": "Overdue"},
                limit=20,
                order_by="due_date asc",
            )
            overdue = [
                ResolutionAction(
                    id=str(a.get("name")),
                    description=str(a.get("description") or ""),
                    status="Overdue",
                    resolution=a.get("resolution"),
                    owner=a.get("owner"),
                    due_date=a.get("due_date"),
                    progress=int(a.get("progress") or 0),
                )
                for a in action_rows
            ]

            # TODO: wire real — calendar from meetings + term ends; heat from risks
            return GovernanceOverview(
                next_meeting=next_meeting,
                pack_track=pack_track,
                overdue_actions=overdue,
                recent_resolutions=recent,
            )
        except FrappeError:
            return empty_overview()
        except ValidationError:
            return empty_overview()

    @router.get("/governance/meetings", tags=["governance"])
    async def list_governance_meetings(
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
        body: Annotated[str | None, Query()] = None,
        status_filter: Annotated[str | None, Query(alias="status")] = None,
        q: Annotated[str | None, Query()] = None,
        limit: int = 50,
    ) -> dict[str, list[GovernanceMeeting]]:
        if auth.mock or not await frappe.health():
            return {"items": []}
        session = auth.frappe(frappe)
        try:
            filters: list[Any] = []
            if body:
                filters.append(["body", "=", body])
            if status_filter:
                filters.append(["workflow_state", "=", status_filter])
            rows = await _soft_list(
                session,
                _DT_MEETING,
                fields=[
                    "name",
                    "title",
                    "body",
                    "meeting_type",
                    "date",
                    "start_time",
                    "venue",
                    "pack_deadline",
                    "workflow_state",
                    "status",
                ],
                filters=filters or None,
                limit=limit,
                order_by="date desc",
            )
            if not rows:
                # Soft fallback to Board Pack until Board Meeting DocType exists
                rows = await _soft_list(
                    session,
                    _DT_PACK,
                    fields=[
                        "name",
                        "pack_code",
                        "title",
                        "meeting_date",
                        "workflow_state",
                    ],
                    limit=limit,
                    order_by="meeting_date desc",
                )
                rows = [
                    {
                        "name": r.get("pack_code") or r.get("name"),
                        "title": r.get("title"),
                        "date": r.get("meeting_date"),
                        "workflow_state": r.get("workflow_state"),
                        "pack": r.get("name"),
                    }
                    for r in rows
                ]
            items = [_as_meeting(r) for r in rows]
            if q:
                ql = q.lower()
                items = [
                    m
                    for m in items
                    if ql in m.title.lower() or ql in m.id.lower()
                ]
            return {"items": items}
        except FrappeError as exc:
            logger.warning("list_governance_meetings soft-fail: %s", exc)
            return {"items": []}

    @router.post(
        "/governance/meetings",
        response_model=GovernanceMeeting,
        status_code=status.HTTP_201_CREATED,
        tags=["governance"],
    )
    async def create_governance_meeting(
        body: GovernanceMeetingCreate,
        auth: Annotated[AuthContext, Depends(require_auth_csrf)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    ) -> GovernanceMeeting:
        _require_confirm(body.confirm)
        audit_log(
            action="governance.meeting.create",
            actor=auth.user.username,
            resource="Board Meeting",
            detail={"title": body.title},
            confirmed=True,
        )
        if auth.mock or not await frappe.health():
            raise HTTPException(status_code=503, detail="Frappe unavailable")
        # TODO: wire real — insert Board Meeting + create Board Pack Draft + notify owners
        raise HTTPException(
            status_code=501,
            detail="Board Meeting DocType not yet wired (TODO: wire real)",
        )

    @router.get(
        "/governance/meetings/{id}",
        response_model=GovernanceMeeting,
        tags=["governance"],
    )
    async def get_governance_meeting(
        id: str,
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    ) -> GovernanceMeeting:
        if auth.mock or not await frappe.health():
            raise HTTPException(status_code=404, detail="Meeting not found")
        session = auth.frappe(frappe)
        try:
            row = await _soft_get(session, _DT_MEETING, id)
            if not row:
                # Fallback: Board Pack by name/code
                packs = await _soft_list(
                    session,
                    _DT_PACK,
                    fields=[
                        "name",
                        "pack_code",
                        "title",
                        "meeting_date",
                        "workflow_state",
                        "agenda",
                    ],
                    filters=[["name", "=", id]],
                    limit=1,
                )
                if not packs:
                    packs = await _soft_list(
                        session,
                        _DT_PACK,
                        fields=[
                            "name",
                            "pack_code",
                            "title",
                            "meeting_date",
                            "workflow_state",
                        ],
                        filters=[["pack_code", "=", id]],
                        limit=1,
                    )
                if not packs:
                    raise HTTPException(status_code=404, detail="Meeting not found")
                row = {
                    "name": packs[0].get("pack_code") or packs[0].get("name"),
                    "title": packs[0].get("title"),
                    "date": packs[0].get("meeting_date"),
                    "workflow_state": packs[0].get("workflow_state"),
                    "pack": packs[0].get("name"),
                }
            return _as_meeting(row, detail=True)
        except HTTPException:
            raise
        except FrappeError:
            raise HTTPException(status_code=404, detail="Meeting not found") from None

    @router.post(
        "/governance/meetings/{id}/act",
        response_model=GovernanceMeeting,
        tags=["governance"],
    )
    async def act_on_governance_meeting(
        id: str,
        body: GovernanceMeetingAct,
        auth: Annotated[AuthContext, Depends(require_auth_csrf)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    ) -> GovernanceMeeting:
        _require_confirm(body.confirm)
        audit_log(
            action=f"governance.meeting.{body.action}",
            actor=auth.user.username,
            resource=f"Board Meeting:{id}",
            detail={"action": body.action, "payload": body.payload},
            confirmed=True,
        )
        if auth.mock or not await frappe.health():
            raise HTTPException(status_code=503, detail="Frappe unavailable")
        # TODO: wire real — apply workflow transition via Frappe
        raise HTTPException(
            status_code=501,
            detail="Meeting act not yet wired (TODO: wire real)",
        )

    @router.get(
        "/governance/packs/{meeting}",
        response_model=GovernancePack,
        tags=["governance"],
    )
    async def get_governance_pack(
        meeting: str,
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    ) -> GovernancePack:
        if auth.mock or not await frappe.health():
            return GovernancePack(
                id="",
                meeting=meeting,
                status="Draft",
                sections=[],
            )
        session = auth.frappe(frappe)
        try:
            rows = await _soft_list(
                session,
                _DT_PACK,
                fields=[
                    "name",
                    "pack_code",
                    "title",
                    "meeting_date",
                    "pack_file",
                    "workflow_state",
                    "meeting",
                    "version",
                    "assembled_file",
                    "pages",
                    "issued_on",
                ],
                filters=[["meeting", "=", meeting]],
                limit=1,
                order_by="modified desc",
            )
            if not rows:
                rows = await _soft_list(
                    session,
                    _DT_PACK,
                    fields=[
                        "name",
                        "pack_code",
                        "title",
                        "meeting_date",
                        "pack_file",
                        "workflow_state",
                    ],
                    filters=[["name", "=", meeting]],
                    limit=1,
                )
            if not rows:
                rows = await _soft_list(
                    session,
                    _DT_PACK,
                    fields=[
                        "name",
                        "pack_code",
                        "title",
                        "meeting_date",
                        "pack_file",
                        "workflow_state",
                    ],
                    filters=[["pack_code", "=", meeting]],
                    limit=1,
                )
            if not rows:
                return GovernancePack(
                    id="",
                    meeting=meeting,
                    status="Draft",
                    sections=[],
                )
            # TODO: wire real — load Pack Section child table
            return _as_pack(rows[0], sections=[])
        except FrappeError:
            return GovernancePack(
                id="",
                meeting=meeting,
                status="Draft",
                sections=[],
            )

    @router.patch(
        "/governance/packs/{id}/sections",
        response_model=GovernancePack,
        tags=["governance"],
    )
    async def patch_governance_pack_sections(
        id: str,
        body: GovernancePackSectionsPatch,
        auth: Annotated[AuthContext, Depends(require_auth_csrf)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    ) -> GovernancePack:
        _require_confirm(body.confirm)
        audit_log(
            action="governance.pack.sections.patch",
            actor=auth.user.username,
            resource=f"Board Pack:{id}",
            detail={"sections": [s.model_dump() for s in body.sections]},
            confirmed=True,
        )
        if auth.mock or not await frappe.health():
            raise HTTPException(status_code=503, detail="Frappe unavailable")
        # TODO: wire real — update Pack Section child rows
        raise HTTPException(
            status_code=501,
            detail="Pack sections patch not yet wired (TODO: wire real)",
        )

    @router.post(
        "/governance/packs/{id}/assemble",
        response_model=GovernancePackAssembleResult,
        tags=["governance"],
    )
    async def assemble_governance_pack(
        id: str,
        body: ConfirmBody,
        auth: Annotated[AuthContext, Depends(require_auth_csrf)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    ) -> GovernancePackAssembleResult:
        _require_confirm(body.confirm)
        audit_log(
            action="governance.pack.assemble",
            actor=auth.user.username,
            resource=f"Board Pack:{id}",
            detail={},
            confirmed=True,
        )
        if auth.mock or not await frappe.health():
            raise HTTPException(status_code=503, detail="Frappe unavailable")
        session = auth.frappe(frappe)
        try:
            # Prefer new method; fall back to legacy assemble_board_pack
            try:
                raw = await session.method(
                    "eswasa_governance.api.assemble_board_pack",
                    json={"meeting": id, "confirm": True},
                )
            except FrappeError:
                raise HTTPException(
                    status_code=501,
                    detail="Pack assemble not yet wired (TODO: wire real)",
                ) from None
            if isinstance(raw, dict):
                return GovernancePackAssembleResult(
                    id=str(raw.get("id") or id),
                    version=int(raw.get("version") or 1),
                    pages=raw.get("pages"),
                    file_url=raw.get("file_url") or raw.get("assembled_file"),
                    status=raw.get("status") or "Assembled",
                )
            return GovernancePackAssembleResult(id=id, version=1, status="Assembled")
        except HTTPException:
            raise
        except FrappeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @router.post(
        "/governance/packs/{id}/issue",
        response_model=GovernancePack,
        tags=["governance"],
    )
    async def issue_governance_pack(
        id: str,
        body: ConfirmBody,
        auth: Annotated[AuthContext, Depends(require_auth_csrf)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    ) -> GovernancePack:
        _require_confirm(body.confirm)
        audit_log(
            action="governance.pack.issue",
            actor=auth.user.username,
            resource=f"Board Pack:{id}",
            detail={},
            confirmed=True,
        )
        if auth.mock or not await frappe.health():
            raise HTTPException(status_code=503, detail="Frappe unavailable")
        session = auth.frappe(frappe)
        try:
            pack_row = await _soft_get(session, _DT_PACK, id)
            if not pack_row:
                raise HTTPException(status_code=404, detail="Pack not found")
            # TODO: wire real — load sections child table; enforce Ready
            sections: list[PackSection] = []
            not_ready = [s for s in sections if s.included and s.status != "ready"]
            if not_ready:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "message": "Included section not Ready",
                        "sections": [s.id for s in not_ready],
                    },
                )
            # TODO: wire real — set Issued + meeting → Pack issued
            raise HTTPException(
                status_code=501,
                detail="Pack issue not yet wired (TODO: wire real)",
            )
        except HTTPException:
            raise
        except FrappeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    # --- Deprecated aliases -------------------------------------------------

    @router.get(
        "/governance/board-pack",
        response_model=BoardPackSummary,
        tags=["governance"],
        deprecated=True,
    )
    async def get_board_pack_summary(
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    ) -> BoardPackSummary:
        """Deprecated — prefer GET /governance/packs/{meeting}."""
        if auth.mock or not await frappe.health():
            return BoardPackSummary.model_validate(empty_pack_summary_sections())
        try:
            raw = await auth.frappe(frappe).method(
                "eswasa_governance.api.get_board_pack_summary",
            )
            return BoardPackSummary.model_validate(raw)
        except (FrappeError, ValidationError):
            return BoardPackSummary.model_validate(empty_pack_summary_sections())

    @router.post(
        "/governance/pack/{meeting}",
        response_model=BoardPackSummary,
        tags=["governance"],
        deprecated=True,
    )
    async def assemble_board_pack_legacy(
        meeting: str,
        body: ConfirmBody,
        auth: Annotated[AuthContext, Depends(require_auth_csrf)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    ) -> BoardPackSummary:
        """Deprecated — prefer POST /governance/packs/{id}/assemble."""
        _require_confirm(body.confirm)
        audit_log(
            action="governance.pack.assemble",
            actor=auth.user.username,
            resource=f"Board Pack:{meeting}",
            detail={"meeting": meeting, "legacy": True},
            confirmed=True,
        )
        if auth.mock or not await frappe.health():
            raise HTTPException(status_code=503, detail="Frappe unavailable")
        try:
            raw = await auth.frappe(frappe).method(
                "eswasa_governance.api.assemble_board_pack",
                json={"meeting": meeting, "confirm": True},
            )
            return BoardPackSummary.model_validate(raw)
        except FrappeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except ValidationError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @router.get("/governance/resolutions", tags=["governance"])
    async def list_governance_resolutions(
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
        limit: int = 50,
    ) -> dict[str, list[GovernanceResolution]]:
        if auth.mock or not await frappe.health():
            return {"items": []}
        try:
            rows = await _soft_list(
                auth.frappe(frappe),
                _DT_RESOLUTION,
                fields=[
                    "name",
                    "resolution_number",
                    "title",
                    "meeting_date",
                    "body",
                    "workflow_state",
                ],
                limit=limit,
                order_by="meeting_date desc",
            )
            return {
                "items": [
                    GovernanceResolution(
                        id=str(r.get("resolution_number") or r.get("name")),
                        title=str(r.get("title") or ""),
                        status=str(r.get("workflow_state") or "Passed"),
                        meeting=r.get("meeting_date"),
                        text=plain_text(r.get("body")),
                        date=r.get("meeting_date"),
                    )
                    for r in rows
                ]
            }
        except FrappeError:
            return {"items": []}

    @router.get("/governance/actions", tags=["governance"])
    async def list_resolution_actions(
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
        status_filter: Annotated[str | None, Query(alias="status")] = None,
        limit: int = 50,
    ) -> dict[str, list[ResolutionAction]]:
        if auth.mock or not await frappe.health():
            return {"items": []}
        session = auth.frappe(frappe)
        try:
            filters: dict[str, Any] | None = None
            if status_filter:
                filters = {"status": status_filter}
            rows = await _soft_list(
                session,
                _DT_ACTION,
                fields=[
                    "name",
                    "description",
                    "resolution",
                    "owner",
                    "due_date",
                    "progress",
                    "status",
                    "report_in_pack",
                ],
                filters=filters,
                limit=limit,
                order_by="due_date asc",
            )
            items: list[ResolutionAction] = []
            for r in rows:
                st = str(r.get("status") or "Open")
                if st not in ("Open", "Overdue", "Completed"):
                    st = "Open"
                items.append(
                    ResolutionAction(
                        id=str(r.get("name")),
                        description=str(r.get("description") or ""),
                        status=st,  # type: ignore[arg-type]
                        resolution=r.get("resolution"),
                        owner=r.get("owner"),
                        due_date=r.get("due_date"),
                        progress=int(r.get("progress") or 0),
                        report_in_pack=bool(r.get("report_in_pack") or False),
                    )
                )
            if items:
                return {"items": items}

            # Soft fallback: R-G2 writes ToDos until Resolution Action DocType exists.
            todo_filters: list[Any] = [["reference_type", "=", "Board Resolution"]]
            if status_filter == "Completed":
                todo_filters.append(["status", "=", "Closed"])
            elif status_filter in ("Open", "Overdue"):
                todo_filters.append(["status", "=", "Open"])
            todos = await _soft_list(
                session,
                "ToDo",
                fields=[
                    "name",
                    "description",
                    "reference_name",
                    "allocated_to",
                    "date",
                    "status",
                ],
                filters=todo_filters,
                limit=limit,
                order_by="modified desc",
            )
            for t in todos:
                raw_desc = plain_text(t.get("description")) or ""
                desc = raw_desc
                for marker in ("R-G2 action:", "Action:"):
                    idx = raw_desc.lower().rfind(marker.lower())
                    if idx >= 0:
                        desc = raw_desc[idx + len(marker) :].strip()
                        break
                # Drop leading R-G2 marker lines when no Action: found
                if desc.startswith("R-G2:"):
                    parts = [p.strip() for p in desc.split("\n") if p.strip()]
                    desc = parts[-1] if parts else desc
                    if desc.lower().startswith("r-g2 action:"):
                        desc = desc.split(":", 1)[-1].strip()
                todo_st = str(t.get("status") or "Open")
                mapped: Any = "Completed" if todo_st == "Closed" else "Open"
                if status_filter == "Overdue" and mapped != "Open":
                    continue
                if status_filter == "Open" and mapped != "Open":
                    continue
                if status_filter == "Completed" and mapped != "Completed":
                    continue
                items.append(
                    ResolutionAction(
                        id=str(t.get("name")),
                        description=desc or raw_desc or str(t.get("name")),
                        status=mapped,
                        resolution=t.get("reference_name"),
                        owner=t.get("allocated_to"),
                        due_date=t.get("date"),
                        progress=100 if mapped == "Completed" else 0,
                        report_in_pack=False,
                    )
                )
            return {"items": items}
        except FrappeError:
            return {"items": []}

    @router.get("/governance/risks", tags=["governance"])
    async def list_governance_risks(
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
        L: Annotated[int | None, Query()] = None,
        I: Annotated[int | None, Query()] = None,
        limit: int = 50,
    ) -> dict[str, list[GovernanceRisk]]:
        if auth.mock or not await frappe.health():
            return {"items": []}
        session = auth.frappe(frappe)
        try:
            rows = await _soft_list(
                session,
                _DT_RISK,
                fields=[
                    "name",
                    "title",
                    "category",
                    "owner",
                    "residual_likelihood",
                    "residual_impact",
                    "inherent_likelihood",
                    "inherent_impact",
                    "controls",
                    "cause_consequence",
                    "appetite_threshold",
                    "status",
                    "flagged_for_pack",
                ],
                limit=limit,
                order_by="modified desc",
            )
            if not rows:
                rows = await _soft_list(
                    session,
                    _DT_RISK_LEGACY,
                    fields=[
                        "name",
                        "risk_id",
                        "title",
                        "category",
                        "likelihood",
                        "impact",
                        "owner",
                        "mitigation",
                        "status",
                        "workflow_state",
                    ],
                    limit=limit,
                    order_by="modified desc",
                )
            items = [_as_risk(r) for r in rows]
            if L is not None:
                items = [r for r in items if r.residual_likelihood == L]
            if I is not None:
                items = [r for r in items if r.residual_impact == I]
            return {"items": items}
        except FrappeError:
            return {"items": []}

    @router.get("/governance/members", tags=["governance"])
    async def list_board_members(
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
        limit: int = 50,
    ) -> dict[str, list[BoardMember]]:
        if auth.mock or not await frappe.health():
            return {"items": []}
        try:
            rows = await _soft_list(
                auth.frappe(frappe),
                _DT_MEMBER,
                fields=[
                    "name",
                    "full_name",
                    "title",
                    "role",
                    "term_start",
                    "term_end",
                    "attendance_pct",
                ],
                limit=limit,
                order_by="full_name asc",
            )
            return {
                "items": [
                    BoardMember(
                        id=str(r.get("name")),
                        full_name=str(r.get("full_name") or r.get("name") or ""),
                        title=r.get("title"),
                        role=r.get("role")
                        if r.get("role") in ("Chair", "Vice", "Member", "Ex officio")
                        else None,
                        term_start=r.get("term_start"),
                        term_end=r.get("term_end"),
                        attendance_pct=r.get("attendance_pct"),
                    )
                    for r in rows
                ]
            }
        except FrappeError:
            return {"items": []}

    @router.get("/governance/bodies", tags=["governance"])
    async def list_governance_bodies(
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
        limit: int = 50,
    ) -> dict[str, list[GovernanceBody]]:
        if auth.mock or not await frappe.health():
            return {"items": []}
        try:
            rows = await _soft_list(
                auth.frappe(frappe),
                _DT_BODY,
                fields=[
                    "name",
                    "type",
                    "chair",
                    "quorum",
                    "meeting_frequency",
                ],
                limit=limit,
                order_by="name asc",
            )
            return {
                "items": [
                    GovernanceBody(
                        id=str(r.get("name")),
                        name=str(r.get("name") or ""),
                        type="Committee" if r.get("type") == "Committee" else "Board",
                        chair=r.get("chair"),
                        quorum=r.get("quorum"),
                        meeting_frequency=r.get("meeting_frequency"),
                    )
                    for r in rows
                ]
            }
        except FrappeError:
            return {"items": []}

    @router.get("/governance/declarations", tags=["governance"])
    async def list_governance_declarations(
        auth: Annotated[AuthContext, Depends(require_auth)],
        frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
        limit: int = 50,
    ) -> dict[str, list[GovernanceDeclaration]]:
        if auth.mock or not await frappe.health():
            return {"items": []}
        try:
            rows = await _soft_list(
                auth.frappe(frappe),
                _DT_DECLARATION,
                fields=[
                    "name",
                    "member",
                    "kind",
                    "meeting",
                    "agenda_item",
                    "interest",
                    "action",
                    "filed_on",
                ],
                limit=limit,
                order_by="filed_on desc",
            )
            return {
                "items": [
                    GovernanceDeclaration(
                        id=str(r.get("name")),
                        member=str(r.get("member") or ""),
                        kind=r.get("kind") or "Annual",  # type: ignore[arg-type]
                        interest=str(r.get("interest") or ""),
                        filed_on=str(r.get("filed_on") or ""),
                        meeting=r.get("meeting"),
                        agenda_item=r.get("agenda_item"),
                        action=r.get("action"),
                    )
                    for r in rows
                ]
            }
        except FrappeError:
            return {"items": []}
