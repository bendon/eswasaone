# eswasa_core — workflow registry

Machine-readable source of truth for EswasaOne workflows (`docs/EswasaOne_WORKFLOW_MAP.md` §1 / §6).

```
eswasa_core/
├── registry/workflows/*.yaml   ← edit these
├── eswasa_registry/            ← build CLI + schema
└── tests/
```

## Commands

```bash
cd /srv/projects/eswasaone/eswasa_core
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m eswasa_registry list
.venv/bin/python -m eswasa_registry check     # CI gate: registry ≡ deployed fixtures
.venv/bin/python -m eswasa_registry build     # write display maps only
.venv/bin/python -m eswasa_registry build --fixtures   # also rewrite Desk JSON (opt-in)
.venv/bin/pytest
```

Bench alias (optional): `bench eswasa-registry …` can wrap the same module once wired in engine.

## Phase rules (map §6)

1. **Port first.** Emit YAMLs mirror live Desk fixtures. `check` must pass with zero semantic drift.
2. **Shared fixture dirs.** Governance packs two workflows into one `workflow.json`; check matches by workflow name and treats state/action masters as a shared pool (subset).
3. **Promote later.** Map stage names and `allow_self_approval: 0` land in a deliberate rename PR.
4. **Field Visit / Sample** stay `emit: false` until DocTypes are ready.

## Ported (emit: true)

| YAML | DocType | App |
|---|---|---|
| `certification_application.yaml` | Certification Application | eswasa_certification |
| `work_item.yaml` | Work Item | eswasa_standards |
| `calibration_job.yaml` | Calibration Job | eswasa_metrology |
| `tbt_notification.yaml` | TBT Notification | eswasa_tbt |
| `board_resolution.yaml` | Board Resolution | eswasa_governance |
| `board_pack.yaml` | Board Pack | eswasa_governance |

## Skeletons (emit: false)

| YAML | DocType |
|---|---|
| `field_visit.yaml` | Field Visit |
| `sample.yaml` | Sample |

## Outputs per YAML (`emit: true`)

- `workflow.json` / `workflow_state.json` / `workflow_action_master.json` under `fixture_app`
- Optional: `generated/display_maps/<module>.json` for Core
