# EswasaOne — Institution Portal: Full Functional & Automation Specification

> Definitive "100% functional" spec for the ESWASA institution side.
> Companion execution plan: STEP 0→5 in `docs/MULTIAGENT.md` / agent briefs.
> Source of truth for endpoints, workflows, and rules (R-*).

## 0. What "100% functional" means

A module is done when: every KPI/list/chart is **queried from Frappe via Core** (no mock arrays); every stateful record moves through an enforced **workflow**; every business rule fires as a **Frappe event or scheduled job**; SLAs are tracked; notifications use the right channel; the **assistant feed** is event-driven.

## 1. Module → platform mapping

Legend: **N** ERPNext · **C** companion · **X** custom Frappe app · **K** Core/agent.

| # | Module | Disposition | Primary DocTypes |
|---|---|---|---|
| 1 | Executive Dashboard | K + Insights (C) | (aggregate) |
| 2 | Approvals | Workflow (N) + K | Workflow Action, ToDo |
| 3 | Board & Governance | X `eswasa_governance` | Board Meeting, Resolution, Risk, Pack |
| 4 | CRM & Commercial | C Frappe CRM | Lead, Deal, Contact, Organization |
| 5 | Certification | X `eswasa_certification` | Application, Audit, Certificate, … |
| 6 | Standards Development | X `eswasa_standards` | Work Item, Draft, Ballot, … |
| 7 | Metrology & LIMS | X `eswasa_metrology` | Job, Result, Instrument, … |
| 8 | LMS & Training | C Frappe LMS | Course, Batch, Enrollment |
| 9 | WTO/TBT + Ingest | X `eswasa_tbt` + `eswasa_ingest` | TBT Notification, Source, … |
| 10 | Finance | N Accounting | Sales Invoice, Payment Entry, Budget |
| 11 | HR & People | C Frappe HR | Employee, Leave, Appraisal |
| 12 | Marketing | N/C + light X | Email Campaign, Newsletter |
| 13 | Reports & Analytics | C Insights + K | Insights Query / Core NL bridge |

## 2. Core endpoints (contract)

All under `/api`. Staff routes require session + Frappe permissions.

### Approvals
- `GET /approvals` — Workflow Action / ToDo aggregate for current user
- `POST /approvals/{doctype}/{name}/act` — `{ action, comment?, confirm: true }` (no `decide`, no `APR-*`)

### Certification
- `GET|POST /certification/applications`
- `GET /certification/applications/{id}`
- `POST /certification/applications/{id}/advance`
- `GET /certification/audits/overdue`
- `GET|POST /certification/audits`, `GET|POST /certification/certificates`

### Standards
- `GET|POST /standards/workitems|drafts|comments|ballots`
- `POST /standards/publish`

### Metrology
- `GET|POST /metrology/jobs|instruments|results`
- `POST /metrology/jobs/{job}/certificate`

### Governance
- `GET|POST /governance/meetings|resolutions|risks`
- `GET /governance/board-pack`
- `POST /governance/pack/{meeting}`

### CRM
- `GET /crm/pipeline`
- `GET|POST /crm/leads|deals`

### Training (LMS)
- `GET /training/courses|enrolments`
- `POST /training/enrol`

### TBT
- `GET /tbt/alerts` (**not** `/tbt/notifications`)
- `POST /tbt/subscribe`

### Finance
- `GET /finance/kpis`
- `GET|POST /finance/invoices`
- `GET /finance/revenue|budget`

### HR
- `GET /hr/summary`
- `GET /hr/employees|leave|appraisals`
- `POST /hr/leave`
- `POST /auth/invite-staff` (existing)

### Marketing
- `GET|POST /marketing/campaigns`

### Analytics
- `POST /analytics/ask`
- `GET /analytics/reports`
- `GET /analytics/{metric}`
- `WS /ws/feed`

### Home
- `GET /home/institution` — composed KPIs + feed preview (Frappe only)

## 3. Roles (Frappe fixtures — single source of truth)

Portal `staff.ts` and Core `STAFF_ROLES` **must match fixture names**. No aliases (`Cert Officer` ✗ → `Certification Officer` ✓).

| Fixture role | Module write |
|---|---|
| System Manager / Administrator / Desk User | all |
| Certification Manager / Officer / Auditor | Certification |
| Eswasa Metrology Manager / Officer / Reviewer | Metrology |
| Eswasa Standards Manager / Officer / TC Member | Standards |
| Eswasa Board Secretary / Member / Risk Officer | Governance |
| Eswasa TBT Officer / Analyst | TBT |
| HR Manager / HR User | HR |
| Accounts Manager / Accounts User | Finance |
| Sales Manager / Sales User | CRM / Marketing |
| Eswasa Estore Manager / Clerk | e-store |
| Eswasa Verification Officer | Verify |
| Ingest Curator / Viewer | Ingest |

## 4. Automation layers

- **A** Frappe `doc_events` + `scheduler_events` + Workflow + Notification + Assignment Rule
- **B** Core event bus → `/ws/feed` + email/SMS/WA/MoMo adapters
- **C** Agent tools (permission-bound, audit-logged)

## 5. Rules catalogue (IDs)

Certification R-C1…C7 · Metrology R-M1…M4 · Standards R-S1…S4 · TBT R-T1…T3 · E-store R-E1…E3 · Finance R-F1…F4 · HR R-H1…H4 · Governance R-G1…G3 · Approvals R-A1…A2 · Analytics R-D1…D2.

**R-C3 gate (project):** Certificate `on_submit` → PDF+QR + Register Entry + Sales Invoice + feed "APPROVED".

## 6. Execution order (do not skip)

0. Foundation — contract + naming freeze + seed-over-mocks (this PR)
1. Approvals real Workflow Action / ToDo act
2. Certification vertical + R-C3 gate
3. Thin N/C — Finance, HR, CRM, LMS
4. Clone pattern — Metrology → Standards → Governance → TBT → e-store/Verify
5. SLA + feed bus; Analytics/Ask on Core NL bridge (do not block on Insights)

## 7. Definition of done (per module)

contract endpoint · Core→Frappe permission-bound · page fetch not constants · workflow rejects illegal transitions · §5 rules fire to feed/email/invoice.

Report: `<module>: contract ✓ | fetch ✓ | workflow ✓ | rules <list> ✓`
