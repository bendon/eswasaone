"""Generate Frappe workflow fixtures from registry YAML."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from eswasa_registry.schema import WorkflowRegistry

REPO_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_DIR = Path(__file__).resolve().parents[1] / "registry" / "workflows"
GENERATED_DIR = Path(__file__).resolve().parents[1] / "generated"


def load_all() -> list[tuple[Path, WorkflowRegistry]]:
    files = sorted(REGISTRY_DIR.glob("*.yaml"))
    out: list[tuple[Path, WorkflowRegistry]] = []
    for path in files:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not data:
            continue
        out.append((path, WorkflowRegistry.model_validate(data)))
    return out


def _state_rows(reg: WorkflowRegistry) -> list[dict[str, Any]]:
    wf = reg.resolved_workflow_name()
    rows = []
    for s in reg.states:
        allow = s.allow_edit or s.owner_role or "All"
        if reg.fixture_style == "minimal":
            row: dict[str, Any] = {
                "state": s.name,
                "doc_status": s.doc_status,
                "allow_edit": allow,
                "is_optional_state": s.is_optional_state,
            }
        else:
            row = {
                "allow_edit": allow,
                "doc_status": s.doc_status,
                "parent": wf,
                "parentfield": "states",
                "parenttype": "Workflow",
                "state": s.name,
                "update_field": "workflow_state",
                "update_value": s.name,
            }
            if s.is_optional_state:
                row["is_optional_state"] = s.is_optional_state
        rows.append(row)
    return rows


def _transition_rows(reg: WorkflowRegistry) -> list[dict[str, Any]]:
    wf = reg.resolved_workflow_name()
    default_sa = reg.allow_self_approval_default
    rows = []
    for t in reg.transitions:
        sa = (
            t.allow_self_approval if t.allow_self_approval is not None else default_sa
        )
        if reg.fixture_style == "minimal":
            row: dict[str, Any] = {
                "state": t.from_state,
                "action": t.action,
                "next_state": t.to,
                "allowed": t.actor,
                "allow_self_approval": sa,
            }
        else:
            row = {
                "action": t.action,
                "allow_self_approval": sa,
                "allowed": t.actor,
                "next_state": t.to,
                "parent": wf,
                "parentfield": "transitions",
                "parenttype": "Workflow",
                "state": t.from_state,
            }
        if t.condition:
            row["condition"] = t.condition
        rows.append(row)
    return rows


def workflow_fixture(reg: WorkflowRegistry) -> list[dict[str, Any]]:
    wf = reg.resolved_workflow_name()
    if reg.fixture_style == "full":
        return [
            {
                "docstatus": 0,
                "doctype": "Workflow",
                "document_type": reg.doctype,
                "is_active": 1,
                "name": wf,
                "override_status": 0,
                "send_email_alert": 0,
                "states": _state_rows(reg),
                "transitions": _transition_rows(reg),
                "workflow_name": wf,
                "workflow_state_field": "workflow_state",
            }
        ]
    return [
        {
            "doctype": "Workflow",
            "name": wf,
            "workflow_name": wf,
            "document_type": reg.doctype,
            "is_active": 1,
            "override_status": 0,
            "send_email_alert": 0,
            "workflow_state_field": "workflow_state",
            "states": _state_rows(reg),
            "transitions": _transition_rows(reg),
        }
    ]


def workflow_state_fixture(reg: WorkflowRegistry) -> list[dict[str, Any]]:
    rows = []
    for s in reg.states:
        row: dict[str, Any] = {
            "doctype": "Workflow State",
            "name": s.name,
            "workflow_state_name": s.name,
            "style": s.style or "",
        }
        if reg.fixture_style == "full" or s.icon:
            row["icon"] = s.icon
        rows.append(row)
    return rows


def workflow_action_fixture(reg: WorkflowRegistry) -> list[dict[str, Any]]:
    seen: set[str] = set()
    rows = []
    for t in reg.transitions:
        if t.action in seen:
            continue
        seen.add(t.action)
        rows.append(
            {
                "doctype": "Workflow Action Master",
                "name": t.action,
                "workflow_action_name": t.action,
            }
        )
    return rows


def display_map_payload(reg: WorkflowRegistry) -> dict[str, Any]:
    return {
        "doctype": reg.doctype,
        "module": reg.module,
        "display": {
            "customer": reg.display.customer,
            "staff": reg.display.staff,
        },
        "approvals_family": reg.approvals_family,
        "board_rollup": reg.board_rollup,
        "states": [
            {
                "name": s.name,
                "sla": s.sla,
                "owner_role": s.owner_role,
                "owner": s.owner,
            }
            for s in reg.states
        ],
        "transitions": [
            {
                "action": t.action,
                "from": t.from_state,
                "to": t.to,
                "actor": t.actor,
                "rules": t.rules,
                "approvals_family": t.approvals_family,
                "surface": t.surface,
            }
            for t in reg.transitions
        ],
        "guards": reg.guards,
    }


def _normalize_json(obj: Any) -> Any:
    """Stable compare across key order and incidental fixture fields."""
    skip_keys = {
        "is_optional_state",
        "parent",
        "parentfield",
        "parenttype",
        "update_field",
        "update_value",
        "docstatus",
        "icon",  # often absent on minimal ports
    }
    if isinstance(obj, list):
        normalized = [_normalize_json(x) for x in obj]
        if normalized and isinstance(normalized[0], dict):
            if "workflow_state_name" in normalized[0] or (
                normalized[0].get("doctype") == "Workflow State"
            ):
                return sorted(
                    normalized,
                    key=lambda r: r.get("workflow_state_name") or r.get("name") or "",
                )
            if "workflow_action_name" in normalized[0] or (
                normalized[0].get("doctype") == "Workflow Action Master"
            ):
                return sorted(
                    normalized,
                    key=lambda r: r.get("workflow_action_name") or r.get("name") or "",
                )
            if "next_state" in normalized[0] and "action" in normalized[0]:
                return sorted(
                    normalized,
                    key=lambda r: (
                        r.get("state") or "",
                        r.get("action") or "",
                        r.get("next_state") or "",
                    ),
                )
            if "state" in normalized[0] and "allow_edit" in normalized[0]:
                return sorted(normalized, key=lambda r: r.get("state") or "")
        return normalized
    if isinstance(obj, dict):
        out = {}
        for k, v in sorted(obj.items()):
            if k in skip_keys or v is None:
                continue
            if k == "style" and v == "":
                continue
            out[k] = _normalize_json(v)
        return out
    return obj


def _find_workflow(deployed: Any, reg: WorkflowRegistry) -> dict[str, Any] | None:
    if not isinstance(deployed, list):
        return None
    wf_name = reg.resolved_workflow_name()
    for row in deployed:
        if not isinstance(row, dict):
            continue
        if row.get("name") == wf_name or row.get("workflow_name") == wf_name:
            return row
        if row.get("document_type") == reg.doctype:
            return row
    return None


def _names_from_states(rows: list[dict[str, Any]]) -> set[str]:
    return {
        (r.get("workflow_state_name") or r.get("name") or "")
        for r in rows
        if isinstance(r, dict)
    }


def _names_from_actions(rows: list[dict[str, Any]]) -> set[str]:
    return {
        (r.get("workflow_action_name") or r.get("name") or "")
        for r in rows
        if isinstance(r, dict)
    }


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _dump_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def fixture_paths(reg: WorkflowRegistry) -> dict[str, Path] | None:
    if not reg.emit or not reg.fixture_app:
        return None
    base = REPO_ROOT / reg.fixture_app
    return {
        "workflow": base / "workflow.json",
        "workflow_state": base / "workflow_state.json",
        "workflow_action_master": base / "workflow_action_master.json",
    }


def _merge_workflow_list(existing: Any, incoming: list[dict[str, Any]]) -> list[dict[str, Any]]:
	"""Upsert workflows by name; keep unrelated DocType workflows in the same file."""
	rows: list[dict[str, Any]] = []
	if isinstance(existing, list):
		rows = [r for r in existing if isinstance(r, dict)]
	by_key: dict[str, int] = {}
	for i, r in enumerate(rows):
		key = r.get("name") or r.get("workflow_name") or ""
		if key:
			by_key[key] = i
	for row in incoming:
		key = row.get("name") or row.get("workflow_name") or ""
		if key and key in by_key:
			rows[by_key[key]] = row
		else:
			rows.append(row)
			if key:
				by_key[key] = len(rows) - 1
	return rows


def _merge_named_pool(existing: Any, incoming: list[dict[str, Any]], name_keys: tuple[str, ...]) -> list[dict[str, Any]]:
	"""Union shared Workflow State / Action Master pools by name."""
	rows: list[dict[str, Any]] = []
	if isinstance(existing, list):
		rows = [r for r in existing if isinstance(r, dict)]
	seen: set[str] = set()
	for r in rows:
		for k in name_keys:
			if r.get(k):
				seen.add(str(r[k]))
				break
	for row in incoming:
		name = ""
		for k in name_keys:
			if row.get(k):
				name = str(row[k])
				break
		if name and name in seen:
			continue
		rows.append(row)
		if name:
			seen.add(name)
	return rows


def _write_fixtures_merged(paths: dict[str, Path], artifacts: dict[str, list]) -> list[str]:
	written: list[str] = []
	# workflow.json — upsert by workflow name
	wf_path = paths["workflow"]
	existing_wf = _load_json(wf_path) if wf_path.exists() else []
	merged_wf = _merge_workflow_list(existing_wf, artifacts["workflow"])
	_dump_json(wf_path, merged_wf)
	written.append(str(wf_path.relative_to(REPO_ROOT)))

	state_path = paths["workflow_state"]
	existing_st = _load_json(state_path) if state_path.exists() else []
	merged_st = _merge_named_pool(
		existing_st,
		artifacts["workflow_state"],
		("name", "workflow_state_name"),
	)
	_dump_json(state_path, merged_st)
	written.append(str(state_path.relative_to(REPO_ROOT)))

	action_path = paths["workflow_action_master"]
	existing_ac = _load_json(action_path) if action_path.exists() else []
	merged_ac = _merge_named_pool(
		existing_ac,
		artifacts["workflow_action_master"],
		("name", "workflow_action_name"),
	)
	_dump_json(action_path, merged_ac)
	written.append(str(action_path.relative_to(REPO_ROOT)))
	return written


def build_one(
    reg: WorkflowRegistry, *, write: bool, write_fixtures: bool = False
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "doctype": reg.doctype,
        "emit": reg.emit,
        "phase": reg.phase,
        "written": [],
        "skipped": None,
    }
    if not reg.emit:
        result["skipped"] = "emit: false"
        return result

    paths = fixture_paths(reg)
    if not paths:
        result["skipped"] = "no fixture_app"
        return result

    artifacts = {
        "workflow": workflow_fixture(reg),
        "workflow_state": workflow_state_fixture(reg),
        "workflow_action_master": workflow_action_fixture(reg),
    }
    result["artifacts"] = artifacts

    if write:
        gen = GENERATED_DIR / "display_maps" / f"{reg.module}_{_slug(reg.doctype)}.json"
        _dump_json(gen, display_map_payload(reg))
        result["written"].append(str(gen.relative_to(REPO_ROOT)))

        if write_fixtures:
            result["written"].extend(_write_fixtures_merged(paths, artifacts))
        else:
            result["fixtures_note"] = (
                "fixtures not written (pass --fixtures after check is green "
                "and you intend to refresh Desk JSON)"
            )

    return result


def _slug(name: str) -> str:
    return name.lower().replace(" ", "_")


def check_one(reg: WorkflowRegistry) -> list[str]:
    """Return list of drift messages (empty = ok).

    Workflow JSON may hold multiple DocType workflows (e.g. governance).
    State/action masters are shared pools — registry must be a subset.
    """
    errs: list[str] = []
    if not reg.emit:
        return errs
    paths = fixture_paths(reg)
    if not paths:
        return errs

    wf_path = paths["workflow"]
    if not wf_path.exists():
        errs.append(f"{reg.doctype}: missing deployed fixture {wf_path}")
        return errs

    deployed_list = _load_json(wf_path)
    got = _find_workflow(deployed_list, reg)
    if got is None:
        errs.append(
            f"{reg.doctype}: workflow "
            f"{reg.resolved_workflow_name()!r} not found in {wf_path.relative_to(REPO_ROOT)}"
        )
    else:
        exp = workflow_fixture(reg)[0]
        if _normalize_json(got) != _normalize_json(exp):
            errs.append(
                f"{reg.doctype}: drift in workflow definition "
                f"({wf_path.relative_to(REPO_ROOT)})"
            )

    # Shared masters: every registry name must exist in the fixture pool.
    exp_states = workflow_state_fixture(reg)
    state_path = paths["workflow_state"]
    if not state_path.exists():
        errs.append(f"{reg.doctype}: missing {state_path}")
    else:
        got_names = _names_from_states(_load_json(state_path))
        missing = _names_from_states(exp_states) - got_names
        if missing:
            errs.append(
                f"{reg.doctype}: workflow_state missing {sorted(missing)} "
                f"in {state_path.relative_to(REPO_ROOT)}"
            )

    exp_actions = workflow_action_fixture(reg)
    action_path = paths["workflow_action_master"]
    if not action_path.exists():
        errs.append(f"{reg.doctype}: missing {action_path}")
    else:
        got_names = _names_from_actions(_load_json(action_path))
        missing = _names_from_actions(exp_actions) - got_names
        if missing:
            errs.append(
                f"{reg.doctype}: workflow_action_master missing {sorted(missing)} "
                f"in {action_path.relative_to(REPO_ROOT)}"
            )

    return errs


def build_all(*, write: bool, write_fixtures: bool = False) -> list[dict[str, Any]]:
    return [
        build_one(reg, write=write, write_fixtures=write_fixtures) for _, reg in load_all()
    ]


def check_all() -> list[str]:
    errs: list[str] = []
    for _, reg in load_all():
        errs.extend(check_one(reg))
    return errs
