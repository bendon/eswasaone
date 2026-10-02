# Mock UIs — fidelity source of truth

| File | Role | Vite target |
|---|---|---|
| **`eswasaone-customer-portal.html`** | **Service Portal SoT shell** — light top nav, Ask+featured Home, mobile bottom tabs + More, auth top-right | `portals/service-portal` |
| **`eswasaone-goals.html`** | **Goals library** (`/goals`) — navy page hero, search, category pills, goal cards | `portals/service-portal` `/goals` |
| **`eswasaone-goal-guide.html`** | **Guide page** (`/goals/:slug`) — steps main, rail, Related goals strip | `portals/service-portal` `/goals/:slug` |
| **`eswasaone-standards.html`** | **Standards & e-store catalogue SoT** (v5) — page hero, search, filters, cards, collections; chrome from ServiceLayout | `portals/service-portal` `/standards` |
| **`eswasaone-certification.html`** | **Certification catalogue SoT** — hero, action card, schemes, process, verify widget | `portals/service-portal` `/certification` |
| **`eswasaone-training.html`** | **Training catalogue SoT** — courses, upcoming sessions, learning paths | `portals/service-portal` `/training` |
| **`eswasaone-field.html`** | **Field ESS PWA SoT** — navy+gold mobile chrome, bottom tabs Home\|Audits\|Me\|More; Me Leave/Payslips/Claims/Profile; Audits checklist C/NC/N/A + sync | `portals/field-portal` |
| `eswasaone-institutional-portal.html` | Institution Portal shell SoT — **dark left rail** (keep; deliberate product split) | `portals/institution-portal` |
| **`eswasaone-institution-dashboard.html`** | **Institution Dashboard SoT** — ops strip (not marketing hero), KPI strip, priority queue, system status, revenue/plan, restrained modules grid | `portals/institution-portal` `/` |
| **`eswasaone-approvals.html`** | **Approvals inbox SoT** — SLA summary, Approvals/Tasks/Alerts tabs, bulk bar, expandable rows | `portals/institution-portal` `/approvals` |
| **`eswasaone-certification-institution.html`** | **Institution Certification SoT** — pipeline board (6 stages), list view, detail drawer with lifecycle timeline | `portals/institution-portal` `/certification` |
| **`eswasaone-hr.html`** | **HR & People SoT** — lifecycle ribbon (Plan→Hire→Onboard→Develop→Pay), Overview/Directory/Time off/Recruitment/Performance/Payroll | `portals/institution-portal` `/hr` |
| **`eswasaone-governance.html`** | **Board & Governance SoT** — Overview (next-meeting + pack track), Meetings, Board pack, Resolutions & actions, Risk heat map, Members & committees | `portals/institution-portal` `/board` |
| `eswasaone-system-administration.html` | **System Administration SoT** — Overview/Updates/Settings/**Access Security**/Users/Automation/Backups/Logs/Integrations (System Manager) | `portals/institution-portal` `/admin` |
| `eswasaone-guided-flow.html` | **Superseded for chrome** (old 248px rail). Keep for progressive-auth interaction notes only. |

## Service Portal — locked chrome (customer mock)

- **Desktop:** light top horizontal nav — logo · Home · **Goals** · Standards · Certification · Training · Export · Complaints · cart · auth (top-right). **No left sidebar.**
- **Mobile:** slim top (logo + cart + auth) + **bottom tab bar** (Home · **Goals** · Standards · Export · More) + More sheet. **No hamburger.**
- **Home = entry only:** Ask hero + featured goals + services. **Never stacks steps.** Selection → `/goals/:slug`.
- **Goals library** = browse-first catalogue; guides are generated + cached from the requirements graph.
- **Auth:** top-right only from `GET /api/auth/me`. Guest → Sign in; authed → avatar + name + Sign out.
- Institution keeps dark rail — do not unify shells.

## Standards catalogue (v5)

- Shared styles: `portals/shared-ui/src/styles/catalogue.css` (imported by `service.css`).
- React port: `portals/service-portal/src/pages/StandardsPage.tsx`.
- Abstracts only in free UI; licensed full text via e-store purchase.

## Certification catalogue

- Shared styles: `portals/shared-ui/src/styles/certification.css`.
- React port: `portals/service-portal/src/pages/CertificationPage.tsx`.
- Apply flow still confirm-before-commit on submit (`CertificationApplyPage`).

## Training catalogue

- Shared styles: `portals/shared-ui/src/styles/training.css`.
- React port: `portals/service-portal/src/pages/TrainingPage.tsx`.
- Enrolment confirm-before-commit on detail (`TrainingDetailPage`).

## Institution Dashboard (ops, not landing)

- SoT: `docs/mocks/eswasaone-institution-dashboard.html`
- React: `portals/institution-portal/src/pages/InstitutionHomePage.tsx` (scoped `.dash` styles in `index.css`)
- Replaces marketing hero with ops strip + priority queue; modules are restrained navy tiles (no colour wheel)
- Ask lives in ops search + shared `Dock` on the institution shell

## Institution Approvals inbox

- Shared styles: `portals/shared-ui/src/styles/approvals.css` (imported by `institution.css`).
- React port: `portals/institution-portal/src/pages/ApprovalsPage.tsx`.
- Live `GET /approvals` mapped into Approvals / Tasks / Alerts; empty queue falls back to SoT fixtures.
- Writes stay confirm-before-commit via `POST /approvals/{doctype}/{name}/act`.

## Institution Certification pipeline

- Shared styles: `portals/shared-ui/src/styles/cert-pipeline.css` (imported by `institution.css`).
- React port: `portals/institution-portal/src/pages/CertificationPage.tsx`.
- Live `GET /certification/applications` mapped into 6-stage pipeline; empty queue falls back to SoT fixtures.
- Advances confirm-before-commit via `POST /certification/applications/{id}/advance`.
- Pipeline → List toggle; detail drawer with lifecycle timeline + documents.

## Institution HR & People

- SoT: `docs/mocks/eswasaone-hr.html`
- React: `portals/institution-portal/src/pages/HrPage.tsx` + `src/hr/*` (scoped `.hr` styles in `index.css`)
- Tabs: Overview · Directory · Time off · Recruitment · Performance · Payroll (Access via secondary link)
- Lifecycle ribbon navigates Plan→Hire→Onboard→Develop→Pay
- Live `GET /hr/summary|employees|leave|appraisals`; MSW enriches offline demos
- Recruitment / Payroll shells use fixtures + Desk deep-links (`VITE_FRAPPE_URL` / `VITE_DESK_URL`)
- Invite staff → existing `POST /auth/invite-staff`

## Layout — sticky footer

- `#root` / `body` / `main.wrap` / `.content` are flex column with `min-height: 100dvh`.
- `.site-footer` uses `margin-top: auto` + `min-height: 120px` so short pages keep the footer at the bottom.

## React port caveats

- Swap mock `setTimeout` → `POST /api/guide` (free-text) or cached goal payload (catalogue slugs); `fakeLogin` → real auth (`session` client).
- Escape / text-bind `title` / `detail` / `label` — never `dangerouslySetInnerHTML` for server strings.

Canonical guide payloads: `docs/fixtures/guide-honey.json`, `guide-iso9001.json` (also under `portals/service-portal/src/mocks/fixtures/`).
