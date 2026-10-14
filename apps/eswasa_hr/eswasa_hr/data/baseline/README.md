# Provisional Eswatini baseline (staging and demo sites)

These files give a staging or demo site a believable ESWASA to work with until ESWASA signs off its own values. They are modelled on Eswatini practice. They are **not** ESWASA's data. `eswasa_hr.baseline` loads them on `bench migrate`, but only on a site whose `site_config.json` has `"eswasa_hr_baseline": 1` (or `"eswasa_demo_seed": 1`).

| File | What it holds | Loaded through |
|---|---|---|
| `master_data.json` | 2 branches, 3 employment types, Paterson grades A2–E1, 3 divisions with 15 departments, 51 posts with grades, and the Eswatini holiday list for 2026–2027 (public holidays and weekends; a Sunday holiday is observed on the Monday) | `master_data_load` (the same loader as HR setup) |
| `policy.json` | Warning validity in months (A1), the disciplinary code (A1), issued item types (A2), letter wording (A3), milestone years (A8), receipt threshold, leave types and the leave period and policy, the competence catalogue, required documents per employment type, expense claim types | HR Settings, Disciplinary Offence, Terms and Conditions, Leave Type / Period / Policy, Skill, Employment Type, Expense Claim Type |
| `staff_records.csv`, `staff_logins.csv`, `staff_lines.csv`, `staff_leave.csv` | 82 staff in the employee-import template format: records, logins, line managers and approvers, and opening leave balances | `employee_import` passes 1, 2, 2, 3, each recorded as an HR Import Run |
| `organisation.json` | Approved posts per department (89, so a few vacancies stay open), the head of each department, and roles beyond the default staff roles (Executive Director, HR, Finance, Quality, interviewers) | Staffing Plan, Department head, User roles |
| `demo_journey.json` | Demo sites only: the three staff the hiring journey acts as (found by staff number) and the three joiners it hires (85 people in all) | `eswasa_hr.demo_seed` |

Rules:

- Only empty values get written. A setting, record, head or plan that HR has already set is left alone, and a staff file already imported isn't imported again.
- Work emails use `@eswasa.demo`, which can't receive mail. A site with `eswasa_demo_mail_domain` gets its own domain instead. Invitation emails are muted while loading.
- On demo sites with `eswasa_demo_password`, every baseline login can sign in with that password, without the emailed sign-in code.
- What happened goes to `sites/<site>/private/hr_baseline.json`.

When ESWASA supplies its real values, load them through HR setup and remove the flag. Nothing in the module's code depends on these files.
