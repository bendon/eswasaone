"""Pydantic schema for registry workflow YAML (map §1.1)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class DisplayMaps(BaseModel):
    customer: dict[str, str] = Field(default_factory=dict)
    staff: dict[str, str] = Field(default_factory=dict)


class StateDef(BaseModel):
    name: str
    sla: str | None = None  # e.g. "3d", "paused", "1d claim"
    owner_role: str | None = None
    owner: str | None = None  # applicant | system | …
    allow_edit: str | None = None
    doc_status: Literal["0", "1", "2"] = "0"
    style: str = ""
    icon: str = ""
    is_optional_state: int = 0


class TransitionDef(BaseModel):
    action: str
    from_state: str = Field(alias="from")
    to: str
    actor: str
    reason: bool | Literal["required"] | None = None
    rules: list[str] = Field(default_factory=list)
    feed: dict[str, Any] | None = None
    surface: str | None = None
    allow_self_approval: int = 0
    condition: str | None = None  # Frappe transition condition Python
    when: str | None = None  # registry note; may map to condition later
    approvals_family: Literal["approve", "do", "alert"] | None = None

    model_config = {"populate_by_name": True}


class WorkflowRegistry(BaseModel):
    """One file per DocType."""

    doctype: str
    module: str
    workflow_name: str | None = None
    submit_gate: str | None = None
    emit: bool = True
    """When false, YAML is validated but fixtures are not written (future DocTypes)."""
    fixture_app: str | None = None
    """Repo-relative path to fixtures dir, e.g. apps/eswasa_certification/.../fixtures"""
    phase: Literal["port", "map", "declare"] = "port"
    """port = match live fixtures; map = target map names; declare = ERPNext native."""
    fixture_style: Literal["full", "minimal"] = "full"
    """full = Cert-style (parent/update_field); minimal = Standards-style child rows."""
    notes: str | None = None
    display: DisplayMaps = Field(default_factory=DisplayMaps)
    states: list[StateDef]
    transitions: list[TransitionDef]
    guards: list[str] = Field(default_factory=list)
    approvals_family: Literal["approve", "do", "alert"] = "approve"
    board_rollup: str | None = None
    allow_self_approval_default: int = 0

    @field_validator("states")
    @classmethod
    def _unique_states(cls, states: list[StateDef]) -> list[StateDef]:
        names = [s.name for s in states]
        if len(names) != len(set(names)):
            raise ValueError(f"duplicate state names: {names}")
        return states

    def resolved_workflow_name(self) -> str:
        return self.workflow_name or f"{self.doctype} Flow"
