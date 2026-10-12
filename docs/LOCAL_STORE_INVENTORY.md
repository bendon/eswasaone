# EswasaOne — Local Store Inventory

> **Purpose:** Track every prototype local store feature, its target Frappe DocType / Core endpoint, wiring status, and owning sprint.
> Updated: 2026-10-09 — Step 0 of the Approvals fix brief.

## Legend

| Status | Meaning |
|---|---|
| **LIVE** | Wired to real Core/Frappe endpoint via `apiFetch` or `liveApi.ts`. Works when `VITE_DEMO_MODE=false`. |
| **STUB** | Returns `[]` / `null` / default when `VITE_DEMO_MODE=false`. No crash, but no data. Screen shows `NotConnectedPanel`. |
| **DEMO** | Only works with demo data. Throws `NotConnectedError` or `CrmNotConnectedError` when `VITE_DEMO_MODE=false`. |
| **N/A** | Not yet built — no prototype feature exists. |

---

## 1. Certification Store (`certStore`)

**File:** `portals/shared-ui/src/certification/store.ts`
**Live API bridge:** `portals/shared-ui/src/certification/liveApi.ts`

| Feature | Function | Target Endpoint / DocType | Status | Sprint |
|---|---|---|---|---|
| List applications | `listApplications()` | `GET /api/certification/applications` → `Certification Application` DocType | **LIVE** | S1 |
| Get application | `getApplication()` | `GET /api/certification/applications/{id}` | **LIVE** | S1 |
| Act on application | `actOnApplication()` | `POST /api/certification/applications/{id}/act` | **LIVE** | S1 |
| Create application | `createApplication()` | `POST /api/certification/applications` | **LIVE** | S1 |
| Application actions | `appActions()` | `GET /api/certification/applications/{id}/act` (peek from cache) | **LIVE** | S1 |
| Peek application | `peekApplication()` | Reads from `liveAppCache` map | **LIVE** | S1 |
| List schemes | `listSchemes()` | `GET /api/certification/schemes` | **LIVE** | S1 |
| Cert settings | `getCertSettings()` | `GET /api/certification/settings` | **LIVE** | S1 |
| List certificates | `listCertificates()` | `GET /api/certification/certificates` → `Certification Certificate` DocType | **STUB** | S2 |
| Get certificate | `getCertificate()` | `GET /api/certification/certificates/{id}` | **STUB** | S2 |
| List audits | `listAudits()` | `GET /api/certification/audits` → `Certification Audit` DocType | **STUB** | S2 |
| List NCs | `listNcs()` | `GET /api/certification/ncs` → `Non Conformance` DocType | **STUB** | S2 |
| List quotes | `listQuotes()` | `GET /api/certification/quotes` → `Certification Quote` DocType | **STUB** | S2 |
| Get quote | `getQuote()` | `GET /api/certification/quotes/{id}` | **STUB** | S2 |
| Act on quote | `actOnQuote()` | `POST /api/certification/quotes/{id}/act` | **STUB** | S2 |

---

## 2. CRM Store (`crmStore` via `useCrm`)

**File:** `portals/shared-ui/src/crm/store.ts`
**Guard:** `crmDemoMode()` — returns `false` when `VITE_DEMO_MODE=false`.

| Feature | Function | Target Endpoint / DocType | Status | Sprint |
|---|---|---|---|---|
| List opportunities/deals | `listOpportunities()` | `GET /api/crm/deals` → `CRM Deal` DocType | **LIVE** | S1 |
| List cases | `listCases()` | `GET /api/crm/cases` → `Complaint` / `Case` DocType | **STUB** | S2 |
| List my cases | `listMyCases()` | `GET /api/crm/cases?email=…` | **STUB** | S2 |
| Get case | `getCase()` | `GET /api/crm/cases/{ref}` | **STUB** | S2 |
| Act on case | `actOnCase()` | `POST /api/crm/cases/{ref}/act` | **STUB** | S2 |
| List clients | `listClients()` | `GET /api/crm/clients` → `Customer` / `CRM Contact` DocType | **STUB** | S2 |
| Get client | `getClient()` | `GET /api/crm/clients/{id}` | **STUB** | S2 |
| List signals | `listSignals()` | `GET /api/crm/signals` → `CRM Signal` DocType | **STUB** | S3 |
| List quotes | `listQuotes()` | `GET /api/crm/quotes` → `CRM Quote` DocType | **STUB** | S2 |
| List customer quotes | `listQuotesForCustomer()` | `GET /api/crm/quotes?email=…` | **STUB** | S2 |
| List articles | `listArticles()` | `GET /api/crm/articles` → `Knowledge Article` DocType | **STUB** | S3 |
| List contracts | `listContracts()` | `GET /api/crm/contracts` → `Contract` DocType | **STUB** | S3 |
| List campaigns | `listCampaigns()` | `GET /api/crm/campaigns` → `Campaign` DocType | **STUB** | S3 |
| NPS summary | `npsSummary()` | `GET /api/crm/nps` → `NPS Survey` DocType | **STUB** | S3 |
| List deliveries | `listDeliveries()` | `GET /api/crm/deliveries` → `Communication` DocType | **STUB** | S2 |
| CRM config | `publicCrmConfig()` | `GET /api/crm/config` → `CRM Settings` DocType | **STUB** | S2 |
| List contacts | `listContacts()` | `GET /api/crm/contacts` → `Contact` DocType | **STUB** | S2 |
| List renewals | `listRenewals()` | `GET /api/crm/renewals` | **STUB** | S3 |
| Request field visit | `requestFieldVisit()` | `POST /api/crm/cases/{ref}/field-visit` | **STUB** | S2 |
| Record appeal decision | `recordAppealDecision()` | `POST /api/crm/cases/{ref}/appeal-decision` | **STUB** | S2 |

---

## 3. Metrology Store (`metStore`)

**File:** `portals/shared-ui/src/metrology/store.ts`

| Feature | Function | Target Endpoint / DocType | Status | Sprint |
|---|---|---|---|---|
| List jobs | `listJobs()` | `GET /api/metrology/jobs` → `Calibration Job` DocType | **LIVE** | S1 |
| Get job | `getJob()` | `GET /api/metrology/jobs/{id}` | **STUB** | S2 |
| List certificates | `listCalCertificates()` | `GET /api/metrology/certificates` → `Calibration Certificate` DocType | **STUB** | S2 |
| Get certificate | `getCalCertificate()` | `GET /api/metrology/certificates/{id}` | **STUB** | S2 |
| Create job | `createJob()` | `POST /api/metrology/jobs` | **STUB** | S2 |
| Act on job | `actOnJob()` | `POST /api/metrology/jobs/{id}/act` | **STUB** | S2 |

---

## 4. Standards Store (`stdStore`)

**File:** `portals/shared-ui/src/standards/store.ts`

| Feature | Function | Target Endpoint / DocType | Status | Sprint |
|---|---|---|---|---|
| List catalogue | `listCatalogue()` | `GET /api/standards` → `Standard` DocType | **LIVE** | S1 |
| Get catalogue entry | `getCatalogueEntry()` | `GET /api/standards/{id}` | **STUB** | S2 |
| List work items | `listWorkItems()` | `GET /api/standards/workitems` → `Work Item` DocType | **STUB** | S2 |
| Get work item | `getWorkItem()` | `GET /api/standards/workitems/{id}` | **STUB** | S2 |
| List TCs | `listTcs()` | `GET /api/standards/tcs` → `Technical Committee` DocType | **STUB** | S2 |
| Get TC | `getTc()` | `GET /api/standards/tcs/{id}` | **STUB** | S2 |
| List proposals | `listProposals()` | `GET /api/standards/proposals` → `NWIP` DocType | **STUB** | S3 |
| Submit proposal | `submitProposal()` | `POST /api/standards/proposals` | **STUB** | S3 |
| List comments | `listComments()` | `GET /api/standards/workitems/{id}/comments` → `Draft Comment` DocType | **STUB** | S2 |
| Submit comments | `submitComments()` | `POST /api/standards/workitems/{id}/comments` | **STUB** | S2 |
| List ballots | `listBallots()` | `GET /api/standards/ballots` → `Ballot` DocType | **STUB** | S3 |
| Cast vote | `castVote()` | `POST /api/standards/ballots/{id}/vote` | **STUB** | S3 |
| Standards settings | `getStdSettings()` | `GET /api/standards/settings` | **STUB** | S2 |

---

## 5. Field Service Store (`fieldStore`)

**File:** `portals/shared-ui/src/field/store.ts`

| Feature | Function | Target Endpoint / DocType | Status | Sprint |
|---|---|---|---|---|
| List visits | `listVisits()` | `GET /api/field/visits` → `Field Visit` DocType | **STUB** | S2 |
| Get visit | `getVisit()` | `GET /api/field/visits/{id}` | **STUB** | S2 |
| List samples | `listSamples()` | `GET /api/field/samples` → `Sample` DocType | **STUB** | S2 |
| List dispatches | `listDispatches()` | `GET /api/field/dispatches` → `Dispatch` DocType | **STUB** | S2 |
| Enqueue offline action | `enqueue()` | `POST /api/field/outbox` | **STUB** | S2 |

---

## 6. Governance Store (`govStore`)

**File:** `portals/shared-ui/src/governance/store.ts`
**Guard:** `govStore.guard()` — throws `NotConnectedError` when `VITE_DEMO_MODE=false`.

| Feature | Function | Target Endpoint / DocType | Status | Sprint |
|---|---|---|---|---|
| List bodies | `listBodies()` | `GET /api/governance/bodies` → `Governance Body` DocType | **DEMO** | S3 |
| List meetings | `listMeetings()` | `GET /api/governance/meetings` → `Meeting` DocType | **DEMO** | S3 |
| List resolutions | `listResolutions()` | `GET /api/governance/resolutions` → `Resolution` DocType | **DEMO** | S3 |
| List risks | `listRisks()` | `GET /api/governance/risks` → `Risk` DocType | **DEMO** | S3 |
| List declarations | `listDeclarations()` | `GET /api/governance/declarations` → `Declaration` DocType | **DEMO** | S3 |
| List members | `listMembers()` | `GET /api/governance/members` → `Governance Member` DocType | **DEMO** | S3 |

---

## 7. Tasks / Approvals Store (`taskStore`)

**File:** `portals/shared-ui/src/tasks/store.ts`
**Guard:** `taskStore.guard()` — throws `NotConnectedError` when `VITE_DEMO_MODE=false`.

| Feature | Function | Target Endpoint / DocType | Status | Sprint |
|---|---|---|---|---|
| List tasks | `listTasks()` | `GET /api/approvals/tasks` → `ToDo` DocType | **DEMO** | S2 (§1–§2) |
| List delegations | `listDelegations()` | `GET /api/approvals/delegations` → `Approval Delegation` DocType | **DEMO** | S2 (§3) |
| Create delegation | `createDelegation()` | `POST /api/approvals/delegations` | **DEMO** | S2 (§3) |
| End delegation | `endDelegation()` | `POST /api/approvals/delegations/{id}/end` | **DEMO** | S2 (§3) |
| Reassign task | `reassignTask()` | `POST /api/approvals/tasks/{id}/reassign` | **DEMO** | S2 |
| Claim task | `claimTask()` | `POST /api/approvals/tasks/{id}/claim` | **DEMO** | S2 |
| Team load | `teamLoad()` | `GET /api/approvals/team-load` | **DEMO** | S2 |
| Task SLA | `taskSla()` | Derived from `ToDo` due_date | **DEMO** | S2 |

> **Note:** Tasks store will be replaced by Frappe `ToDo` queries in §1 (queue scoping) and §3 (delegation). The prototype store is not being patched — it will be superseded.

---

## 8. Billing Store (`billingStore`)

**File:** `portals/shared-ui/src/billing/store.ts`
**Guard:** `billingStore.guard()` — throws `NotConnectedError` when `VITE_DEMO_MODE=false`.

| Feature | Function | Target Endpoint / DocType | Status | Sprint |
|---|---|---|---|---|
| List invoices | `listInvoices()` | `GET /api/billing/invoices` → `Sales Invoice` DocType | **DEMO** | S3 |
| Get invoice | `getInvoice()` | `GET /api/billing/invoices/{id}` | **DEMO** | S3 |
| List payments | `listPayments()` | `GET /api/billing/payments` → `Payment Entry` DocType | **DEMO** | S3 |
| Billing summary | `billingSummary()` | `GET /api/billing/summary` | **DEMO** | S3 |

---

## 9. Record / Documents Store (`docsStore`)

**File:** `portals/shared-ui/src/record/docs.ts`
**Guard:** `docsStore.guard()` — throws `NotConnectedError` when `VITE_DEMO_MODE=false`.

| Feature | Function | Target Endpoint / DocType | Status | Sprint |
|---|---|---|---|---|
| List record docs | `listRecordDocs()` | `GET /api/records/{doctype}/{name}/docs` → `File` DocType | **DEMO** | S2 |
| Upload record doc | `uploadRecordDoc()` | `POST /api/records/{doctype}/{name}/docs` | **DEMO** | S2 |
| Remove record doc | `removeRecordDoc()` | `DELETE /api/records/{doctype}/{name}/docs/{id}` | **DEMO** | S2 |

---

## 10. Notifications Store (`notifyStore`)

**File:** `portals/shared-ui/src/notify/store.ts`
**Guard:** `notifyStore.guard()` — throws `NotConnectedError` when `VITE_DEMO_MODE=false`.

| Feature | Function | Target Endpoint / DocType | Status | Sprint |
|---|---|---|---|---|
| List notifications | `listNotifications()` | `GET /api/notifications` → `Notification Log` DocType | **DEMO** | S3 |
| Mark read | `markRead()` | `POST /api/notifications/{id}/read` | **DEMO** | S3 |
| Mark all read | `markAllRead()` | `POST /api/notifications/read-all` | **DEMO** | S3 |

> **Note:** Service portal `AccountNotificationsPage` uses `fetchNotificationFeed()` which calls `GET /account/notifications/feed` directly — this is **LIVE** (graceful fallback to `[]` on error).

---

## Summary

| Store | Total Features | LIVE | STUB | DEMO |
|---|---|---|---|---|
| Certification | 15 | 8 | 7 | 0 |
| CRM | 19 | 1 | 16 | 2 |
| Metrology | 6 | 1 | 5 | 0 |
| Standards | 13 | 1 | 12 | 0 |
| Field | 5 | 0 | 5 | 0 |
| Governance | 6 | 0 | 0 | 6 |
| Tasks/Approvals | 8 | 0 | 0 | 8 |
| Billing | 4 | 0 | 0 | 4 |
| Record/Docs | 3 | 0 | 0 | 3 |
| Notifications | 3 | 0 | 0 | 3 |
| **Total** | **82** | **11** | **45** | **26** |

### Sprint mapping

- **S1** (current): Certification applications, schemes, CRM deals, metrology jobs, standards catalogue — **DONE**.
- **S2** (next): Cases, clients, certificates, audits, NCs, quotes, jobs detail, work items, TCs, visits, samples, ToDo queue scoping (§1–§2), delegation DocType (§3), record docs.
- **S3** (later): Signals, articles, contracts, campaigns, NPS, proposals, ballots, governance bodies/meetings/resolutions, billing, notifications.

### Screens wrapped with NotConnectedPanel / ResourceGate (Step 0.2)

| Screen | File | Guard |
|---|---|---|
| Delegations | `institution-portal/src/approvals/TeamViews.tsx` | `ResourceGate` |
| Done history | `institution-portal/src/approvals/TeamViews.tsx` | `ResourceGate` |
| Board page (drawer) | `institution-portal/src/pages/BoardPage.tsx` | `bodies.notConnected` check |
| Register/cases | `institution-portal/src/certification/Lists.tsx` | `cases.notConnected` check |
| Record docs | `shared-ui/src/record/RecordPage.tsx` | `disconnected` guard |
| Case deliveries | `institution-portal/src/crm/CaseExtras.tsx` | `res.notConnected` guard |
| Customer quotes | `service-portal/src/pages/customer/Commercial.tsx` | `res.notConnected` guard |
| Account cases | `service-portal/src/pages/account/AccountCasesPage.tsx` | Already had `res.notConnected` |
| Samples screen | `field-portal/src/screens/visits/VisitsScreens.tsx` | `res.notConnected` guard |
| Sample list (sub) | `field-portal/src/screens/visits/VisitsScreens.tsx` | `res.notConnected` guard |
| Pipeline (inside Gate) | `institution-portal/src/certification/Pipeline.tsx` | Already wrapped in `Gate` |
| CRM page (badges) | `institution-portal/src/pages/CrmPage.tsx` | Badge-only, sub-routes gated |
| Notifications | `service-portal/src/pages/account/AccountNotificationsPage.tsx` | Custom hook, graceful `[]` |