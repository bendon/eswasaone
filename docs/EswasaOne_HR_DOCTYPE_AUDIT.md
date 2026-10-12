# HR DocType audit (bench version-16)

Generated against `eswasaone.localhost`.

## Bench versions

- frappe 16.34.0 (version-16)
- erpnext 16.35.0 (version-16)
- hrms 16.19.0 (version-16)

> Brief assumed version-15. On this bench, native fieldnames checked below still match the brief for Employee, Department (HRMS tables), Staffing Plan Detail, HR Settings, Leave Type.

## Live counts

- Employees: **0**
- Departments sampled: 14 (ERPNext install fixtures present: Dispatch, Production, Sales, …)

## DocType exists / key fields

### Department (`Setup`, submittable=False)

- `is_group`: ✅
- `disabled`: ✅
- `company`: ✅
- `payroll_cost_center`: ✅
- `leave_approvers`: ✅
- `expense_approvers`: ✅
- `custom_head`: ❌ not present — add

### Employee (`Setup`, submittable=False)

- `reports_to`: ✅
- `leave_approver`: ✅
- `expense_approver`: ✅
- `user_id`: ✅
- `employee_number`: ✅
- `create_user_permission`: ✅
- `scheduled_confirmation_date`: ✅
- `contract_end_date`: ✅
- `grade`: ✅
- `department`: ✅
- `designation`: ✅
- `holiday_list`: ✅

### Staffing Plan Detail (`HR`, submittable=False)

- `number_of_positions`: ✅
- `current_count`: ✅
- `vacancies`: ✅
- `custom_frozen_positions`: ❌ not present — add

### HR Settings (`HR`, submittable=False)

- `leave_approver_mandatory_in_leave_application`: ✅
- `expense_approver_mandatory_in_expense_claim`: ✅
- `prevent_self_leave_approval`: ✅
- `prevent_self_expense_approval`: ✅
- `restrict_backdated_leave_application`: ✅
- `check_vacancies`: ✅
- `emp_created_by`: ✅

### Leave Type (`HR`, submittable=False)

- `max_leaves_allowed`: ✅
- `is_carry_forward`: ✅
- `maximum_carry_forwarded_leaves`: ✅

### Job Opening (`HR`, submittable=False)

- `staffing_plan`: ✅
- `vacancies`: ✅

### Skill (`HR`, submittable=False)

- `custom_kind`: ❌ not present — add
- `custom_scheme`: ❌ not present — add
- `custom_validity_months`: ❌ not present — add

### Auditor Competence (`Certification`, submittable=False)

- `auditor`: ✅
- `scheme`: ✅
- `valid_from`: ✅
- `valid_to`: ✅
- `competence_level`: ✅

### Field Visit (`Certification`, submittable=False)

- `scheme`: ✅

## Auditor Competence vs Staff Authorisation

`Auditor Competence` exists (Certification module) with `auditor` → Auditor, `scheme`, `valid_from`/`valid_to`, `competence_level`, evidence notes. It is **not** Employee+Skill based, not submittable, and has no four-eyes `approved_by`.

Field Visit guards in the portal currently use the certification local store (`competenceProblem`). Frappe side uses `auditor_competence_valid` on `Auditor Competence`.

**Decision:** add `Staff Authorisation` (Employee + Skill) as the shared HR source per brief §6; bridge Certification/Metrology guards to `eswasa_hr.competence.is_authorised`. Do not treat Auditor Competence as that source — extend via a bridge, not a second conflicting write path.

## §0.5 blockers

Cannot invent: org structure, establishment, staff list, leave policy, opening balances, payroll scope, tax tables, competence catalogue, probation rules, privacy roles. Build proceeds with fixtures/scaffolding until those arrive.
