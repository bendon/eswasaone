# Copyright (c) 2026, ESWASA and contributors
# License: MIT

"""eswasa_governance (WS3 / A6 RegLive) — Board & governance.

**DocTypes:** Board Resolution, Risk Register Entry, Board Pack

**Workflow:** Draft → Review → Adopted (Board Resolution + Board Pack)

## Whitelisted API (A4 / Core)

| Method | Notes |
|--------|--------|
| `eswasa_governance.api.list_approvals` | OpenAPI approvals queue — Workflow Action + referenced ToDo; `id` = `{doctype}::{name}` (no APR-*) |
| `eswasa_governance.api.act_on_approval` | `approve\|reject\|return` + `confirm=true` → Frappe `apply_workflow` as session user |
| `eswasa_governance.api.get_board_pack_summary` | OpenAPI `BoardPackSummary` / `/governance/board-pack` — `due_label`, `outstanding_sections`, `sections` |
| `eswasa_governance.api.assemble_board_pack` | OpenAPI `POST /governance/pack/{meeting}` — assemble from module reports (`confirm=true`) |
| `eswasa_governance.api.list_board_packs` | Board Pack list |
| `eswasa_governance.api.list_resolutions` | Board Resolution list (`status` = workflow_state) |
| `eswasa_governance.api.list_risks` | Risk Register Entry list |

## Rules (R-G1…G3)

| Rule | Trigger | Effect |
|------|---------|--------|
| **R-G1** | Daily cron — Board Pack `meeting_date` = today+7d | Assemble pack from module DocType summaries; feed `BOARD`; email/ToDo secretary for outstanding sections |
| **R-G2** | Board Resolution → `Adopted` | Action-item ToDos for proposer/seconder (or Board Secretary); closure feed when all R-G2 ToDos close |
| **R-G3** | Risk Register Entry High severity | Exec feed alert; set `next_review_date` cadence (7d Critical / 14d High) |

Logic: `eswasa_governance.rules` + `approvals` (queue). Feed/realtime clones the certification `publish_feed` pattern.
"""
