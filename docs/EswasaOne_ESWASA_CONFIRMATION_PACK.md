# EswasaOne — ESWASA Confirmation Pack

Oct 6, 2026 · @BM

> Companion to `docs/EswasaOne_WORKFLOW_MAP.md`. Catalogue of regulatory facts that back registry values (states, roles, SLAs, mandates).

## Status (Oct 2026)

**The project adopts the provisional values in this pack and in the workflow map as the working baseline.** We do not wait on ESWASA to fill answer columns before building. Registry YAML is configured from these provisionals.

A later ESWASA review can amend answers; when a signed pack returns, overwrite this file and commit it as the new baseline, then update registry YAML. Until then, leave the **ESWASA answer** columns blank — they are not in use.

## Purpose (when review is needed later)

These facts are regulatory, not design choices. Changing them after go-live means reconfiguring live workflows and retraining staff. When ESWASA (or the project on their behalf) does a formal pass:

- Fill in the **ESWASA answer** column. Where a provisional is right, write "Accept".
- Name **roles, not people**, unless a named individual is legally required.
- Cite quality manuals / ISO/IEC 17065 or 17021 / Standards Act where they exist.
- Leave blank what does not apply, with a note.

**Who would complete a formal pass:** Heads of Certification, Standards, Metrology, Finance and Corporate Services, plus Quality Manager; CEO sign-off.

**No return dates are active.** A–C used to block the freeze; that gate is lifted for now.

## A. Mandates

This section decides which field and inspection functions EswasaOne builds for ESWASA staff. For each function, say whether ESWASA performs it, shares it with another body, or doesn't perform it, and cite the legal basis.

| # | Function | Provisional assumption | ESWASA answer (ESWASA / Shared with … / Not ours) | Legal basis or note |
| --- | --- | --- | --- | --- |
| A1 | Product certification (ESWASA Mark) | ESWASA |  |  |
| A2 | Management system certification (ISO 9001, 14001, 22000, 45001 …) | ESWASA |  |  |
| A3 | Batch / consignment certification | ESWASA |  |  |
| A4 | Market surveillance (sampling, stop-sale on non-compliant goods) | To confirm |  |  |
| A5 | Import inspection at border posts | To confirm |  |  |
| A6 | Legal metrology (verification of weighing and measuring instruments in trade) | To confirm |  |  |
| A7 | Industrial calibration services (laboratory and on-site) | ESWASA |  |  |
| A8 | Product testing laboratory | ESWASA |  |  |
| A9 | Export / pre-shipment inspection and certificates | ESWASA |  |  |
| A10 | WTO TBT National Enquiry Point | ESWASA |  |  |
| A11 | Standards development and sale of standards | ESWASA |  |  |
| A12 | Training services to industry | ESWASA |  |  |

**A13.** For any function marked *Shared*, which body does the other part, and should EswasaOne exchange data with it? (e.g. Eswatini Revenue Service for imports)

**A14.** Does ESWASA hold, or is it seeking, accreditation for any of these? List the accreditation body and standard (e.g. SADCAS, ISO/IEC 17065).

## B. Certification schemes

Each scheme becomes a branch of the certification workflow, so we need the full list. Add a row per scheme ESWASA operates today or plans within 12 months.

| Scheme name | Type (Product / Management system / Batch) | Standard(s) certified against | Certificate validity (years) | Surveillance frequency | Live today? |
| --- | --- | --- | --- | --- | --- |
| ESWASA Mark (example) | Product | Per product standard | 3 | Annual factory visit + market samples |  |
| ISO 9001 (example) | Management system | ISO 9001:2015 | 3 | Annual |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

**B1.** Do any schemes run under a sector programme with its own rules (e.g. food safety, SADC harmonised marks)? Name them.

**B2.** Is a deposit or full payment required before an audit is scheduled? Provisional: **deposit on quotation acceptance, balance on certification**.

**B3.** How long is a quotation valid? Provisional: **30 days**.

**B4.** If a customer stops responding to a request for information, is the application withdrawn automatically? If yes, after how many days? Provisional: **staff are alerted at day 21; no automatic withdrawal**.

## C. Certification stages and decision authorities

These are the provisional stages a certification application moves through, with the role allowed to move it. Rename any stage to ESWASA's own term, and correct the role.

| # | Stage | What happens | Who moves it on (provisional) | ESWASA stage name | ESWASA role |
| --- | --- | --- | --- | --- | --- |
| C1 | Submitted | Customer applies online | Certification Officer accepts |  |  |
| C2 | Document review | Application and documents checked | Certification Officer |  |  |
| C3 | Awaiting customer | Missing information requested | Customer responds |  |  |
| C4 | Quoted | Quotation issued | Customer accepts and pays |  |  |
| C5 | Audit planned | Audit or inspection team appointed | Scheme Manager |  |  |
| C6 | Audit / inspection in progress | Field visit, sampling | Lead auditor or inspector |  |  |
| C7 | Nonconformity resolution | Customer corrects findings | Certification Officer or lead auditor verifies |  |  |
| C8 | Technical review | Independent review of the file | Technical Reviewer |  |  |
| C9 | Decision | Grant or refuse certification | Certification Manager |  |  |
| C10 | Certified | Certificate or licence issued | System |  |  |

For product certification, C6 becomes **inspection and sampling**, followed by **laboratory testing** and **evaluation** before C8. Correct this if ESWASA's product scheme differs.

**After certification**

| # | Action | Provisional role | ESWASA role |
| --- | --- | --- | --- |
| C11 | Suspend a certificate | Certification Manager |  |
| C12 | Reinstate a suspended certificate | Certification Manager (not the one who suspended) |  |
| C13 | Withdraw a certificate | Head of Certification |  |
| C14 | Extend or reduce scope | Certification Manager |  |

**Impartiality rules.** Confirm or correct each:

- **C15.** The person who decides certification has not audited the client in this cycle, and is not the technical reviewer.
- **C16.** Auditors and inspectors may not serve a client they have consulted for, or had a personal or financial link with, in the last **2 years**.
- **C17.** The same lead auditor may serve the same client for at most ***N*** consecutive cycles. What is N?
- **C18.** Who hears an **appeal** against a certification decision? Provisional: a panel not involved in the original decision, appointed by the CEO.
- **C19.** Is there an impartiality committee that must review certification activity? How often?

## D. Field visits and sampling

Every visit by an auditor, inspector or metrologist runs through the Field app. These rules decide who can be sent, what they must record, and how samples are handled.

| # | Question | Provisional answer | ESWASA answer |
| --- | --- | --- | --- |
| D1 | Who appoints the visit team? | Scheme Manager |  |
| D2 | How is an officer's competence recorded? (qualification per scheme and sector) | HR skills record, per scheme and scope |  |
| D3 | Must the client confirm the visit date? | Yes, through the customer portal or by the officer |  |
| D4 | Is a signed closing meeting with the client required? | Yes, signature captured on the device |  |
| D5 | Who reviews the visit report? | Scheme Manager, never the visit lead |  |
| D6 | What happens if the client refuses access? | Visit aborted with evidence; flagged for possible suspension |  |
| D7 | Do officers get per diem or travel claims per visit? Which rates apply? | Yes, claim prefilled from the visit |  |

**Samples**

| # | Question | Provisional answer | ESWASA answer |
| --- | --- | --- | --- |
| D8 | How are samples split? | Three parts: test, retained, client |  |
| D9 | What sealing and labelling is used? | Numbered seal with a QR label |  |
| D10 | Must a witness from the client sign at collection? | Yes |  |
| D11 | How long are retained samples kept before disposal? | *To confirm* |  |
| D12 | Who approves test results? | Technical Manager, never the analyst |  |
| D13 | When a sample bought in the market fails, what happens to the certificate? | Case opened; certificate suspended pending investigation, with manager approval |  |
| D14 | Does ESWASA pay for market samples, and how is that recorded? | *To confirm* |  |

## E. Standards development

The platform takes a standard from proposal to publication and sale. Confirm the stages and the voting rules.

**Stages.** Provisional: Proposed → Approved new work item → Working draft → Committee draft → Public review → Comment resolution → Ballot → Approved for publication → Published (gazetted) → Periodic review / Withdrawn.

| # | Question | Provisional answer | ESWASA answer |
| --- | --- | --- | --- |
| E1 | Correct stage names and order | As above |  |
| E2 | Who may propose a new standard? | ESWASA staff and registered stakeholders |  |
| E3 | Who approves a new work item? | Technical Committee |  |
| E4 | Length of the public comment period | 60 days |  |
| E5 | Who may vote in a ballot? | Technical Committee members |  |
| E6 | Ballot passes when… | Two-thirds of votes cast approve, and quorum is met |  |
| E7 | Ballot quorum | Half of voting members |  |
| E8 | Ballot length | 30 days |  |
| E9 | Who authorises publication? | Head of Standards, then the Board or Minister if required by law |  |
| E10 | Is gazetting required, and who submits it? | Yes, Legal Services |  |
| E11 | Interval for periodic review | 5 years |  |
| E12 | Are adopted international standards (ISO, IEC, SADC) fast-tracked? Which stages are skipped? | *To confirm* |  |

## F. Metrology, TBT, complaints and procurement

**Metrology and calibration**

| # | Question | Provisional answer | ESWASA answer |
| --- | --- | --- | --- |
| F1 | Who assigns a calibration job? | Lab Manager |  |
| F2 | Who approves results and signs the certificate? | Technical Manager, never the metrologist who did the work |  |
| F3 | Is the customer told immediately when an instrument is out of tolerance? | Yes, automatically |  |
| F4 | Which calibrations are done on-site at the customer? | *To confirm* |  |

**WTO TBT notifications**

| # | Question | Provisional answer | ESWASA answer |
| --- | --- | --- | --- |
| F5 | Who decides a notification is relevant to Eswatini? | TBT Curator |  |
| F6 | Who assesses impact and drafts a national comment? | Enquiry Point officer |  |
| F7 | Who approves a comment before it goes to the WTO? | *To confirm* |  |

**Complaints and appeals**

| # | Question | Provisional answer | ESWASA answer |
| --- | --- | --- | --- |
| F8 | Complaint types and target resolution times | Enquiry 5 days; complaint 20 days |  |
| F9 | Who handles complaints about ESWASA's own service? | Quality Manager |  |
| F10 | Can a customer reopen a resolved complaint? Within how long? | Yes, within 14 days |  |
| F11 | Appeals route (see also C18) | Separate panel, never the original decision-maker |  |

**Procurement and finance approvals**

| # | Question | Provisional answer | ESWASA answer |
| --- | --- | --- | --- |
| F12 | Purchase approval thresholds by amount (SZL) and approver | *To confirm*; please attach the delegation-of-authority schedule |  |
| F13 | Who approves budget variations? | CFO; above a threshold, the Finance & Investment Committee |  |
| F14 | Who approves refunds and credit notes? | Finance Manager |  |
| F15 | Which payment channels must be supported? | MTN MoMo, bank transfer, card |  |
| F16 | Is Pastel the accounting system of record, or ERPNext? | Pastel, synced from ERPNext |  |

**Governance**

| # | Question | Provisional answer | ESWASA answer |
| --- | --- | --- | --- |
| F17 | Board committees and their quorums | Audit & Risk, Finance & Investment, HR & Remuneration, Technical |  |
| F18 | How many days before a meeting must the Board pack be issued? | 7 days |  |
| F19 | Are written (round-robin) resolutions permitted? Pass threshold? | *To confirm* |  |
| F20 | Risk scoring scale and appetite threshold | 5 × 5; escalate to the Board above 12 |  |

## G. Service-level targets

These targets drive reminders and escalations. They count **working days** against the Eswatini public holiday calendar, and pause while ESWASA is waiting on the customer. Accept or amend each, and name who is alerted when a target is missed.

| # | Step | Provisional target | Escalates to (provisional) | ESWASA target | ESWASA escalation role |
| --- | --- | --- | --- | --- | --- |
| G1 | New application picked up by an officer | 1 day | Certification Manager |  |  |
| G2 | Document review completed | 3 days | Certification Manager |  |  |
| G3 | Customer reminded about missing information | Day 7 and day 14 | — |  |  |
| G4 | Stalled case flagged to officer | Day 21 | — |  |  |
| G5 | Visit team appointed | 10 days before visit date | Head of Certification |  |  |
| G6 | Officer accepts a visit assignment | 2 days | Scheme Manager |  |  |
| G7 | Visit report submitted after the visit | 2 days | Scheme Manager |  |  |
| G8 | Visit report reviewed | 3 days | Head of Certification |  |  |
| G9 | Customer closes nonconformities | 30 days | Certification Officer |  |  |
| G10 | Officer verifies each customer response | 5 days | Certification Manager |  |  |
| G11 | Technical review | 5 days | Certification Manager |  |  |
| G12 | Certification decision | 3 days | Head of Certification |  |  |
| G13 | Suspension decided after a trigger | 2 days | Head of Certification |  |  |
| G14 | Surveillance visit planned | 30 days before due date | Scheme Manager |  |  |
| G15 | Calibration turnaround (lab) | *To confirm* | Lab Manager |  |  |
| G16 | Sample test turnaround | *To confirm* | Lab Manager |  |  |
| G17 | End-to-end certification (application to decision) | *To confirm* | Head of Certification |  |  |

## Sign-off

By signing, ESWASA confirms these answers as the basis for configuring EswasaOne. Later changes go through change control.

| Section | Completed by (name, role) | Date |
| --- | --- | --- |
| A. Mandates |  |  |
| B. Certification schemes |  |  |
| C. Stages and authorities |  |  |
| D. Field visits and sampling |  |  |
| E. Standards development |  |  |
| F. Metrology, TBT, complaints, procurement, governance |  |  |
| G. Service-level targets |  |  |

**Approved for ESWASA:** _______________________ (Chief Executive Officer)  Date: ________
