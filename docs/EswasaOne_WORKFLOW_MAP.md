# EswasaOne — System Workflow Map

> How the whole platform maps onto **one Frappe workflow fabric**. This sits above every module spec.
> If a module spec conflicts with this map, this map wins. Update the module spec to match.
> Companions: `INSTITUTION_FUNCTIONAL_SPEC` (rules R-*), `FRONTEND_WORKFLOW_SPRINT`, `GOVERNANCE_MODULE_BUILD`.

---

## 1. Method: map once, generate everything

Don't keep the map as prose. Keep **one machine-readable registry**, and generate everything else from it, so the map can never drift from the code.

```
eswasa_core/registry/workflows/*.yaml      ← single source of truth (one file per DocType)
        │  `bench eswasa-registry build`
        ├─► Frappe Workflow fixtures            (states, transitions, roles, allow_self_approval=0)
        ├─► Core display map + OpenAPI enums    (canonical → portal label, per audience)
        ├─► Approvals family/SLA config         (R-A1/R-A2 read this, not hard-coded)
        ├─► Feed event catalogue                ({doctype, state, rule} keys)
        ├─► Board pack section queries          (which outcomes roll up)
        ├─► Playwright e2e skeletons            (one happy path + guard tests per transition)
        └─► This matrix + Mermaid state diagrams (docs, regenerated — never hand-edited)
```

**CI gate.** The build fails if any of these happen:
- a Frappe Workflow is not in the registry;
- a portal calls an action that isn't a registry transition;
- a registry transition has no e2e skeleton.

### 1.1 Registry schema (per DocType)

```yaml
doctype: Certification Application
module: certification
submit_gate: null                        # lifecycle stays docstatus 0
display:                                 # labels per audience; Desk keeps canonical
  customer: {Submitted: "Received", Document Review: "In review", Awaiting Customer: "Action needed", ...}
  staff:    {}                           # canonical
states:
  - {name: Submitted,          sla: 3d,  owner_role: Certification Officer}
  - {name: Awaiting Customer,  sla: paused, owner: applicant}
  ...
transitions:
  - action: Request info
    from: Document Review
    to: Awaiting Customer
    actor: Certification Officer
    reason: required
    rules: [R-C2]
    feed: {audience: [customer], tone: pending}
  - action: Submit response
    from: Awaiting Customer
    to: Document Review
    actor: customer                      # applied by Core under restricted role
    surface: service:/account/applications/:id
  ...
guards: [expected_state, idempotency_key]
approvals_family: approve                # approve | do | alert
board_rollup: certification.summary      # pack section source
```

### 1.2 Invariants (apply to every row below)

1. **One transition API.** All transitions go through `POST /api/{module}/{doctype}/:id/act {action, expected_state, idempotency_key, reason?, payload?}`, and Core calls `apply_workflow`. Nothing writes `workflow_state` directly.
2. **docstatus.** Lifecycle docs stay at 0. **Gate artefacts submit to 1:**
   - Certificate
   - Calibration Certificate
   - Published Standard
   - Sales Invoice
   - Payment Entry
   - Board Resolution
   - Approved Minutes
   - Issued Board Pack

   A change to any of these is made by amend or a new document, never by edit.
3. **Customer transitions** are applied by Core under the `Portal Customer` role, and only for states where `actor: customer`. Every `Awaiting Customer` state **pauses** the SLA.
4. **Reason is mandatory** on reject, return, reassign, suspend, withdraw, cancel and override.
5. **Internal effects in the transaction; external effects after commit.** The ToDo create/close and the outbox rows are written in the **same transaction** as the state change. Only external effects run after commit, through the outbox: email/SMS, feed, PDF, MoMo, Pastel. The feed key is `{doctype}:{name}:{state}:{rule}`, and handlers are idempotent on it. See §5, L1 and L5.
6. **Approvals is the staff queue for everything.** Approvals and R-A2 read **ToDos only**. The Workflow Action is Frappe's permission and engine record, linked from the ToDo. Module pages are pipelines; nobody acts from a hidden page.
7. **Board consumes outcomes.** It never re-runs a module workflow. It reads summaries and exceptions.
8. **§5 is the automation law.** If any other section disagrees with §5 on transitions, allocation, guards or side effects, §5 wins.

---

## 2. System index

| # | Domain | Lifecycle DocType(s) | Gate (submit) | Customer acts? | Field acts? | Board roll-up |
|---|---|---|---|---|---|---|
| 1 | Certification | Application → **Certification** (register) → Surveillance Audit | Certificate | ✔ | ✔ | Certification performance |
| 2 | Standards | Work Item → Ballot | Published Standard | ✔ (public comment) | — | Standards development |
| 3 | E-store | Order | Sales Invoice, Licence | ✔ | — | Finance (revenue) |
| 4 | Metrology | Calibration Job | Calibration Certificate | ✔ (submit item, collect) | ✔ (on-site) | Metrology and laboratory |
| 5 | TBT | TBT Notification → TBT Assessment | — | ✔ (subscribe, comment) | — | Risk (systemic only) |
| 6 | Training | Enrolment | Certificate of attendance | ✔ | — | Certification performance (training line) |
| 7 | Complaints and enquiries | Case | — | ✔ | — | Governance (complaints KPI) |
| 8 | Export and applicability | Export Request | Export certificate / letter | ✔ | ✔ (inspection) | Certification performance |
| 9 | CRM and marketing | Lead → Opportunity; Campaign | — | — | — | — |
| 10 | Finance | Invoice, Payment, Budget | ERPNext native | ✔ (pay) | — | Management accounts |
| 11 | Procurement | Material Request → PO | ERPNext native | supplier (later) | — | Finance |
| 12 | HR | Leave, Expense Claim, Job Applicant, Appraisal | HRMS native | — | ✔ (ESS) | HR KPIs (optional) |
| 13 | Governance | Meeting, Pack, Resolution, Action, Risk | Resolution, Minutes, Issued Pack | — | — | (it is the roll-up) |
| 14 | Platform | Access Request, Ingest Item | — | — | — | — |
| 15 | **Field operations** (shared) | Field Visit, Sample | — (results feed parent gate) | ✔ (confirm date, sign-off) | ✔ (owns it) | Field performance |

---

## 3. Module maps

Column key:
- **Actor:** C = customer, O = officer/staff role named, F = Field (auditor/inspector), S = system/cron.
- **SLA:** working days. "‖" means paused.

### 3.1 Certification (canonical vertical)

There is one Application workflow. The scheme type decides which branch runs; the registry supports conditional transitions (`when: scheme_type == product`).

| Scheme | Evaluation branch | Gate artefact | Surveillance |
|---|---|---|---|
| **Product certification** (ESWASA Mark) | Factory inspection + sampling (Field) → lab testing (LIMS) → evaluation | Licence to use the Mark | Periodic factory visits + market samples |
| **Management system** (ISO 9001/14001/22000 …) | Stage 1 → Stage 2 audit (Field) → NCs | Certificate | Annual surveillance audits, recertification year 3 |
| **Batch / consignment** | Lot inspection + sample (Field) → test | Batch certificate | None (one-off) |

All field work, in every scheme, runs through **Field Visit** and **Sample** (§3.12). The table below shows the management-system branch. The product branch replaces "Audit in Progress" with `Inspection & Sampling → Testing → Evaluation`. Testing waits on the linked Sample results; the SLA is paused for lab time against its own lab SLA.

**DocTypes:**
- `Certification Application`: from apply to decision.
- `Certification`: the register record, carrying the certificate's life.
- `Audit`: Stage 1, Stage 2, Surveillance, Recertification.
- `Nonconformity`: child of Audit, with its own mini-workflow.

`Application`

| From → To | Action | Actor | SLA | Rule | Surface |
|---|---|---|---|---|---|
| — → Submitted | Submit application | C | — | R-C1 (ToDo, ack, feed) | Service apply wizard |
| Submitted → Document Review | Accept | O Cert Officer | 3 | — | Approvals / pipeline |
| Document Review → Awaiting Customer | Request info | O | ‖ | R-C2 | Approvals; Service "Action needed" |
| Awaiting Customer → Document Review | Submit response | C | — | feed staff | Service account |
| Document Review → Quoted | Issue quotation | O | 5 | R-F (quotation) | Pipeline |
| Quoted → Audit Planned | Accept quotation and pay deposit | C | ‖ | R-E/R-F payment | Service pay |
| Audit Planned → Audit in Progress | Start audit (Stage 1 / Stage 2 created) | F lead auditor | per plan | — | Field |
| Audit in Progress → NC Resolution | Submit findings (NCs > 0) | F | — | R-C4 NC notice | Field → Service "Action needed" |
| Audit in Progress → Technical Review | Submit findings (no NCs) | F | — | — | Field |
| NC Resolution → Technical Review | Close all NCs | O (evidence from C) | 30 ‖ on C | — | Service evidence upload; Institution |
| Technical Review → Decision | Recommend | O Technical Reviewer | 5 | — | Approvals |
| Decision → Certified | Certify (**creates and submits Certificate**) | O Cert Manager | 3 | **R-C3** invoice, QR, register, feed | Approvals |
| Decision → Rejected | Reject (reason) | O Cert Manager | — | R-C5 | Approvals |
| any open → Withdrawn | Withdraw (reason) | C or O | — | — | Service / Institution |

`Certification` (register record)

| From → To | Trigger | Rule |
|---|---|---|
| — → Active | Certificate submitted | R-C3 |
| Active → Surveillance Due | S cron (cycle date − 60d) | R-C6 schedules a Surveillance Audit |
| Surveillance Due → Active | Surveillance Audit closed, satisfactory | — |
| Active → Suspended | Suspend (reason): failed surveillance, unpaid, misuse | R-C7 register and verify update |
| Suspended → Active | Reinstate | — |
| Active / Suspended → Withdrawn | Withdraw (reason) | R-C7 |
| Active → Expired | S at end date unless recertified | — |

`Nonconformity`: Raised (F) → Response submitted (C) → Accepted (O) → Verified closed (O / F). Raised → Overdue is set by S.

**Board roll-up:**
- applications by state;
- certified this period;
- overdue audits;
- SLA breaches;
- suspensions and withdrawals.

### 3.2 Standards development

**DocTypes:** `Work Item`, `Public Comment`, `Ballot` / `Ballot Vote`, `Published Standard` (gate).

| From → To | Action | Actor | Rule |
|---|---|---|---|
| — → Proposed | Propose work item | O / C (stakeholder proposal) | R-S1 |
| Proposed → Approved | Approve new work item | O Technical Committee secretary | — |
| Approved → WD → CD | Advance draft | O TC secretary | — |
| CD → Public Review | Open public comment (period set) | O | R-S2 publishes to Service, notifies subscribers |
| Public Review → Comment Resolution | S at close date | S | — |
| *(during)* | Submit comment | C | feed |
| Comment Resolution → Ballot | Open ballot | O | Ballot created; ToDo per voting member |
| Ballot → Approved for Publication / back to CD | Close ballot (tally rule) | S / O | — |
| Approved → Published | Publish (**creates and submits Published Standard**) | O Head of Standards | **R-S3** gazette, catalogue, e-store product |
| Published → Under Review / Withdrawn | Periodic review (S, 5-yearly) / Withdraw (reason) | S / O | R-S4 |

**Board roll-up:** standards published; work items by stage; contested ballots.

### 3.3 E-store

**DocTypes:** `Order` (custom wrapper) → ERPNext `Sales Invoice` + `Payment Entry` → `Licence`.

| From → To | Action | Actor | Rule |
|---|---|---|---|
| — → Pending Payment | Checkout | C | R-E1 MoMo request |
| Pending Payment → Paid | MoMo callback success | S | **R-E2** submits invoice and payment, creates Licence (watermark) |
| Pending Payment → Failed / Expired | MoMo callback fail / S timeout | S | R-E3 notify, retry allowed |
| Failed → Pending Payment | Retry payment | C | — |
| Paid → Fulfilled | First download | S | — |
| Paid → Refunded | Refund (reason) | O Finance | credit note |

Orders have no Approvals rows except Refund, and failures over a threshold show as an alert.

### 3.4 Metrology and LIMS

**DocTypes:** `Calibration Job`, `Instrument` (customer item), `Calibration Result`, `Calibration Certificate` (gate).

| From → To | Action | Actor | Rule |
|---|---|---|---|
| — → Requested | Request calibration | C / O | R-M1 |
| Requested → Quoted → Received | Quote / item received at lab (or Field visit scheduled) | O / F | R-F quotation |
| Received → In Progress | Assign metrologist | O Lab Manager | — |
| In Progress → Reviewed | Enter results | O Metrologist / F | R-M2 out-of-tolerance flag to customer |
| Reviewed → Certified | Approve (**submits Calibration Certificate**) | O Technical Manager (≠ metrologist) | **R-M3** PDF, register, invoice |
| Certified → Dispatched | Collect / dispatch | O / C | R-M4 notify |

The reviewer must differ from the person who entered the results; this is enforced as a guard.

**Board roll-up:** jobs by state; turnaround time; out-of-tolerance rate.

### 3.5 TBT

**DocTypes:** `TBT Notification` (ingested), `TBT Assessment`, `TBT Subscription` (customer).

| From → To | Action | Actor | Rule |
|---|---|---|---|
| — → Ingested | ePing ingest | S | — |
| Ingested → Tagged | Tag sectors and HS codes (AI-assisted, curator confirms) | O Curator | — |
| Tagged → Notified | Publish to subscribers | O Curator | **R-T1** subscription match, email and feed |
| Tagged → Dismissed | Not relevant (reason) | O | — |
| Notified → Assessed | Impact assessment | O | **R-T2** high impact: ToDos and affected certified orgs |
| Assessed → Comment Submitted | National comment to WTO | O Enquiry Point | R-T3 |

Customer side: subscribe, pause, and map sectors. These are records, not workflow.

**Board:** only high-impact items escalated to the risk register.

### 3.6 Training (Frappe LMS)

| From → To | Action | Actor | Rule |
|---|---|---|---|
| — → Pending Payment | Enrol | C | R-E1-style |
| Pending Payment → Confirmed | Paid / invoiced to company | S / O Finance | — |
| Confirmed → Attended / No-show | Mark attendance | O Trainer | — |
| Attended → Completed | Pass assessment (submits certificate of attendance) | S / O | feed, certificate PDF |

### 3.7 Complaints and enquiries (Helpdesk)

| From → To | Action | Actor | Rule |
|---|---|---|---|
| — → Open | Submit complaint or enquiry | C | ack, SLA by type |
| Open → In Progress | Assign | O | — |
| In Progress → Awaiting Customer ‖ | Request info | O | — |
| In Progress → Resolved | Resolve (resolution note) | O | — |
| Resolved → Closed / Reopened | Confirm / dispute within 14d | C or S | — |
| any → Escalated | SLA breach or appeal | S / C | R-A2 |

Appeals against certification decisions are a Case type routed to a different role (impartiality). They are **never** routed to the original decision-maker.

### 3.8 Export and applicability

| From → To | Action | Actor |
|---|---|---|
| — → Submitted | Request export certificate / applicability ruling | C |
| Submitted → Under Assessment → Inspection (opt.) | Assess / schedule inspection | O / F |
| → Issued (submit letter or certificate) / Rejected (reason) | Decide | O Manager |

### 3.9 CRM, marketing, finance, procurement, HR

These use **ERPNext and HRMS native workflows**. The registry only *declares* them, so Approvals, feed and the Board know they exist. Native submit semantics are kept.

| DocType | States (native or added) | Approvals | Customer / Field |
|---|---|---|---|
| Lead → Opportunity | native status | — | — |
| Campaign (Marketing) | Draft → Scheduled → Sent | Approve send (O Marketing Mgr) | — |
| Sales Invoice / Payment Entry | Draft → Submitted → Paid / Cancelled | above threshold | C pays |
| Budget variation | Draft → Approved (added) | ✔ CFO | — |
| Material Request → Purchase Order | Draft → Pending Approval → Approved → Submitted (threshold matrix) | ✔ | — |
| Leave Application | Open → Approved / Rejected | ✔ line manager | F via ESS |
| Expense Claim | Draft → Approved → Paid | ✔ | F via ESS |
| Job Applicant | Open → Shortlisted → Interview → Offer → Hired | ✔ offer | — |
| Appraisal | native cycle | — | F via ESS |

### 3.10 Governance (roll-up apex)

| DocType | States | Gate | Notes |
|---|---|---|---|
| Board Meeting | Scheduled → Pack issued → Held → Minutes draft → Minutes approved | Minutes (submit on approve) | Minutes are approved at the *next* meeting of the same body |
| Board Pack | Draft → Assembled (vN) → Issued | Issued pack | **R-G1** opens the pack when the meeting is scheduled and reminds section owners before the deadline. Issue is manual and blocked until every included section is Ready. Live figures are snapshotted per version. |
| Board Resolution | Proposed → Passed / Rejected / Deferred → Implemented | Submit on Passed | Voted in the meeting and recorded by the Company Secretary. **Written resolution** variant: Circulated → member votes (member view) → Passed / Lapsed. **R-G2** creates action ToDos. |
| Resolution Action | Open → (Overdue by S) → Completed | — | Feeds the action tracker and the pack |
| Governance Risk | Open → Under Review → Closed | — | **R-G3** escalates when residual exceeds appetite |

Board members are not staff Desk users. They get a member view: issued packs, minutes, and written-resolution votes.

### 3.11 Platform

| DocType | States | Actor |
|---|---|---|
| Access Request | Requested → Approved / Rejected | O System Manager |
| Ingest Item | Queued → Approved / Rejected / Rights Flagged | O Curator |

### 3.12 Field operations (shared by every module)

A field officer's work isn't a module. It is **one shared primitive**: `Field Visit`. It links back to the record that needs it (`parent_doctype`, `parent_name`). The parent's workflow waits on the visit; the visit's outcome advances the parent. The Field PWA only knows Field Visits and Samples, so new visit types need no new app screens.

**Visit types**

| Visit type | Parent DocType | Outputs | Mandate |
|---|---|---|---|
| Stage 1 / Stage 2 / surveillance / recertification audit | Audit (Certification) | Checklist, NCs, recommendation | ESWASA |
| Factory inspection (product cert) | Certification Application / Certification | Checklist, NCs, **Samples** | ESWASA |
| Market sampling (product surveillance) | Certification | **Samples** from retail | ESWASA |
| Market surveillance operation | Market Surveillance Op | Findings, stop-sale notice → Case | **Confirm** |
| Import / border inspection | Import Consignment | Release / detain / sample | **Confirm** |
| On-site calibration / legal metrology verification | Calibration Job | Results, seal/stamp record | **Confirm** legal-metrology mandate |
| Batch / pre-shipment inspection | Export Request / batch Application | Checklist, Samples | ESWASA |
| Complaint investigation | Case | Evidence, finding | ESWASA |

**Field Visit workflow**

| From → To | Action | Actor | Guard / rule |
|---|---|---|---|
| — → Planned | Created by parent transition (e.g. Audit Planned) or by the S surveillance schedule | S / O Planner | R-V1 |
| Planned → Assigned | Assign lead + team | O Scheme Manager | **Competence**: officer qualified for scheme and scope (HR skills matrix). **Impartiality**: no consultancy or relationship with the client in the last 2 years, declaration on file. **Rotation**: same lead at most N cycles. Any failure blocks the assignment. |
| Assigned → Confirmed | Accept, and the client confirms the date | F, then C | R-V1 notifies both. Visit pack downloads to the device. |
| Confirmed → Rescheduled → Confirmed | Reschedule (reason, who requested) | F / C / O | Client-requested reschedules pause the parent SLA |
| Confirmed → In Progress | Check in (GPS + timestamp) | F | Works offline; recorded on device |
| In Progress → Submitted | Close out: checklist, NCs, samples, photos, client rep signature at closing meeting | F | Queued in the outbox; `expected_state` on the parent |
| In Progress → Aborted | Abort (reason: refused access / premises closed / safety) + evidence | F | **R-V3**: refusal flags the parent (may trigger suspension) |
| Submitted → Returned / Reviewed | Review report | O Lead / Scheme Manager | Return requires a reason |
| Reviewed → Closed | Close; the parent advances | S | Parent rule (e.g. Audit → NC Resolution / Technical Review) |
| Confirmed → Overdue | Not checked in by the planned date + 1 | S | **R-V2**: supervisor alert, Approvals row |

**Sample workflow (chain of custody)**

| From → To | Action | Actor | Evidence |
|---|---|---|---|
| — → Collected | Collect | F | Seal no. (QR label), photo, GPS, quantity, witness signature, split (test / retained / client) |
| Collected → In Transit → Received | Hand over → lab receipt | F → O Lab | Each handover signed. Condition check on receipt; a mismatch raises an Approvals alert. |
| Received → Testing | Create LIMS Test Request (method, standard clauses) | O Lab Manager | Lab SLA |
| Testing → Conforming / Non-conforming | Approve results (reviewer ≠ analyst) | O Technical Manager | **R-V4**: result goes to the parent decision |
| → Retained → Disposed | Retention period ends | S / O | Disposal record |

**R-V4 detail.** A non-conforming market sample on a certified product does three things:
- opens a Case;
- moves the Certification to Suspended pending investigation (with approval);
- sends repeated failures to the risk register.

**Offline rules (Field PWA)**
- At Confirmed, the device downloads the visit pack: the **checklist version is frozen**, plus client and site, scope, previous NCs, open Samples, and directions.
- A checklist edited mid-visit doesn't change a visit that is already in progress.
- Everything captured offline goes into the outbox with an idempotency key. Photos are hashed at capture.
- If the parent changed state while the officer was offline, the sync **doesn't fail silently**. The visit goes to *Submitted (conflict)*, and the supervisor resolves it in Approvals.

**Logistics**
- Each visit can raise a travel request or per-diem Expense Claim (HRMS), prefilled from the visit.
- Vehicle booking is optional.
- Visits appear in the officer's ESS calendar, and leave blocks assignment.

**Field PWA screens**

| Screen | Content |
|---|---|
| Today | Today's and this week's visits |
| Visit | Checklist, raise NC, Samples (scan seal), photos, client sign-off, submit |
| Samples | Custody: hand over / receive by scan |
| Outbox | Sync status and conflicts |
| Me | Leave, claims, payslips |

**Approvals rows:** unassigned visits, visit reports to review, overdue check-ins, aborted visits, sample receipt mismatches, sync conflicts.

**Board roll-up:**
- visits completed vs planned;
- aborted and refused visits;
- sample non-conformity rate by sector;
- market surveillance non-compliance rate.

Rules R-V1…V4 are proposed. Map them into `INSTITUTION_FUNCTIONAL_SPEC` beside R-C*.

---

## 4. Cross-cutting planes

| Plane | Source | Consumers |
|---|---|---|
| **Approvals (R-A1/R-A2)** | **ToDos only** (each linked to its Workflow Action); family and SLA from the registry | Institution Approvals, Home queue, Field (own items) |
| **Feed** | Rules R-* via the after-commit outbox | `/ws/feed`, Home, Ask/Esi, Service `/account/notifications` (customer-audience events only) |
| **Email / SMS** | Frappe Notification on state entry | Customer, staff |
| **Display map** | Registry `display.customer` | Service labels; Desk is canonical |
| **Board roll-up** | Registry `board_rollup` queries | Pack sections, Board overview |
| **Audit trail** | Version + Workflow Action log + mandatory reason | Compliance, appeals |
| **Agent tools** | Proposals only. The user confirms with a one-time token bound to `{action, doc, expected_state}`; then the same `/act` runs under the user's rights (L8) | Ask/Esi proposes. It never acts unconfirmed, and never beyond the user's rights. |

---

## 5. Automation and allocation

There is one path for every actor:
- Desk
- Approvals
- Field
- Service
- agents
- system jobs

The path is: **guarded transition → in-transaction allocation → ToDo inbox → act → after-commit side effects → escalate / Board roll-up.** Nothing bypasses the guards.

### 5.1 Transition sources

| Trigger | Identity | Path |
|---|---|---|
| Customer | `Portal Customer` (restricted) | Service → Core `/act`; only `actor: customer` transitions |
| Staff | Their own user | Approvals / pipeline / **Desk button**; all the same `apply_workflow` |
| Field | Their own user | PWA outbox → `/act` on Field Visit / Sample |
| System | Dedicated system users: `sys-cron`, `sys-momo`, `sys-ingest` | Scheduler / webhook → `/act`; each user may run **only its own transitions** (L6) |
| Agent (Esi) | The asking user | Proposes; the user confirms; then `/act` (L8) |
| Delegate | The delegate's user, "on behalf of" the absent manager | Normal `/act`; trail records both people (L7) |

Core only passes `action`, `expected_state`, `idempotency_key`, `reason?`, `payload?`. **All enforcement lives in Frappe**, so an illegal Desk click fails exactly like an illegal `/act`.

### 5.2 Transition pipeline

```text
/act or Desk button
  → idempotency check (L4): key seen for this doc+user? → return stored original result, stop
  → apply_workflow wrapper — GUARDS (in Frappe):
       expected_state == current
       role allowed  (or claim holder, or delegate)
       reason present for reject/return/reassign/suspend/withdraw/cancel/override
       four-eyes across linked docs — applies to delegates too (L7)
       Field assignment: competence · impartiality (2y) · rotation · leave · workload — per team member
       allow_self_approval = 0
  ┌──────────── ONE DB TRANSACTION (L1) ────────────┐
  │ set workflow_state, transition_seq += 1          │
  │ gate submit (docstatus 0→1) if gate state         │
  │ close previous state's open ToDos (L2)            │
  │ resolve assignee → upsert ToDo                    │
  │   key {doctype,name,state,transition_seq} (L3)    │
  │ write outbox rows for side effects                │
  │ store idempotency result                          │
  └─────────────────── COMMIT ───────────────────────┘
  → AFTER COMMIT, external only (L1, L5):
       email/SMS · feed · PDF/QR · MoMo · Pastel · ERPNext Notification
       via outbox worker: retries → dead-letter (System Admin)
```

**Assignee resolution, in order:**
1. **Delegation.** If an active Delegation (from → to, roles, date range) covers the role, assign the delegate.
2. **Named or team.** A planner or scheme manager has chosen the person; guards already passed.
3. **Hierarchy.** HRMS `reports_to` / Leave Approver / the PO threshold chain.
4. **Smart pool.** A custom Assignment Rule condition skips anyone on HRMS leave or over the open-item cap, and matches discipline.
   - Otherwise the ToDo sits on the role, **unclaimed until Claim**.
   - A claim timeout escalates it.

**The ToDo is the single inbox and SLA object.** The Workflow Action stays as Frappe's permission and engine record, linked from the ToDo. Approvals and R-A2 read ToDos only. `_assign` and sharing are kept in step with `allocated_to`.

### 5.3 Staff handling loop

| Action | Effect |
|---|---|
| **Claim** (pool) | `allocated_to = me`, the SLA clock starts |
| **Act** | `/act` and the full pipeline |
| **Reassign** (reason required) | Updates the ToDo, `_assign` and sharing. On Field Visits and lead roles it reruns competence, impartiality and rotation. |
| **Escalate** (R-A2) | Triggered by SLA breach, claim timeout or stale. Goes to the manager or delegate, as `alert` family plus feed. |
| **Supervisor team view** | Load, age and breaches per officer; rebalance by reassign |

**SLA arithmetic (L9).** SLAs count working days against the ERPNext Holiday List for Eswatini. A paused state (‖) stops the clock and resumes it when the state is left.

### 5.4 Locked rules (failure paths)

| # | Rule |
|---|---|
| **L1** | The ToDo is created or updated **in the same DB transaction** as the state change. After commit is for external effects only: email/SMS, feed, PDF, MoMo, Pastel. A **reconciler cron** (every 15 min) finds documents in owner-requiring states with no open ToDo and backfills one. |
| **L2** | On transition, **close** the previous state's open ToDo(s) for that document. |
| **L3** | The inbox dedupe key is `{doctype, name, state, transition_seq}`, so re-entering a state never collides with a closed ToDo. |
| **L4** | Idempotency keys are stored per document + user with a TTL (default 7 days, longer than the longest Field offline window). A **replay returns the original result**, not an error. |
| **L5** | The side-effect outbox retries, then **dead-letters** to System Admin. Handlers are idempotent on the feed key. A gate submit **never rolls back** because a PDF, invoice or register step failed; that step retries. |
| **L6** | Dedicated **system users** (cron, MoMo, ingest) are each limited to their own transitions. MoMo callbacks are **signature-verified** before `/act`; an unverified callback is logged and dropped. |
| **L7** | A delegate still passes **four-eyes**. An auditor acting as delegate cannot certify their own audit. |
| **L8** | The agent **proposes** only. The user confirms with a one-time token bound to `{action, doc, expected_state}`; then `/act` runs. The token expires and can't be reused. |
| **L9** | SLA = **working days** against the ERPNext Holiday List (Eswatini). |

### 5.5 Special branches

- **Awaiting Customer.**
  - The staff SLA is paused (‖), and the officer stays on as a watcher.
  - `sys-cron` chases the customer at D+7 and D+14, and marks the case stale for the officer at D+21.
  - Optional auto-withdraw with notice applies per scheme rule.
  - The customer's response returns the case to the officer as a new ToDo, with a new `transition_seq` and a fresh SLA.
- **Gate submit.** The artefact is submitted in-transaction. Its side effects (e.g. R-C3) run after commit. After that, a change is made only by amend or a new document.
- **Field Visit.**
  - The parent waits.
  - When the visit closes, `sys-cron` applies the parent's next transition.
  - An offline conflict lands as *Submitted (conflict)* for the supervisor.
  - A sample's result applies R-V4.
- **Board.**
  - R-G1 opens the pack and creates a `do` ToDo for each section owner.
  - Issue is blocked until every included section is Ready.
  - R-G2 creates action ToDos from passed resolutions; R-G3 escalates risks above appetite.
  - The Board never re-runs a module workflow.

### 5.6 Allocation matrix — Certification Application

Column key:
- **Pattern:** Pool = smart pool + Claim; Named = picked by a manager; Cust = customer acts.
- **Delegable:** ✔ = the role may be delegated, with four-eyes still applying.

| State | May act | Pattern | Guards | SLA → escalation | Family | Delegable |
|---|---|---|---|---|---|---|
| Submitted | Cert Officer | Pool | — | Claim 1d → Cert Manager | do | ✔ |
| Document Review | Claiming Cert Officer | Claimant | Reason on Request info | 3d → Cert Manager | do | ✔ |
| Awaiting Customer | Customer | Cust (officer watches) | Customer role only | ‖ · chase D+7/D+14 · stale D+21 · auto-withdraw per scheme | — | — |
| Quoted | Customer (accept, pay) | Cust | Payment = submitted Payment Entry / verified MoMo (L6) | ‖ · quote expires 30d → alert to officer | alert | — |
| Audit Planned | Scheme Manager | Named | Creates the Field Visit; visit guards apply to the team | Assign 5d → Head of Certification | do | ✔ |
| Audit in Progress | — (no Application ToDo) | — | Advanced only by `sys-cron` when the visit closes. **Field Visit ToDos are the only human inbox items in this window.** | Visit SLAs (§5.7) | — | — |
| NC Resolution | Customer (evidence); Cert Officer or lead auditor (accept / verify) | Cust + Claimant | Verifier ≠ customer; reason on reject. Two ToDo kinds in one state, keyed `{…, transition_seq, role}`: a customer evidence task, and an officer verify task opened per response. | Customer 30d ‖ · officer 5d per response | do | ✔ |
| Technical Review | Technical Reviewer | Pool by scheme | **≠ any audit team member** | 5d → Cert Manager | approve | ✔ (SoD) |
| Decision | Certification Manager | Named role | **≠ audit team, ≠ technical reviewer**; reason on reject | 3d → Head of Certification | approve | ✔ (SoD) |
| Certified ★ | `sys` (gate) | — | Certificate submitted in-transaction | R-C3 retries (L5) | — | — |
| Rejected / Withdrawn | — | — | Reason; all ToDos closed | — | — | — |

**Certification register (post-certification)**

| State / action | May act | Pattern | Guards | SLA → escalation | Family |
|---|---|---|---|---|---|
| Surveillance Due | `sys-cron` creates; Cert Officer schedules | Pool | Visit guards (rotation counts prior cycles) | Visit planned by due −30d → Scheme Manager | do |
| Suspend | Certification Manager | Named | Reason; ≠ person who raised the finding | 2d from trigger → Head | approve |
| Reinstate | Certification Manager | Named | Verification evidence; **≠ the person who suspended** | 5d | approve |
| Withdraw | Head of Certification | Named | Reason; customer notified | — | approve |

### 5.7 Allocation matrix — Field Visit

| State | May act | Pattern | Guards | SLA → escalation | Family | Delegable |
|---|---|---|---|---|---|---|
| Planned | Scheme Manager / Planner | Named | — | Assign by planned date −10d → Head of Certification | do | ✔ |
| Assigned | Lead + each team member (accept) | Named + team rows | **Each member:** competence (scheme/scope), impartiality 2y, rotation ≤ N cycles, not on leave, under workload cap | Accept 2d → Scheme Manager | do | ✗ personal |
| Confirmed | Lead (record), customer (confirm date) | Named + Cust | Visit pack frozen on device | Check-in by date +1 → **R-V2** supervisor alert | alert | ✗ |
| Rescheduled | Lead / customer / Scheme Manager | — | Reason, who requested; customer request pauses the parent SLA | Re-confirm 3d | do | — |
| In Progress | Lead + team | — | GPS + timestamp check-in | Submit within 2d of visit end → Scheme Manager | do | ✗ |
| Submitted | Reviewing lead / Scheme Manager | Named | **Reviewer ≠ visit lead** | Review 3d → Head of Certification | do | ✔ (SoD) |
| Submitted (conflict) | Scheme Manager | Named | Resolution with reason | 1d → Head | alert | ✔ |
| Aborted | Scheme Manager | Named | Reason + evidence; **R-V3** flags the parent | Decide reschedule / escalate 2d | alert | ✔ |
| Returned | Lead | — | Return reason shown | Resubmit 2d | do | ✗ |
| Reviewed → Closed | `sys-cron` | — | Applies the parent's next transition (`expected_state` checked) | — | — | — |

**Sample custody (per handover)**

| Step | Actor | Guard |
|---|---|---|
| Collect | Field team | Seal QR, photo, GPS, witness signature |
| Hand over → Receive | Field → Lab Receipt (pool) | Both sign; condition mismatch → `alert` to Lab Manager |
| Test | Analyst (named by Lab Manager) | — |
| Approve results | Technical Manager | **≠ analyst** |
| Result → parent | `sys` | R-V4 |

The SLA values above are proposed defaults. Each lives in the registry and is confirmed per scheme with ESWASA.

---

## 6. Build order

1. Registry schema, generator and CI gate. Write the Certification YAML first as the reference.
2. Port the existing fixtures into the registry. Verify that the generated output matches what is deployed (no behaviour change).
3. Write the remaining YAMLs in this order:
   1. Standards
   2. E-store
   3. Metrology
   4. TBT
   5. Governance
   6. Complaints
   7. Training
   8. Export
   9. The ERPNext/HRMS declarations
4. Generic `/act` endpoint. Core passes the values through only; the **guards and pipeline from §5.2 and L1–L9 are implemented in Frappe** (the `apply_workflow` wrapper and DocType hooks), so Desk clicks are guarded too. Retire the per-module `advance_*` endpoints behind it.
5. Approvals reads family and SLA from the registry.
6. Feed outbox with after-commit delivery.
7. Generate the e2e skeletons; fill them per sprint WS.

**Field operations go in after Certification in step 3:** Field Visit and Sample YAML first, then Certification references them.

**Baseline for registry values:** provisional answers in `docs/EswasaOne_ESWASA_CONFIRMATION_PACK.md` and this map. The project owns that call for now; ESWASA fill-in is not required before build. A later signed pack can overwrite the confirmation file and update the registry.
