# Multi-agent — Frontend Workflow Capture Sprint

> Companion to the Institution backend sprint (`docs/MULTIAGENT.md`).
> Backend R-* rules are done; this sprint makes workflows **drivable end-to-end from the UI**.

**Public:** `https://eswasaone.aiceafrica.com`  
**Gate rule:** Wave *n+1* starts only after Wave *n* gate report.

---

## Frozen path mapping (roster → tree)

### Wave 0

| WS | Owns (ONLY) | Out of bounds |
|---|---|---|
| **F0a** | `portals/shared-ui/src/{components,api,auth,index.ts}` + CSS barrels only | Portal pages; `contracts/`; `core/` |
| **F0b** | `contracts/openapi.yaml` → regen `contracts/types.ts` + `portals/shared-ui/src/types.ts`; `core/app/gateway/`; `core/app/schemas.py`; `core/tests/` | Portal UI |
| **F0c** | `docs/nginx/*`; `portals/*/vite.config.ts`; Service `router.tsx` `/estore/*` stubs | Feature UIs beyond routes/hosting |
| **F0d** | `e2e/` Playwright scaffold | Module feature code |

### Wave 1

| WS | Owns (ONLY) |
|---|---|
| **S1** | `portals/service-portal/src/estore/**`; account orders; cart; `/estore/*` pages |
| **I1** | `portals/institution-portal/src/standards/**`; `pages/StandardsPage.tsx` |
| **I2** | `portals/institution-portal/src/certification/**`; `pages/CertificationPage.tsx`; **owns** shared audit client types for X1 |
| **X1** | `portals/field-portal/src/**` (imports I2 audit types only) |
| **I3** | `portals/institution-portal/src/approvals/**`; `pages/ApprovalsPage.tsx` |

### Hard shared (Orchestrator / F0 only)

`contracts/openapi.yaml`, `.env.example`, `AGENTS.md`, `docs/PORTS.md`, nginx drafts.

---

## §0 sprint rules (summary)

1. No fixture commits unless `VITE_DEMO_MODE=true` (+ DemoBadge; writes disabled).
2. Writes only through Core `/api/...`.
3. State-driven actions via `allowed_actions[]` / `<StateActions>`.
4. Confirm-before-commit via `<ConfirmAction>` (rule id visible).
5. Real errors; 403 hides action next render.
6. No TODO toasts / Coming soon — wire or `<DeskLink>`.
7. Desk-only per §6 register.

---

## Wave status

| Wave | Status | Notes |
|---|---|---|
| 0 Foundations | **GATE — see report below** | F0a/F0b/F0c/F0d landed 2026-09-24 |
| 1 Revenue + regulatory | ready to assign after gate sign-off | S1 · I1 · I2 · X1 · I3 |
| 2 Remaining writes | — | |
| 3 Operating surfaces | — | |

### Wave 0 gate report (2026-09-24)

| WS | Done | Blocked-on | Stub-left |
|---|---|---|---|
| **F0a** | ConfirmAction, DemoBadge/useDemoMode, DeskLink, StateActions, FormDrawer (typed fields), FileDownload, useLiveFeed, UserPicker alias | — | Meta `GET /api/meta/:doctype` FormDrawer (deferred) |
| **F0b** | Wave-1 paths in `openapi.yaml` + `core/app/gateway/wave1.py` mounted; `wave1Contract.ts`; pytest `test_wave1_routes` | Full yaml↔gateway sync (types.ts still richer than yaml — **do not regen types from thin yaml alone**) | Frappe whitelist methods for patch_audit / vote / etc. |
| **F0c** | `/estore/checkout` + `/estore/orders/:id` route shells; nginx draft 503 if field down; field ProfilePane fix; field Vite on :3017 | Live nginx reload for draft `error_page`; public `/field/` was mis-serving Service when :3017 down | Static `try_files` prod deploy |
| **F0d** | `e2e/` Playwright scaffold + wave0-smoke | `npm install` + chromium on runner | Wave-1 workflow specs |

**Gate decision:** Wave 1 agents may start. They must use F0a primitives + wave1 routes; must not regen `types.ts` from incomplete OpenAPI; must not commit fixtures outside `VITE_DEMO_MODE`.

**Ops:** Restart Core uvicorn to load `wave1` router. Ensure field stays on `127.0.0.1:3017`. Apply nginx draft when ready.
