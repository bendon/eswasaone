# Certification — CAC on the Board, and field audit capture

UI additions on `certifications` that the backend still needs to support. Everything below calls live endpoints where they
exist and falls back locally (marked `TODO: wire real`) where they don't.

## 1. Certification Approval Committee (Board → CAC, `/board/cac`)

ESWASA's product scheme (product.php) sends files to the **Certification Approval Committee**. The committee now sits in
Board & Governance as a committee, alongside Audit & Risk, Finance, and the other committees.

- **Same queue as Certification → Decisions.** Both screens use `certification/decisionQueue.ts` (`buildDecisionRows`,
  `bodyFor`). The CAC shows the rows whose body is the CAC (product and combined flows).
- **Same write.** Decisions go through `deskApi.recordDecision` (`certify` on `/act` when granted). The CAC adds the following
  to the decision note: sitting, votes for/against/abstained, recusals and conditions.
- **Session controls:** attendance, per-file conflict-of-interest recusal, quorum of 3 eligible voting members after recusals,
  vote tally, and the outcomes grant, grant with conditions, or refuse. It blocks a grant when majors are open, minors lack an
  accepted CAPA, lab results are outstanding, or **a lab result failed**.
- **Sittings:** `GET /governance/meetings`, filtered to the CAC body (by name, or "CAC" in the title). A placeholder schedule
  is used when none exist.
- **Bodies:** meeting forms on the Board and Meetings tabs now load `GET /governance/bodies` instead of hard-coded lists.
  The stub fallback adds the CAC body and members (`governance/stubs.ts → STUB_CAC_MEMBERS`).

**Backend asks**
1. Configure the CAC as a `GovernanceBody` (`type: Committee`, quorum 3, monthly) with its members.
2. Persist per-member votes and recusals against the meeting (recusal → `GovernanceDeclaration {kind: Meeting, action: Recuse}`).
3. Create a resolution for each CAC decision (`POST /governance/resolutions`, currently TODO in the UI).
4. Implement refusal in `recordDecision` (currently demo-only): decision record, refusal letter, and the 90-day appeal window.

## 2. Field audits (field portal → Audits)

- **List:** `GET /field/me/audits` first (server-scoped). Falls back to `GET /certification/audits` plus a client-side auditor filter.
- **Checklists** by scheme and stage: Stage 1 readiness; Stage 2 per standard (ISO 9001 / 14001 / 22000 / 45001 / HACCP);
  surveillance subset; product factory assessment.
- **NC editor:** clause, grading (major/minor/observation), statement, objective evidence, and photos via `POST /media/upload`
  (`shared-ui/api/upload.ts`; device-local fallback). Marking a checklist item NC opens a finding pre-filled with that clause.
- **Samples** (product audits): product, batch, quantity, seal number, destination lab.
- **Submit:** `PATCH /certification/audits/{id}` with header `Idempotency-Key` (a stable per-draft `submitKey`) and body:

  ```json
  { "action": "submit", "confirm": true,
    "payload": { "kind": "stage2|stage1|surveillance|product",
                 "checklist": [{ "id": "", "title": "", "clauses": "", "verdict": "C|NC|NA|null" }],
                 "findings": [{ "clause": "", "severity": "major|minor|obs", "statement": "", "evidence": "", "photos": ["media key"] }],
                 "samples": [{ "id": "", "product": "", "batch": "", "qty": "", "sealNo": "", "lab": "", "drawnAt": "" }],
                 "sign_off": { "auditorName": "", "auditeeName": "" },
                 "outcome": "nc_raised|conforming" } }
  ```

  When offline, or if the server refuses, the draft is queued and retried on the next successful list load.

**Backend asks**
1. Accept `action: "submit"` on `PATCH /certification/audits/{id}`. Create Certification findings from `payload.findings`,
   attach photos, and advance the application (Raise NC, or ready for decision).
2. Honour `Idempotency-Key` for this PATCH.
3. Add `/media/*` to `contracts/openapi.yaml`. The UI uses a local `MediaObject` type that mirrors the live `MediaObjectOut`.
