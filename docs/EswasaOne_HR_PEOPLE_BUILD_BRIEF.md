# EswasaOne — HR & People build brief: ERPNext/HRMS setup, data load, and the gaps to build

> Target: the HR & People mockup (`hr-ideal.html`), nine tabs: Overview, Directory, Structure, Time off, Competence, Recruitment, Performance, Payroll, Cases.
> Governed by `docs/EswasaOne_WORKFLOW_MAP.md` §3.9 (HRMS native workflows), §3.12 (Field Visit guards) and §5 (automation law), and by `docs/EswasaOne_APPROVALS_FIX_BRIEF.md` (scoping, delegation, no silent dead pages).
> Rules for this brief:
> - **Native HRMS first.** Build a custom DocType only where §6, §10 and §11 say the native one can't do the job.
> - **Nothing is decided on an HR page.** HR tabs are registers and pipelines. Every approval is a ToDo in Approvals (map invariant 6).
> - **All enforcement lives in Frappe**, so a Desk click is guarded like a portal click.
> - **No sample data in live.** Every number in the mockup is invented. Load ESWASA's real structure (§0.5).
> - Every section ships with a Playwright e2e test against staging.
>
> **Version note.** DocType and field names below were checked against the `version-15` source of ERPNext and HRMS. Run `bench version` first. If the bench is on another version, check each name with `frappe.get_meta("<DocType>")` and report mismatches. Don't guess.

---

## 0. What's wrong today

| # | Symptom on `/institution/hr` | Root cause |
|---|---|---|
| 1 | Overview is a "Setup progress 3 of 7" checklist | No HR data is loaded, so the page has only configuration to show |
| 2 | 14 departments: Dispatch, Production, Purchase, Sales… and "All Departments" | These are ERPNext's install fixtures. "All Departments" is the tree root (`is_group = 1`), listed as if it were a department |
| 3 | Every department shows "Head: Unassigned" | `Department` has no head field natively. HRMS adds only approver tables and a payroll cost centre |
| 4 | "Designations with optional approved headcount" | `Designation` has no headcount field. Approved posts belong in `Staffing Plan` (§3) |
| 5 | 0 employee records, while staff log in and appear in Approvals | Portal Users exist without `Employee` records. `reports_to` and `leave_approver` are therefore empty, so hierarchy routing (map §5.2 step 3), the Team view, delegation eligibility and Field Visit guards have nothing to read |
| 6 | KPI tiles count departments and locations | They should count people (§12.2) |

---

## 0.5 Step 0: decisions and inputs from ESWASA (get these first)

These are policy and regulatory inputs, not design choices. Don't invent them.

| # | Input | Used in |
|---|---|---|
| 1 | Organisation structure: departments, heads, locations, cost centres | §1 |
| 2 | Approved establishment: posts per department, grade bands, frozen posts | §3 |
| 3 | Staff list with line manager, post, grade, contract type and dates | §2 |
| 4 | Leave policy: types, entitlement per grade, leave year, carry-over limit, encashment | §5 |
| 5 | Opening leave balances at go-live | §5 |
| 6 | **Payroll scope.** Does payroll run in HRMS, or stay in the current payroll system? Where does the journal post: ERPNext GL or Pastel? | §9 |
| 7 | Statutory deductions and tax tables, supplied and signed off by Finance | §9 |
| 8 | Competence list per scheme and calibration discipline, validity period, who authorises | §6 |
| 9 | Probation length, what happens when it ends, notice periods | §4 |
| 10 | Who may see personal data and who may see pay | §11 |

**Done when** each row has a named ESWASA owner and a dated answer. Items 6 and 7 block §9 only; the rest of the build proceeds.

---

## 1. Master data (configure, all native)

1. **Holiday List.** Reuse the Eswatini list that drives SLAs (L9). Set it as the Company default.
2. **Department.**
   - Build ESWASA's tree under the existing root.
   - Set `disabled = 1` on unused fixtures. Don't delete a department that anything links to.
   - Every API and picker filters `is_group = 0 AND disabled = 0 AND company = <ESWASA>`.
   - Add custom field `custom_head` (Link → Employee).
   - Fill the HRMS fields `payroll_cost_center`, `leave_approvers`, `expense_approvers`.
3. **Branch** for locations. **Employment Type** for Permanent, Fixed-term, Intern and so on.
4. **Employee Grade** for grade bands. Link `default_salary_structure` once §9 exists.
5. **Designation**, one per post title. Fill its `skills` table (Designation Skill) with the competences the post requires (§6).
6. **HR Settings.**
   - `leave_approver_mandatory_in_leave_application = 1`
   - `expense_approver_mandatory_in_expense_claim = 1`
   - `prevent_self_leave_approval = 1`, `prevent_self_expense_approval = 1`
   - `restrict_backdated_leave_application = 1`
   - `check_vacancies = 1`
   - Keep `emp_created_by = Naming Series`. Put the staff number in `employee_number` and show that in the portal.

Ship 2–6 as fixtures in `eswasa_core` so staging and production match.

**Done when** the Structure tab lists only ESWASA departments, each with a head, and no fixture or root node appears anywhere in the portal.

---

## 2. Employees (load) — this unblocks everything else

1. **Import with Data Import, in two passes.**
   - Pass 1 creates the records: `employee_number`, name fields, `gender`, `date_of_birth`, `date_of_joining`, `company`, `status`, `department`, `designation`, `grade`, `branch`, `employment_type`, `holiday_list`, `scheduled_confirmation_date`, `final_confirmation_date`, `contract_end_date`, `notice_number_of_days`, `payroll_cost_center`.
   - Pass 2 sets the links that need pass 1 to exist: `reports_to` (Employee), `leave_approver` and `expense_approver` (User).
2. **Link each Employee to its portal User** through `user_id`, with `create_user_permission = 1`. Never create a second User for someone who already logs in.
3. **Roles.** Everyone gets `Employee` and `Employee Self Service`. Give `HR User`, `HR Manager`, `Leave Approver`, `Expense Approver` and `Interviewer` only to people who do that work.
4. **Integrity check (CI and a nightly job).** Every `Active` employee has `user_id`, `department` (a leaf), `designation`, `grade`, `holiday_list` and `reports_to`. Only the CEO may lack `reports_to`. Failures feed the Overview "Record quality" card.
5. **Demo records.** Seeded employees are flagged `is_demo` and excluded from live, as in the Approvals brief §4.

**Done when**
- Directory lists every ESWASA employee, and the integrity check passes.
- A leave request from any employee creates a ToDo for the right line manager.
- The Approvals Team view shows each manager their own reports.

---

## 3. Structure: the approved establishment

Use **Staffing Plan** as the establishment. It is submittable, one per department per financial year.

| Portal column | Source |
|---|---|
| Approved | `Staffing Plan Detail.number_of_positions`, per designation |
| Filled | Live count of `Active` employees by department and designation. Don't use `current_count`; it is captured when the plan is written |
| Vacant | Approved − Filled |
| In recruitment | `vacancies` on open `Job Opening`s linked to the plan |
| Frozen | Custom field `custom_frozen_positions` (Int) on `Staffing Plan Detail` |
| Head, cost centre | `Department.custom_head`, `Department.payroll_cost_center` |

- **Changing the establishment** means amending the Staffing Plan. Declare it in the registry (Draft → Approved, CEO approves). The "Request a change" button starts that amendment.
- **Hiring only into approved posts.** `Job Opening` validates against its `staffing_plan`, and with `check_vacancies = 1` a `Job Offer` beyond the plan is refused. Keep both.

**Done when** the Structure totals reconcile with Directory, and a Job Offer for a post with no vacancy is refused in Desk and in the portal.

---

## 4. Lifecycle: join, change, leave

| Event | Native DocType | What to configure or add |
|---|---|---|
| Onboarding | `Employee Onboarding` + `Employee Onboarding Template` | One template per department or post. Activities become Tasks assigned to a user, which already creates a ToDo. Declare them as `do` family with plain titles |
| Probation | `Employee.scheduled_confirmation_date`, `final_confirmation_date` | **R-H1:** `sys-cron` creates a `do` ToDo for `reports_to` 30 days before the scheduled date. Confirming sets `final_confirmation_date` |
| Fixed-term contract | `Employee.contract_end_date` | **R-H2:** `alert` to HR Manager and line manager 60 days before |
| Promotion, transfer | `Employee Promotion`, `Employee Transfer` | Submitting updates the Employee and writes its internal work history. The record drawer's History reads from that |
| Leaving | `Employee Separation` + template, `Exit Interview`, `Full and Final Statement` | On the last day set `status = Left` and `relieving_date`, disable the User, and reassign the leaver's open ToDos to `reports_to` with a logged reason |

The Overview "Movements" card reads this month's joiners (`date_of_joining`), submitted promotions and transfers, and open separations.

**Done when** onboarding a hire creates tasks for ICT, Finance and the line manager in their Approvals inboxes, and a leaver's open approvals move to their manager on the last day.

---

## 5. Time off

1. **Leave Period** for ESWASA's leave year.
2. **Leave Type** per policy. The fields that carry the policy:
   - `max_leaves_allowed`, `max_continuous_days_allowed`, `applicable_after`
   - `is_carry_forward`, `maximum_carry_forwarded_leaves`, `expire_carry_forwarded_leaves_after_days`
   - `allow_encashment`, `is_lwp`, `include_holiday`
3. **Leave Policy** per grade, then **Leave Policy Assignment** in bulk. This creates the `Leave Allocation`s.
4. **Opening balances** go in as Leave Allocations dated at go-live.
5. **Leave Application.** Native states Open → Approved / Rejected. The approver is the employee's `leave_approver`. The registry declares it (map §3.9). The decision is made in Approvals through `/act`, which sets `status` and submits.
6. **The Time off tab is read-only.**

| Portal element | Source |
|---|---|
| Balance, balance after | `get_leave_balance_on` / `get_leave_details` in `hrms.hr.doctype.leave_application.leave_application` |
| Leave owed | Sum of balances for encashable types. Cross-check with the Employee Leave Balance Summary report |
| Above carry-over limit | Balance > `maximum_carry_forwarded_leaves` |
| Calendar, solid cell | Approved Leave Application |
| Calendar, dashed cell | Open Leave Application |
| Calendar, "F" cell | The person's `Field Visit`s. This is not leave and not Attendance |

- **Cover.** An approved leave for someone who holds approval work triggers the cover prompt in the Approvals brief §3.2. "Approved, no cover set" is that state.
- **Self-service.** Staff apply from the portal and the Field PWA "Me" screen.
- Attendance and shifts are out of scope unless ESWASA asks for them.

**Done when** balances in the portal equal the Leave Ledger, no leave can be approved outside Approvals, and approved leave blocks Field Visit assignment for those dates.

---

## 6. Competence and impartiality (custom; this is the main gap)

**Why custom.** The native `Employee Skill Map` stores a skill, a star rating and an evaluation date. It has no validity dates, evidence or approver, so it can't answer "is this person authorised on the audit date?".

**First check `eswasa_core`.** The Field Visit guard (map §5.7) already tests competence, impartiality and rotation. If a DocType already backs it, extend that DocType. Don't create a second source.

### 6.1 Competence catalogue
Use native **Skill**, one per competence, e.g. "QMS lead auditor, ISO 9001". Add custom fields:
- `custom_kind`: Audit / Technical review / Calibration / Inspection
- `custom_scheme`: link to the scheme or discipline
- `custom_validity_months`

`Designation.skills` then states what each post requires.

### 6.2 `Staff Authorisation` (new, submittable)

| Field | Notes |
|---|---|
| `employee`, `skill` | Links |
| `valid_from`, `valid_to` | `valid_to` defaults from `custom_validity_months` |
| `evidence` | Child table: Training Result, witnessed audit, proficiency test, file |
| `approved_by` | Must differ from `employee` (four-eyes) |
| `status` | Current / Expiring (≤ 60 days) / Expired / Withdrawn, computed |

- Registry: Draft → Approved, approved by the head of the department. Draft means "In training" in the matrix.
- **One guard function:** `eswasa_core.hr.competence.is_authorised(employee, skill, on_date)`. Field Visit assignment and Calibration Job assignment both call it. The portal matrix reads the same data.
- **R-H3:** `alert` to the employee, line manager and HR at 60, 30 and 7 days before `valid_to`. At expiry the status becomes Expired and the guard starts refusing.
- **R-H4:** `alert` to the head of department when a competence has one or zero current holders.

### 6.3 `Impartiality Declaration` (new, submittable)
- One per employee per year: `employee`, `year`, `signed_on`, and a child table of interests (`organisation`, `relationship`, `from_date`, `to_date`).
- **R-H5:** each year `sys-cron` opens a `do` ToDo per employee to complete it.
- Guard `has_conflict(employee, customer, on_date)` looks back two years. An employee with no signed declaration for the current year fails every audit and decision guard.

### 6.4 Training
Use native `Training Event` and `Training Result`, plus Frappe LMS completions, as evidence rows on an authorisation.

**Done when**
- Assigning a lead auditor whose authorisation expires before the visit date is refused with a plain-language reason, in Desk and in the portal.
- The Competence matrix and the Field Visit guard always agree, because both read `Staff Authorisation`.

---

## 7. Recruitment

Chain: **Staffing Plan** vacancy → **Job Requisition** → **Job Opening** → **Job Applicant** → **Interview** (+ Interview Feedback) → **Job Offer** → **Employee Onboarding** → **Employee**.

- **Job Requisition** native statuses: Pending → Open & Approved / Rejected / On Hold / Filled / Cancelled. Declare the approval in the registry.
- **Job Opening** carries `staffing_plan`, `job_requisition`, `vacancies`, `posted_on`, `closes_on`.
- **Job Applicant.** Native `status` is only Open / Replied / Rejected / Hold / Accepted. Add the registry workflow from map §3.9 (Open → Shortlisted → Interview → Offer → Hired / Rejected) and keep native `status` in step.
- **Job Offer** is submittable. Offer approval is an `approve` ToDo.

| Portal column | Source |
|---|---|
| Stage | Furthest applicant workflow state on the opening |
| Candidates | Applicant counts per workflow state |
| Days open | Today − `posted_on`, against a target held in settings |
| "Not started" vacancies | Establishment vacancies with no open requisition |

**Done when** a requisition can't be opened for a post with no vacancy, and an accepted offer starts onboarding with the applicant's details carried over.

---

## 8. Performance

1. `KRA` and `Appraisal Template` per post family.
2. `Appraisal Cycle` per review period. Add appraisees, then create the Appraisals.
3. `Goal` per employee, linked to `kra` and `appraisal_cycle`. Add `custom_strategic_goal` to link each goal to the strategic plan.
4. Staff complete the self-assessment in self-service (`self_ratings`, `self_score`).
5. The manager submits `Employee Performance Feedback` against the Appraisal.

| Portal measure | Source |
|---|---|
| Self-assessments done | Appraisals in the cycle with self-ratings saved |
| Manager reviews done | Appraisals with submitted feedback from `reports_to` |
| Objectives set | Employees with at least one Goal in the cycle |

**R-H6:** reminders to people with an open step at 10 and 3 working days before the cycle `end_date`.

---

## 9. Payroll (build only if decision 0.5 #6 says HRMS)

1. **Setup:** `Payroll Settings`, `Salary Component`s, `Income Tax Slab`, `Payroll Period`, one `Salary Structure` per grade, and a `Salary Structure Assignment` per employee.
2. **Statutory deductions** are Salary Components whose formulas and tables come from Finance (0.5 #7). Don't hard-code a rate from memory. The HRMS Provident Fund and Professional Tax reports are India-specific; build an Eswatini statutory report if Finance needs one.
3. **One-off items** (acting allowance, leave pay-out) use `Additional Salary`.
4. **The monthly run** is one `Payroll Entry`. Map the six portal steps to it:

| Portal step | In HRMS |
|---|---|
| 1. Inputs open | Period open |
| 2. Approve changes | New or changed Salary Structure Assignment, Additional Salary, promotion, separation. Each is an `approve` ToDo for Finance |
| 3. Calculate | Payroll Entry creates Salary Slips, after cut-off |
| 4. Review differences | Core compares totals with the previous month's submitted slips |
| 5. Approve the run | Finance Manager submits the slips. Must differ from whoever prepared the run |
| 6. Pay and post | Bank entry, then the accrual journal to ERPNext GL or to Pastel through the outbox (L5) |

5. **Blocked changes.** A joiner with no bank details or no Salary Structure Assignment shows as Blocked and creates a `do` ToDo for HR.
6. **Payslips** appear in self-service and the Field PWA "Me" screen.

**If payroll stays outside HRMS:** keep steps 1–2 as the change feed, export approved changes to the payroll system, and hide steps 3–6.

---

## 10. Cases

- **Grievances:** native `Employee Grievance` (Open → Investigated → Resolved / Invalid) with `Grievance Type`.
- **Disciplinary:** no native DocType. Add `Disciplinary Case`: `employee`, `allegation`, `owner`, `next_step_due`, `outcome`, with states Opened → Investigation → Hearing scheduled → Outcome issued → Appeal → Closed.
- **Access.** Only HR Manager and the case owner can read a case. Exclude both DocTypes from global search and from Ask/Esi. The list API never returns the names of the people involved.
- **Routing.** Case ToDos go to the named owner only, never to a pool. An appeal never goes to the person who made the original decision.
- **Board** receives counts by kind and time to close, and nothing else.

---

## 11. Access and privacy

1. **Own record.** The User Permission from §2.2 limits each employee to their own Employee record.
2. **Line managers** see their direct and indirect reports. Frappe doesn't do this natively: add `permission_query_conditions` and `has_permission` hooks for Employee in `eswasa_core`.
3. **Field levels,** shipped as property setters:
   - Level 1, personal: `date_of_birth`, `personal_email`, `cell_number`, `passport_number`, `marital_status`, `blood_group`, emergency contact. Granted to HR User and HR Manager.
   - Level 2, pay and bank: `bank_name`, `bank_ac_no`, `salary_mode`, `ctc`. Granted to HR Manager and the payroll role only.
4. **Logged reveal.** The drawer's "Show details" calls `GET /api/hr/employees/:id/sensitive`, which writes who, whose record, which fields and when.
5. **Documents.** Add `Employee Document` (`employee`, `document_type`, `file`, `expires_on`) and a required-documents list per Employment Type. This drives "Required documents on file".

**Done when** a line manager can't read a report's bank details through the portal, the API or Desk, and every reveal has a log row.

---

## 12. Registry, Core API and portal wiring

### 12.1 Registry declarations (`eswasa_core/registry/workflows/hr_*.yaml`)

| DocType | Family | Who acts | Proposed SLA → escalation |
|---|---|---|---|
| Leave Application | approve | Employee's `leave_approver` | 2d → HR Manager |
| Expense Claim | approve | Employee's `expense_approver` | 3d → Finance |
| Staffing Plan (amend) | approve | CEO | 5d |
| Job Requisition | approve | Head of department, then HR Manager | 3d |
| Job Offer | approve | HR Manager | 2d |
| Employee Promotion / Transfer | approve | HR Manager | 3d |
| Staff Authorisation | approve | Head of department (≠ employee) | 5d |
| Payroll change, Payroll Entry | approve | Finance Manager (≠ preparer) | Before cut-off |
| Probation review (R-H1) | do | `reports_to` | By the scheduled date |
| Impartiality Declaration (R-H5) | do | The employee | 10d → line manager |
| R-H2, R-H3, R-H4 | alert | As stated above | — |

- **No ToDo is ever assigned to `Employee`, `Employee Self Service` or `HR User` as a pool.** These are catch-all roles (Approvals brief §1).
- Titles come from `todo_title` templates in plain words, e.g. "Approve leave for {employee}, {from} to {to}".
- SLA values are proposals. Confirm them with ESWASA and map R-H1…H6 into `INSTITUTION_FUNCTIONAL_SPEC`.

### 12.2 Core endpoints (`core/api/hr`)

```
GET  /api/hr/overview                  KPIs, needs-attention, away today, movements, record quality
GET  /api/hr/employees                 directory (search, department, status)
GET  /api/hr/employees/:id             record: job, leave, authorisations, documents, history
GET  /api/hr/employees/:id/sensitive   level 1/2 fields; writes the access log
GET  /api/hr/establishment             §3 table, per department and per post
GET  /api/hr/leave/calendar            leave + field visits for a team and date range
GET  /api/hr/leave/requests            read-only list with status and approver
GET  /api/hr/competence/matrix         people × competences, cover per competence
GET  /api/hr/competence/expiring       next 60 days
GET  /api/hr/impartiality              signed / outstanding for the year
GET  /api/hr/recruitment               requisitions with funnel counts
GET  /api/hr/performance               cycle completion by department
GET  /api/hr/payroll/run               current run: step, changes, comparison
GET  /api/hr/cases                     HR Manager and owner only
POST /api/hr/{doctype}/:id/act         the one transition API (map invariant 1)
```

KPI definitions:
- **Headcount:** employees with `status = Active`.
- **Turnover, 12 months:** leavers in the period ÷ average month-end headcount.
- **Away today:** approved leave covering today, plus Field Visits in progress today.
- **Ending in 60 days:** `contract_end_date` or `scheduled_confirmation_date` within 60 days.

### 12.3 Portal (`institution-portal/src/hr`)
- Each tab reads its endpoint. No tab reads the local store. Until an endpoint is wired, the tab shows the shared `<NotConnected>` gate (Approvals brief §0.5).
- **Move the setup checklist** to System Administration → HR setup. If no employees exist, Overview shows one line saying HR isn't set up yet, with a link there.
- Tab order as in the mockup. Competence and Cases are new routes.
- Board roll-up: `board_rollup: hr.summary` builds the Board HR pack from the same endpoints.

---

## 13. Build order

0. Step 0 decisions (§0.5).
1. Master data fixtures (§1).
2. Employee load, User links, roles, integrity check (§2). **Approvals routing depends on this.**
3. Leave setup and balances (§5).
4. Establishment (§3).
5. Competence and impartiality (§6). **Field Visit guards depend on this.**
6. Lifecycle (§4), then Recruitment (§7), Performance (§8), Cases (§10).
7. Payroll (§9), once decisions 6 and 7 are in.
8. Access and privacy (§11) is applied with step 2 and tested again at the end.
9. Wire each portal tab as its section lands (§12).

---

## 14. Acceptance (Playwright, staging)

1. **No fixtures.** No portal page lists Dispatch, Production, Purchase, Sales or "All Departments".
2. **Routing.** An employee applies for leave; their line manager, and nobody else, gets the ToDo. Approving it in Approvals updates the Time off calendar.
3. **No self-approval.** A manager can't approve their own leave in the portal or in Desk.
4. **Establishment.** A Job Offer for a post with no vacancy is refused. Amending the Staffing Plan needs CEO approval.
5. **Competence guard.** Assigning an auditor whose authorisation has expired, or expires before the visit date, is refused with the reason shown.
6. **Impartiality guard.** An employee with no signed declaration this year can't be assigned to an audit or make a certification decision.
7. **Expiry alerts.** An authorisation 60 days from `valid_to` produces one `alert` each for the employee, the line manager and HR.
8. **Privacy.** A line manager gets a 403 on `/sensitive` for a report. The HR Manager gets the data and a log row.
9. **Leaver.** On the last day the User is disabled and open ToDos move to `reports_to` with the reason logged.
10. **Cases.** A Certification Officer gets no rows from `/api/hr/cases`, and case records don't appear in search or Ask/Esi.
11. **No dead pages.** With demo mode off, no HR tab shows an empty table or an enabled form for an unwired feature.
12. **Payroll (if in scope).** The run can't be approved by the person who prepared it. A joiner without bank details shows as Blocked.

### Paste-ready agent prompt
```
Implement docs/EswasaOne_HR_PEOPLE_BUILD_BRIEF.md against the hr-ideal.html mockup.
Own: eswasa_core (HR fixtures, custom fields, Staff Authorisation, Impartiality Declaration,
Disciplinary Case, Employee Document, hr guards, hr_*.yaml registry files, R-H1..H6 cron rules),
core/api/hr, institution-portal/src/hr, System Administration → HR setup.
First: run `bench version`; verify every DocType and fieldname in the brief with frappe.get_meta and
report mismatches before coding. Check whether a DocType already backs the Field Visit competence
and impartiality guards; extend it rather than adding a second source.
Order: §1 master data fixtures → §2 employee import template, User links, roles, integrity check →
§5 leave → §3 establishment → §6 competence and impartiality (one guard function used by Field Visit
and Calibration Job) → §4 lifecycle → §7 recruitment → §8 performance → §10 cases → §9 payroll only
if the payroll decision is recorded → §11 access (permission hooks, field levels, logged reveal) →
§12 endpoints and portal tabs, each behind <NotConnected> until wired.
Native HRMS first; no approvals on HR pages; all guards in Frappe; no ToDo to catch-all roles;
no invented structure, staff, leave rules or tax rates — stop and ask for the §0.5 inputs.
Ship §14 as Playwright e2e on staging.
```