# Multi-agent execution plan (host-adapted)

**Public:** `https://eswasaone.aiceafrica.com` — see `docs/PORTS.md`.  
**Functional SoT:** `docs/EswasaOne_INSTITUTION_FUNCTIONAL_SPEC.md`.

## Prior waves (done)

| Wave | Status |
|---|---|
| Roster v2 α–δ (~70% shell) | **done** |
| **STEP 0 — Foundation** | **done** — contract §2, fixture role freeze, Institution mock fallbacks removed |

---

## Sprint — Institution 100% (STEP 1→5)

Do **not** skip order gates. Report: `<module>: contract ✓ | fetch ✓ | workflow ✓ | rules <list> ✓`.

### Wave ε — launch now (parallel)

| ID | Codename | Owns (ONLY) | Mission | Gate |
|---|---|---|---|---|
| **S1** | **ApprovalsFrappe** | `apps/eswasa_governance/` | `list_approvals` + `act_on_approval` from real **Workflow Action / ToDo**; return `doctype`+`name`; no APR-* | **DONE** — WA/ToDo live; R-A1 partial; R-A2 escalate → S9 |
| **S2** | **CertRules** | `apps/eswasa_certification/` | Implement **R-C1…C7** (`hooks.py` doc_events + scheduler + Notification/Assignment fixtures). **R-C3 acceptance:** Certificate submit → Sales Invoice + QR + Register Entry + feed event | **DONE — R-C3 PASS** (CERT-2026-00005 → SINV + Register + QR + feed) |
| **S3** | **CoreThin** | `core/app/gateway/`, `core/app/schemas.py` | Thin BFF for OpenAPI already in contract: `/finance/invoices|revenue|budget`, `/hr/employees|leave|appraisals`, `/crm/leads|deals`, `/training/courses|enrolments|enrol`, `/tbt/subscribe`, governance list POSTs if missing. **No mock fallback** (502/503). Leave `/approvals` calling S1 methods | **DONE** — thin Frappe wires; 54 institution tests pass; blocked-on live module seed |
| **S4** | **InstPages** | `portals/institution-portal/` | Swap Finance/HR/CRM/LMS/Approvals/Marketing shells to contract fetch; surface 502 errors; invite roles already fixture-aligned | **DONE** — fetch wired + tsc clean; Core 502 → ErrorState |

### Wave ζ — after R-C3 green (**LAUNCHED**)

| ID | Codename | Owns | Mission |
|---|---|---|---|
| **S5** | **MetroRules** | `apps/eswasa_metrology/` | R-M1…M4 + Core already has jobs routes | **DONE** — R-M1…M4 smoke pass |
| **S6** | **StandardsRules** | `apps/eswasa_standards/` | R-S1…S4 + publish → e-store | **DONE** — rules + publish API; Core `/standards/publish` wired; Website Item stub |
| **S7** | **GovDeep** | `apps/eswasa_governance/` (meetings/resolutions/risks/pack) | R-G1…G3; pack assembly | **DONE** — R-G1…G3 + assemble_board_pack; Core pack POST wired |
| **S8** | **TbtIngest** | `apps/eswasa_tbt/`, `apps/eswasa_ingest/`, `ingest/` | R-T1…T3; alerts feed | **DONE** — R-T1…T3 smoke PASS; WA→Core stub |

### Wave η — after ≥2 workflows (**LAUNCHED** — gate met via Cert + Standards + Gov)

| ID | Codename | Owns | Mission |
|---|---|---|---|
| **S9** | **SlaFeed** | `core/app/events/`, adapters | SLA sweeps + webhook → `/ws/feed` | **DONE** — R-A2; OpenAPI `/events/sla/sweep` |
| **S10** | **AnalyticsAsk** | `core/app/gateway/` analytics + agent tools | `POST /analytics/ask` NL→Frappe bridge (**do not block on Insights**) | **DONE** — ask/reports/metric; R-D1/D2 delivery stub |
| **S11** | **EstoreVerify** | `apps/eswasa_estore/`, `apps/eswasa_verification/` | R-E1…E3; R-C3 register consumer | **DONE** — R-E1…E3; Core MoMo callback forward wired |

### Hard rules

1. **Contract first** — endpoints already in `contracts/openapi.yaml` (STEP 0). Regen types if you add fields: `npx openapi-typescript contracts/openapi.yaml -o contracts/types.ts` (+ copy to `portals/shared-ui/src/types.ts`). New paths = Orchestrator only.
2. **Own your folder** — no cross-edits. Shared `openapi.yaml` / `.env.example` = Orchestrator.
3. **No Institution mock numbers** — Core returns 502/503 when Frappe fails.
4. **Permissions** — Frappe RBAC; writes `confirm: true` + audit_log.
5. **Roles** — fixture names only (`Certification Officer`, not `Cert Officer`).
6. **Report** one-liner per agent: `S<n>: <done> | <blocked-on> | <stub-left>`.

### Sequence diagram

```
STEP 0 ✓
    │
    ├─► S1 ApprovalsFrappe ─┐
    ├─► S2 CertRules ───────┼─► R-C3 GATE ─┬─► S5 Metro · S6 Standards · S7 Gov · S8 TBT
    ├─► S3 CoreThin ────────┤              └─► S9 SLA/Feed · S10 Analytics · S11 Estore
    └─► S4 InstPages ───────┘
```
