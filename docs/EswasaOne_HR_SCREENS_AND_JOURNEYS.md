# EswasaOne — HR & People: screens and user journeys

> Companion to `docs/EswasaOne_HR_PEOPLE_BUILD_BRIEF.md`. That brief says **what** HR must do and where the data lives. This document says **which screens** each person uses and **how they move from one step to the next**.
> Clickable mockups: `docs/mocks/eswasaone-hr.html` (institution portal, every role, persona switcher top right) and `docs/mocks/eswasaone-careers.html` (public applicant flow, Service Portal chrome).
> Screen IDs (H1, E2, …) are shared by the mockup, this document and the React port.

---

## 1. Who uses HR & People

| Persona | What they come for | Home screen | Rail entries |
|---|---|---|---|
| HR Manager | Run the module: people, structure, leave, competence, hiring, appraisals, payroll changes, cases | H0 Overview | HR & People, My team, My HR, Approvals |
| HR Officer | Day-to-day records, onboarding, recruitment admin. No pay data, no cases | H0 Overview | HR & People, My HR, Approvals |
| Line manager | Their team: who is away, what needs their decision, probation, appraisals | T1 My team | My team, My HR, Approvals |
| Head of department | As line manager, plus requisitions, department competence cover, authorisations | T1 My team | My team, My HR, Approvals |
| Employee | Their own leave, pay, appraisal, declaration, competence | E1 My HR | My HR |
| New joiner | First-week checklist | E10 First days | My HR |
| Finance Manager | Payroll changes and the run; never prepares and approves the same run | A0 Approvals | Approvals, Payroll (H9), My HR |
| ED / CEO | Establishment changes, senior offers, overview | A0 Approvals | Approvals, HR overview (read), My HR |
| Council HR & Remuneration Committee member | Quarterly HR pack, aggregates only | H15 Board HR pack | Board HR pack |
| External auditor / expert | Their competence and declaration only | X1 My record | My record |
| Applicant (public) | Find a vacancy and apply | P1 Vacancies | Service Portal chrome |

---

## 2. UX rules (apply to every screen)

1. **One primary action per screen**, in the page header. Secondary actions are ghost buttons.
2. **Every screen ends with a Next step card**: what happens next, who acts, and a link to it.
3. **Multi-step work uses a stepper.** Steps are numbered and named, with Back, Save draft and Continue. The final step is Review, then Submit.
4. **No decisions on HR pages.** Screens never show Approve or Reject. After a submit, a confirmation names the person who decides and links to Approvals (A0). Decisions are made only in Approvals.
5. **Needs-attention rows link to the exact fixing screen.** Each row says why it matters and when the problem starts ("By 13 Oct").
6. **Empty states name the next action** ("No employees yet. Start HR setup →").
7. **Sensitive fields are masked.** "Show details" opens H1c, which says the reveal is logged, then writes an Access log row.
8. **Restricted records say so.** Cases show a lock banner and who can see them. Other users see counts only.
9. **Plain language.** Use "Line manager", not "reports_to", and "Waiting 2 days", not a status code.
10. **Breadcrumbs on every detail page,** plus a back link that returns to the list with filters kept.
11. **Responsive.** At 390px the rail becomes a menu button, tables become stacked rows and steppers wrap.

---

## 3. Screen inventory

Backing column: the Core endpoint (brief §12.2) or the DocType it reads. **(new)** means not yet in `core/app/gateway/router.py`.

### 3.1 HR office (HR Manager, HR Officer)

| ID | Screen | Purpose | Key elements | Backing |
|---|---|---|---|---|
| H0 | Overview | Today's state and what needs action | KPI strip, Needs attention (each row deep-links), establishment, away today, payroll step, movements, record quality. "Not set up" state links to H14 | `GET /hr/overview` (partly), `/hr/organisation/overview` |
| H1 | Directory | Find a person | Search, department and status filters, segmented control **People / Joiners & leavers** | `GET /hr/employees` |
| H1a | Record drawer | Quick look without leaving the list | Job, contact, leave balance, authorisations, actions menu (H2a), "Open full record" | `GET /hr/employees/:id` |
| H1b | Employee record | Everything about one person | Tabs: Summary · Job & contract · Leave · Competence · Documents · Pay (level 2) · History · Access log | `GET /hr/employees/:id` |
| H1c | Reveal dialog | Show masked fields with a logged reason | Reason picker, "This is logged", Show | `GET /hr/employees/:id/sensitive` (new) |
| H2 | Add employee | Create a record correctly first time | Stepper: Person → Post (vacant posts only) → Reporting & approvers → Contract & probation → Portal login → Review. Pre-filled from an accepted offer | `POST /hr/employees` |
| H2a | Lifecycle actions | Change a person's job or status | Forms: Promote · Transfer · Confirm probation · Renew or convert contract · Start separation. Each sends to Approvals | Employee Promotion / Transfer / Separation, `POST /hr/{doctype}/:id/act` |
| H3 | Structure | The approved establishment | Department table, posts per department, org chart toggle, **Request a change** | `GET /hr/establishment` (new), `/hr/departments`, `/hr/orgchart` |
| H3a | Department detail | One department | Head, posts, people, vacancies, cover warnings | as H3 |
| H3b | Request establishment change | Amend the Staffing Plan | Post, change (add/remove/freeze), reason, cost → CEO (and Council above threshold) | Staffing Plan amendment |
| H4 | Time off | Who is away, what is waiting, what is owed | KPIs, team calendar, requests (read-only, "Decide in Approvals") | `GET /hr/leave`, `/hr/leave/balances` |
| H4a | Leave request detail | Context for a request | Dates, balance after, cover, who decides, status timeline | Leave Application |
| H4b | Leave policy | Rules in force | Types, entitlement per grade, carry-over | Leave Type, Leave Policy |
| H5 | Competence | Who is authorised to do what | Matrix with cover per competence, expiring list, declarations, **Record an authorisation**, **Evidence pack** | `GET /hr/competence/matrix`, `/expiring` (new) |
| H5a | Record authorisation | Grant or renew | Stepper: Person & competence → Evidence → Validity → Approver (≠ person) → Review | Staff Authorisation |
| H5b | Authorisation detail | One authorisation | Status, validity, evidence, renewal button | Staff Authorisation |
| H5c | Declarations register | Impartiality & confidentiality for the year | Signed / outstanding, Remind, excluded from audits | `GET /hr/impartiality` (new) |
| H5d | External personnel | Contract auditors and experts | List, competence, declaration status. No pay | Person (External), pending decision |
| H5e | Accreditation evidence pack | Export for SADCAS | By person or function, contents preview, Download | Staff Authorisation + evidence + declarations |
| H6 | Recruitment | Requisitions and their funnel | Requisition table with stage and counts, **Open a requisition** | `GET /hr/recruitment` (new) |
| H6a | New requisition | Ask to fill a vacant post | Post picker shows vacant posts only, reason, closing date → head of dept, then HR | Job Requisition |
| H6b | Requisition pipeline | Move candidates through | Columns: Applied · Shortlist · Interview · Offer · Hired. "Publish to careers page" | Job Opening, Job Applicant |
| H6c | Applicant | One candidate | CV, cover letter, scores, interviews, next move | Job Applicant, Interview |
| H6d | Interview & feedback | Schedule and score | Panel, date, criteria scores, recommendation | Interview, Interview Feedback |
| H6e | Offer | Make an offer | Post, grade, start date, terms → Approvals. When accepted: "Create employee" opens H2 pre-filled | Job Offer |
| H7 | Onboarding | Get a joiner productive | Tasks by owner (HR, ICT, Finance, line manager), required documents, declaration, induction | Employee Onboarding |
| H7b | Offboarding | Close out a leaver | Exit interview, assets, access removal, ToDo reassignment, final pay | Employee Separation, Exit Interview |
| H8 | Performance | Cycle progress | Completion by department, **Remind outstanding** | `GET /hr/performance` (new) |
| H8a | Cycle setup | Start a cycle | Stepper: Period → Template → Who is in it → Dates → Review | Appraisal Cycle |
| H8b | Appraisal | One person's appraisal | Goals with strategic link, self-rating, manager rating, comments | Appraisal |
| H9 | Payroll | This month's run | Six-step stepper, changes, estimate against last month, scope banner | `GET /hr/payroll/run` (new) |
| H9a | Payroll change | One change | What, why, effective date, blockers, approver | Salary Structure Assignment, Additional Salary |
| H9b | Payslip | One person's slip (level 2) | Earnings, deductions, net | Salary Slip |
| H10 | Cases | Grievances and disciplinary cases | Register (owner and HR Manager see names; others see counts), **Open a case** | `GET /hr/cases` (new) |
| H10a | Case | One case | Lock banner, stage stepper, notes, next step due, appeal routing | Disciplinary Case, Employee Grievance |
| H11 | Access requests | Staff asking for Desk access | Existing | `/hr/access-requests` |
| H14 | HR setup (System Admin) | One-time configuration | Stepper: Organisation → Departments & heads → Posts & grades → Holidays → Leave policy → Competence catalogue → Required documents → Approvers & privacy → Import employees → Payroll scope | Fixtures, Data Import |
| H15 | Board HR pack | Quarterly report to the Council committee | Headcount, vacancies, turnover, establishment changes, appraisals, case counts. No names | `board_rollup: hr.summary` |

### 3.2 Line managers and heads of department

| ID | Screen | Purpose | Backing |
|---|---|---|---|
| T1 | My team | Team at a glance: away, decisions waiting (to A0), probation due, appraisals to do, expiring authorisations, joiners' tasks | Employee (reports_to tree), ToDo |
| T2 | Team calendar | Leave and field work together | Leave Application, Field Visit |
| T3 | Team member | Job, leave, competence, appraisal. No personal or pay fields | Employee (permission hook) |
| T4 | Probation review | Confirm, extend or end, with reasons → HR | Employee, ToDo (R-H1) |
| T5 | Manager review | Rate goals and competencies, comment | Employee Performance Feedback |
| T6 | Raise requisition | Head of department; vacant posts only | Job Requisition |
| T7 | Department cover | Head of department; competences with one or zero holders | Staff Authorisation (R-H4) |

### 3.3 Every employee (desktop; mobile is the Field PWA "Me" screen, `eswasaone-field.html`)

| ID | Screen | Purpose | Backing |
|---|---|---|---|
| E1 | My HR | Balances, next payslip, my tasks (sign declaration, self-assessment, upload document), my authorisations | Employee, ToDo |
| E2 | Apply for leave | Type, dates, balance after, cover suggestion, named approver → status | `POST /hr/leave` |
| E3 | My leave | History and status | `GET /hr/leave?mine` |
| E4 | Payslips | Monthly slips, download | Salary Slip |
| E5 | My profile & documents | View; request a change; upload documents | Employee, Employee Document |
| E6 | Declaration | Stepper: Interests (two years) → Confidentiality undertaking → Sign | Impartiality Declaration |
| E7 | Self-assessment | Rate own goals, comment, submit to manager | Appraisal (self) |
| E8 | My competence | Authorisations, expiry, upload evidence, request renewal | Staff Authorisation |
| E9 | Raise a grievance | Confidential, goes to HR Manager only | Employee Grievance |
| E10 | First days | New joiner's checklist: documents, declaration, induction, meet the team | Employee Onboarding |

### 3.4 Other roles

| ID | Screen | Who | Notes |
|---|---|---|---|
| A0 | Approvals (stub in mockup) | All approvers | One decision card per HR family: leave (with cover prompt), requisition, offer, authorisation, promotion/transfer, establishment change, payroll change, payroll run. Real SoT: `eswasaone-approvals.html` |
| X1 | My record | External auditor or expert | Subset of E5, E6 and E8; no leave or pay |
| P1–P4 | Careers | Applicant | `eswasaone-careers.html`: Vacancies → Vacancy → Apply → Thank you ("only shortlisted candidates are contacted") |

---

## 4. Journeys

Each journey can be clicked through end to end in the mockup. **Bold** marks the person acting.

| # | Journey | Path |
|---|---|---|
| J1 | Set up HR | **HR Manager** H0 "not set up" → H14 (10 steps) → import validates → H0 shows live numbers |
| J2 | Hire | **Head of dept** T6 → A0 HR Manager approves → H6b Publish → **Applicant** P1 → P2 → P3 → P4 → **HR** H6b shortlist → H6d interview & feedback → H6e offer → A0 Finance / ED → accepted → H2 pre-filled → H7 onboarding → **New joiner** E10 → E6 declaration → **Line manager** T4 at probation date → confirmed |
| J3 | Leave | **Employee** E2 → A0 line manager (cover prompt) → T2 / H4 calendar updated → audit planner blocks those dates |
| J4 | Authorise an auditor | **Employee** E8 uploads evidence → **HR** H5a → A0 head of dept → H5 matrix updated → expiry alert at 60/30/7 days → H5b renew |
| J5 | Yearly declaration | E1 task "Sign your 2026/27 declaration" → E6 → H5c register. Anyone unsigned is shown as excluded from audits |
| J6 | Appraisal cycle | **HR** H8a → **Employee** E7 → **Manager** T5 → H8 completion → H15 |
| J7 | Monthly payroll | **HR** H9 step 1–2 → H9a changes → A0 Finance → step 3 calculate → step 4 differences → A0 Finance approves the run (≠ preparer) → step 6 pay and post |
| J8 | Promotion or transfer | **HR** H1a → H2a → A0 HR Manager / ED → H1b History updated → payroll change appears in H9 |
| J9 | Leaver | **HR** H2a Start separation → A0 → H7b offboarding → last day: login disabled, open ToDos move to the line manager, final pay in H9 |
| J10 | Case | **Employee** E9 or **HR** H10 → H10a stages → outcome → appeal goes to someone other than the original decider |
| J11 | Establishment change | **HR / Head** H3b → A0 ED → Council committee if above threshold → H3 updated |
| J12 | Sensitive data | **HR Manager** H1b → Show details → H1c reason → fields shown → Access log row added |

---

## 5. Build status (journey by journey, full stack)

| Slice | Screens | Core | Frappe | Tests | State |
|---|---|---|---|---|---|
| 1. My HR + leave → Approvals (J3, employee side) | E1 `/me`, E2 `/me/leave/new`, E3 `/me/leave` (`portals/institution-portal/src/me/`) | `GET /hr/me`, `POST /hr/leave/preview` (+ existing `POST /hr/leave`) | `eswasa_hr.leave`: one ToDo per request for the employee's own leave approver; `decide()` registered via the new `eswasa_approval_handlers` hook in `eswasa_governance.approvals` | `core/tests/test_hr_me.py`, `src/me/me.test.tsx`, `apps/eswasa_hr/tests/test_leave.py` | Built. Playwright on staging still to run (bench was offline) |
| 2a. Yearly declaration (J5) | E6 `/me/declaration`, task on E1, H5c `/hr/competence/declarations` | `GET/POST /hr/me/declaration`, `GET /hr/impartiality`, `POST /hr/impartiality/remind` | `eswasa_hr.declarations`: own-record signing, confidentiality + signature required, register, idempotent reminders (R-H5 on 1 April); Impartiality Declaration gains `nothing_else`, `confidentiality_accepted`, `signed_name`, Employee may submit; `has_conflict` uses the declaration year | `core/tests/test_hr_declarations.py`, `src/me/declaration.test.tsx`, `apps/eswasa_hr/tests/test_declarations.py` | Built. Needs `bench migrate` for the new fields. Year start (1 April, H8) and wording (H9) provisional |
| 2b. Staff authorisations (J4) | H5 `/hr/competence` (live matrix, cover, expiring), H5a `/hr/competence/new`, H5b `/hr/competence/authorisations/:id`, E8 `/me/competence` | `GET /hr/competence/matrix`, `GET /hr/competence/expiring`, `GET /hr/competence/authorisations/{name}`, `POST /hr/competence/authorisations`, `GET /hr/me/competence`, `POST /hr/me/competence/renewal` | `eswasa_hr.authorisations`: HR drafts → one ToDo for the head of the person's department (`Department.custom_head`) → `decide()` via `eswasa_approval_handlers`; four-eyes (not the person, not the preparer); evidence required; default validity from `Skill.custom_validity_months`. Certification's `auditor_competence_valid` asks HR first for schemes HR has competences for | `core/tests/test_hr_competence.py`, `src/hr/competence/competence.test.tsx`, `apps/eswasa_hr/tests/test_authorisations.py` | Built. Needs department heads set and the competence catalogue (ESWASA input H7). Evidence is a reference, not a file upload yet |
| 3a. Hire: requisition → careers → application (J2, first half) | H6 `/hr/recruitment`, H6a `/hr/recruitment/new`, publish `/hr/recruitment/:id/publish`; service portal P1 `/careers`, P2–P4 `/careers/:id` | `GET /hr/recruitment`, `GET /hr/recruitment/vacancies`, `POST /hr/recruitment/requisitions`, `POST /hr/recruitment/requisitions/{name}/publish`; public `GET /careers/openings`, `GET /careers/openings/{opening}`, `POST /careers/openings/{opening}/apply` (multipart CV, 5 MB, PDF/Word, rate-limited) | `eswasa_hr.recruitment`: vacancy = Staffing Plan − active − open requisitions; requisition only for a vacancy; one ToDo per HR Manager (not the requester), decided via `eswasa_approval_handlers`; publish creates the Job Opening; guest methods list live openings and create Job Applicants (duplicate email refused) | `core/tests/test_hr_recruitment.py`, `src/hr/recruitment/recruitment.test.tsx`, `service-portal/src/pages/careers/careers.test.tsx`, `apps/eswasa_hr/tests/test_recruitment.py` | Built. Needs submitted Staffing Plans. Head of department step before HR (brief §12.1) not yet separate |
| 3b. Hire: shortlist → interview → offer → employee (J2, second half) | H6b `/hr/recruitment/openings/:opening`, H6c–H6e `/hr/recruitment/applicants/:id` (screen, schedule, result, offer, answer, create employee), panel `/me/interviews` | `GET .../openings/{opening}/pipeline`, `GET .../applicants/{name}` (+ `/cv`), `POST .../applicants/{name}/status`, `/interviews`, `/offer`; `GET .../interview-types`; `POST .../interviews/{name}/result`; `POST .../offers/{name}/answer`, `/employee`; `GET /hr/me/interviews`, `POST /hr/me/interviews/{name}/feedback` | `eswasa_hr.hiring`: interview with named panel (one ToDo each), Interview Feedback 1–5 stars per Interview Type skill, HR result submits the Interview; offer drafted → approved by another HR Manager via `eswasa_approval_handlers` (HRMS checks Staffing Plan vacancies and duplicates); answer; Employee via HRMS `make_employee` with line manager as leave/expense approver. Old direct-status board and Core `/hr/applicants/{id}/advance` removed | `core/tests/test_hr_hiring.py`, `src/hr/recruitment/hiring.test.tsx`, `apps/eswasa_hr/tests/test_hiring.py` | Built. Needs Interview Types with expected skills. Offer letter print format not done |
| 3c. Onboarding and first days | Joiners `/hr/onboarding`, start `/hr/onboarding/new?employee=`, H7 `/hr/onboarding/:id`, E10 `/me/first-days` (+ banner on My HR) | `GET /hr/onboarding`, `GET /hr/onboarding/defaults`, `POST /hr/onboarding`, `GET /hr/onboarding/{name}`, `POST /hr/onboarding/tasks/{task}/done`, `GET /hr/me/onboarding` | `eswasa_hr.onboarding`: HRMS Employee Onboarding from the accepted offer; default checklist (HR, ICT, Finance, line manager, joiner), every task has a named owner; HRMS creates Project + Tasks; owner or HR marks done (also from Approvals via the Task handler; other Tasks keep the old close-ToDos behaviour); Completed when all done; signing the declaration ticks the joiner's task | `core/tests/test_hr_onboarding.py`, `src/hr/onboarding/onboarding.test.tsx`, `apps/eswasa_hr/tests/test_onboarding.py` | Built. Only for hires made through Recruitment (HRMS needs the offer) |

| 4. My team and probation (T1–T4, R-H1) | `/team` (overview), `/team/calendar`, `/team/:employee`, `/team/:employee/probation`; "My team" in the rail for all staff | `GET /hr/team`, `GET /hr/team/calendar`, `GET /hr/team/{employee}`, `POST /hr/team/{employee}/probation` | `eswasa_hr.team`: direct + indirect reports from the reports_to tree; job fields only (managers get no Employee read rights; methods check the tree); probation: direct manager confirms / extends / recommends ending (ending → HR Managers); R-H1 opens the review ToDo 30 days before | `core/tests/test_hr_team.py`, `src/team/team.test.tsx`, `apps/eswasa_hr/tests/test_team.py` | Built. R-H2 to R-H4 alerts still count-only |

Known gaps for slice 1: public holidays are not yet skipped in the 2-working-day SLA date, and a request whose approver is the applicant gets no ToDo (HR must set a different approver).

## 6. Porting to React

- Route map: `/hr/*` → H screens (existing routes in `portals/institution-portal/src/router.tsx`), plus new `/hr/directory/:id`, `/hr/recruitment/:req`, `/hr/competence/new`, `/team/*`, `/me/*`, and `/admin/hr-setup`.
- Every screen whose endpoint is marked **(new)** ships behind `NotConnectedPanel` until Core exposes it. Never fill those screens with the mockup's sample data.
- The persona switcher is mockup-only. In the portal, rail entries come from the user's roles.
