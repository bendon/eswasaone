"""Pydantic models for /api/governance/* (mirrors contracts/openapi.yaml WS-I5)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AllowedAction(BaseModel):
    action: str
    label: str
    rule_id: str | None = None
    danger: bool = False
    consequence: str | None = None


class ConfirmBody(BaseModel):
    confirm: bool = False


PackSectionStatus = Literal["awaiting", "ready", "overdue"]
PackSectionSource = Literal["live_module", "upload", "secretariat"]
RiskBand = Literal["critical", "high", "medium", "low"]
RiskTrend = Literal["improving", "stable", "worsening"]


def plain_text(value: Any) -> str | None:
    """Strip Frappe Text Editor HTML for portal plain-text fields."""
    if value is None:
        return None
    text = str(value)
    if not text:
        return None
    import re

    with_breaks = re.sub(
        r"</(?:p|div|li|h[1-6]|tr)\s*>", "\n", text, flags=re.I
    )
    with_breaks = re.sub(r"<br\s*/?>", "\n", with_breaks, flags=re.I)
    with_breaks = re.sub(r"</td\s*>", " ", with_breaks, flags=re.I)
    stripped = re.sub(r"<[^>]+>", "", with_breaks)
    for ent, ch in (
        ("&nbsp;", " "),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", '"'),
        ("&#39;", "'"),
    ):
        stripped = stripped.replace(ent, ch)
    cleaned = re.sub(r"[ \t]+\n", "\n", stripped)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned or None


class PackSection(BaseModel):
    id: str
    title: str
    status: PackSectionStatus
    included: bool
    source: PackSectionSource | None = None
    module_key: str | None = None
    owner: str | None = None
    idx: int | None = None
    file_url: str | None = None
    restricted: bool = False


class PackTrack(BaseModel):
    pack_id: str | None = None
    meeting_id: str | None = None
    due_label: str | None = None
    outstanding_sections: int = 0
    sections: list[PackSection] = Field(default_factory=list)


class GovernanceKpis(BaseModel):
    open_actions: int = 0
    overdue_actions: int = 0
    high_critical_risks: int = 0
    worsening_risks: int = 0
    board_attendance_pct: float | None = None
    declarations_due: int = 0


class GovernanceCalendarItem(BaseModel):
    id: str
    title: str
    date: str
    kind: str | None = None
    href: str | None = None


class MeetingAgendaItem(BaseModel):
    id: str
    item: str
    presenter: str | None = None
    purpose: str | None = None
    paper: str | None = None


class MeetingAttendance(BaseModel):
    member: str
    member_name: str | None = None
    rsvp: str | None = None
    attended: bool | None = None
    apology: bool | None = None


class GovernanceMeeting(BaseModel):
    id: str
    title: str
    status: str
    body: str | None = None
    body_name: str | None = None
    meeting_type: Literal["Ordinary", "Special", "AGM"] | None = None
    date: str | None = None
    start_time: str | None = None
    scheduled_at: str | None = None
    venue: str | None = None
    hybrid: bool = False
    online_link: str | None = None
    pack_deadline: str | None = None
    agenda: list[MeetingAgendaItem] = Field(default_factory=list)
    attendance: list[MeetingAttendance] = Field(default_factory=list)
    pack_id: str | None = None
    pack_track: PackTrack | None = None
    allowed_actions: list[AllowedAction] = Field(default_factory=list)


class GovernanceMeetingCreate(BaseModel):
    title: str
    confirm: bool
    body: str | None = None
    meeting_type: Literal["Ordinary", "Special", "AGM"] = "Ordinary"
    date: str | None = None
    start_time: str | None = None
    scheduled_at: str | None = None
    venue: str | None = None
    hybrid: bool = False
    online_link: str | None = None
    pack_deadline: str | None = None


class GovernanceMeetingAct(BaseModel):
    action: Literal[
        "reschedule",
        "cancel",
        "record_attendance",
        "start_minutes",
        "submit_minutes",
        "approve_minutes",
    ]
    confirm: bool
    payload: dict[str, Any] | None = None


class GovernancePack(BaseModel):
    id: str
    meeting: str
    status: Literal["Draft", "Assembled", "Issued"]
    sections: list[PackSection] = Field(default_factory=list)
    meeting_title: str | None = None
    version: int = 1
    assembled_file: str | None = None
    pages: int | None = None
    issued_on: str | None = None
    due_label: str | None = None
    outstanding_sections: int = 0
    allowed_actions: list[AllowedAction] = Field(default_factory=list)


class GovernancePackSectionPatch(BaseModel):
    id: str
    included: bool | None = None
    idx: int | None = None
    status: PackSectionStatus | None = None
    mark_ready: bool | None = None


class GovernancePackSectionsPatch(BaseModel):
    confirm: bool
    sections: list[GovernancePackSectionPatch]


class GovernancePackAssembleResult(BaseModel):
    id: str
    version: int
    pages: int | None = None
    file_url: str | None = None
    status: str | None = None


class GovernanceResolution(BaseModel):
    id: str
    title: str
    status: str
    meeting: str | None = None
    text: str | None = None
    outcome: Literal["Passed", "Rejected", "Deferred"] | None = None
    votes_for: int | None = None
    votes_against: int | None = None
    votes_abstained: int | None = None
    date: str | None = None
    allowed_actions: list[AllowedAction] = Field(default_factory=list)


class ResolutionAction(BaseModel):
    id: str
    description: str
    status: Literal["Open", "Overdue", "Completed"]
    resolution: str | None = None
    owner: str | None = None
    due_date: str | None = None
    progress: int = 0
    report_in_pack: bool = False


class GovernanceRisk(BaseModel):
    id: str
    title: str
    status: str
    residual_likelihood: int
    residual_impact: int
    score: int
    band: RiskBand
    cause_consequence: str | None = None
    category: str | None = None
    owner: str | None = None
    inherent_likelihood: int | None = None
    inherent_impact: int | None = None
    controls: str | None = None
    trend: RiskTrend | None = None
    appetite_threshold: int | None = None
    flagged_for_pack: bool = False


class BoardMember(BaseModel):
    id: str
    full_name: str
    title: str | None = None
    role: Literal["Chair", "Vice", "Member", "Ex officio"] | None = None
    committees: list[str] = Field(default_factory=list)
    term_start: str | None = None
    term_end: str | None = None
    attendance_pct: float | None = None
    declaration_due: bool = False


class GovernanceBody(BaseModel):
    id: str
    name: str
    type: Literal["Board", "Committee"]
    chair: str | None = None
    quorum: int | None = None
    meeting_frequency: str | None = None
    members: list[str] = Field(default_factory=list)


class GovernanceDeclaration(BaseModel):
    id: str
    member: str
    kind: Literal["Annual", "Meeting"]
    interest: str
    filed_on: str
    member_name: str | None = None
    meeting: str | None = None
    agenda_item: str | None = None
    action: Literal["Recuse", "Note"] | None = None


class HeatCell(BaseModel):
    L: int
    I: int
    count: int


class GovernanceOverview(BaseModel):
    kpis: GovernanceKpis = Field(default_factory=GovernanceKpis)
    pack_track: PackTrack = Field(default_factory=PackTrack)
    calendar: list[GovernanceCalendarItem] = Field(default_factory=list)
    overdue_actions: list[ResolutionAction] = Field(default_factory=list)
    recent_resolutions: list[GovernanceResolution] = Field(default_factory=list)
    next_meeting: GovernanceMeeting | None = None
    heat_cells: list[HeatCell] = Field(default_factory=list)


def risk_score(likelihood: int, impact: int) -> int:
    return max(1, min(5, likelihood)) * max(1, min(5, impact))


def risk_band(score: int) -> RiskBand:
    if score >= 15:
        return "critical"
    if score >= 10:
        return "high"
    if score >= 5:
        return "medium"
    return "low"


def empty_overview() -> GovernanceOverview:
    """Typed empty Overview when Frappe is unavailable."""
    return GovernanceOverview()


def empty_pack_summary_sections() -> dict[str, Any]:
    """Deprecated BoardPackSummary soft-empty shape."""
    return {
        "due_label": "—",
        "outstanding_sections": 0,
        "sections": [],
    }
