# HR & People: staging runbook

How to bring a staging site up to the HR backend on `hr-people` (plans 01–10) and run the acceptance suite. Nothing in HR has run against live HRMS yet, so the first run on staging is the real test. Record every run at the end of `HR_PEOPLE_HANDOVER.md`.

Staging only. Never set the e2e flags below on production, and never load the e2e seed there.

## 1. Pull

```bash
cd /srv/projects/eswasaone && git fetch && git checkout hr-people && git pull --ff-only
```

The bench must have the `eswasa_hr` app from this checkout (symlinked or pulled into `apps/`), plus `eswasa_certification`, `eswasa_metrology` and `eswasa_core`.

## 2. Migrate

```bash
bench --site <site> migrate
bench --site <site> execute eswasa_hr.install_check.run      # or: python3 scripts/hr_check_install.py --site <site> --bench <bench>
```

The check reads what to expect from the app itself (DocTypes and their fields, `hooks.fixtures`, `scheduler_events`, `patches.txt`). It must print `"ok": true`. Anything under `missing` means migrate didn't finish; read the migrate log, fix it, and run both again.

What migrate brings in (cumulative; the same list as `HR&PeopleBackend/00-README.md`):

| From | Items |
|---|---|
| Slices 6–11 | DocTypes `HR Alert`, `Contract Change`, `Establishment Change`, `HR Access Log`; role `Eswasa Executive Director`; `Designation.custom_grade`, `Staffing Plan Detail.custom_frozen_positions`; Employee `permlevel` property setters and DocPerms; case custom fields |
| Plan 02 | DocType `Module Access Request`; patch `own_record_user_permission`; permission hooks for Employee, Leave Application, Appraisal, Staff Authorisation, Employee Document |
| Plan 03 | `HR Alert.rule` options for leave; Leave Application `on_submit` cover prompt; R-L1 in the daily job |
| Plan 04 | DocTypes `HR Integrity Snapshot` (Single), `HR Notification`; `User.custom_hr_email_opt_out`; R-H7, R-H5 hand-off and recruitment reminders in the daily job |
| Plan 05 | Expense Claim `doc_events`; `HR Settings.custom_receipt_required_above`, `Expense Claim Detail.custom_receipt` |
| Plan 06 | DocTypes `Profile Change Request`, `Required Document`; `Employment Type.custom_required_documents`; `Employee Document` status fields; print format `Certificate of Service` |
| Plan 07 | Calibration Job, Field Visit and Certificate guards (`doc_events`); DocTypes `External Person`, `HR Evidence Pack`; `Training Event.custom_skill`, `HR Settings.custom_external_personnel_enabled`; role `Eswasa Quality Manager` |
| Plan 08 | `Job Requisition.custom_stage` (+ patch `requisition_stage`), `HR Settings.custom_offer_signatory_role`, `Job Applicant.custom_source`; print format `ESWASA Offer Letter`; `HR Notification.attachment` |
| Plan 09 | DocType `HR Import Run` |
| Plan 10 | Nothing new on the site (contract, registry, tests and this runbook) |

Workers: the evidence pack (plan 07) and the employee import (plan 09) run on the `long` queue. Make sure a `long` worker runs (`bench worker --queue long`, or the supervisor config includes it).

## 3. Clear the cache

```bash
bench --site <site> clear-cache && bench --site <site> clear-website-cache
```

## 4. Name the Executive Director

Give exactly one real user the `Eswasa Executive Director` role (Desk → User → Roles). Establishment changes (J11) wait for this person. The install check warns while nobody holds it.

## 5. Load ESWASA master data (when supplied)

Only with ESWASA's real file (Confirmation Pack H1–H3, H12–H14), never sample values:

```bash
bench --site <site> execute eswasa_hr.setup.load_master_data --kwargs "{'path': '/secure/eswasa_master_data.json', 'dry_run': True}"
bench --site <site> execute eswasa_hr.setup.load_master_data --kwargs "{'path': '/secure/eswasa_master_data.json', 'dry_run': False}"
```

Then import people with the two-pass import (API only, no screen): `GET /api/hr/import/template?pass=1`, then `POST /api/hr/import/dry-run` and `POST /api/hr/import/run` for pass 1 (records), pass 2 (line managers and approvers) and pass 3 (opening leave balances), dry run first each time; `GET /api/hr/import/runs` shows the result. HR setup shows where the import stands. Specs 2, 4 and 9 mean more once this structure is loaded.

## 6. Run the integrity check once

```bash
bench --site <site> execute eswasa_hr.tasks.rh7_integrity
```

This fills Overview → Record quality straight away instead of waiting for the night.

## 7. Restart Core and the portals

Set in Core's `.env`: `HR_NOTIFY_CRON_TOKEN`, `FRAPPE_SERVICE_API_KEY`, `FRAPPE_SERVICE_API_SECRET` (the HR email outbox). Add the host cron for the outbox:

```cron
*/10 * * * * curl -fsS -X POST -H "X-Cron-Token: $HR_NOTIFY_CRON_TOKEN" https://<host>/api/events/hr-notify
```

Restart Core (8015) and the portals (3015, 3016) so they serve this commit. The portals must run with `VITE_DEMO_MODE=false`.

## 8. Run the Playwright suite

The suite lives in `e2e/hr/` (project `hr`). It needs test people and records on staging, and a sign-in token per person.

**Seed (staging only).** In the site's `site_config.json`:

```json
"eswasa_e2e_seed": 1,
"eswasa_e2e_password": "<a long random password>",
"eswasa_e2e_mailbox": "qa+{persona}@<a mailbox you can read>"
```

Optional: `eswasa_e2e_skill` (the Skill tagged to a scheme to use for the guard specs) and `eswasa_e2e_leave_type`.

```bash
bench --site <site> execute eswasa_hr.e2e_seed.run
```

It creates `E2E …` people (HR Managers, an HR User, the ED, a line manager who heads `E2E People`, an employee, auditors, a leaver, a Certification Officer) and the records the specs need, then writes `sites/<site>/private/hr_e2e_seed.json`. That file holds each person's Desk API key: copy it to the test machine over a secure channel and keep it out of git. Blocks it couldn't build are listed under `skipped` with the reason (for example "No active Leave Period on this site (H14)"); the specs that need them skip with that reason.

**Tokens.** Sign-in sends a code by email, so take a token once per person (valid 7 hours):

```bash
cd e2e && npm install && npx playwright install chromium
export ESWASAONE_BASE_URL=https://<staging host> HR_E2E_SEED=/path/hr_e2e_seed.json HR_E2E_PASSWORD='<the password>'
for p in hr_manager hr_manager_2 hr_user ed line_manager employee cert_officer; do node hr/get-token.mjs $p; done
```

Tokens go to `e2e/hr/.tokens.json` (git-ignored).

**Run.**

```bash
export HR_E2E_DESK_URL=https://<frappe host> HR_E2E_TOKENS=$PWD/hr/.tokens.json
npm run test:hr
```

| Spec | Brief §14 |
|---|---|
| `no-fixtures` | 1. No Dispatch, Production, Purchase, Sales or "All Departments" in HR |
| `leave-routing` | 2. Only the line manager is asked; approving in Approvals updates My HR and Time off |
| `no-self-approval` | 3. Portal and Desk refuse self-approval; an HR User who isn't the approver is refused |
| `establishment` | 4. An offer beyond the plan is refused; a plan change waits for the ED |
| `competence-guard` | 5. An authorisation ending before the visit refuses the assignment, with the reason |
| `impartiality-guard` | 6. No declaration this year, no assignment |
| `expiry-alerts` | 7. 60 days before `valid_to`: one alert each for the person, the manager and HR |
| `privacy` | 8. Line manager 403 on `/sensitive`; HR Manager sees it and a log row is written |
| `leaver` | 9. Last day: login disabled, ToDos moved with the reason |
| `cases` | 10. A Certification Officer sees no case rows, nothing in Ask/Esi |
| `no-dead-pages` | 11. No HR tab shows an empty table or a live form for an unwired feature |
| `access-requests` | Plan 02: request, review, role granted; no reviewer approves their own |

Item 12 (payroll) is excluded with payroll itself (H15, H16).

The specs that touch the README "Frontend conflicts" (Time off buttons, Add person) assert the backend refusal, not the button.

## 9. Record the results

Add a dated entry to `HR_PEOPLE_HANDOVER.md`: the commit, the install check result, the seed's `skipped` list, and the Playwright summary (passed / failed / skipped, with each failure's first line). A skip is not a pass: list why each one skipped.

**Remove the test people when done.** Disable the `E2E …` users (Desk → User list, filter on the e2e mailbox) and set `eswasa_e2e_seed` back to 0.

## 10. Demo people (demo sites only)

Three joiners who went through the whole hire journey, plus the staff who ran it, for exploring the portal. The demo flag also loads the provisional baseline (section 11) first, because the journey hires into its departments and vacancies and acts as three of its staff. Add to the demo site's `site_config.json`:

```json
"eswasa_demo_seed": 1,
"eswasa_demo_password": "<one password for every demo login>"
```

The next `bench --site <site> migrate` seeds them (the last `after_migrate` step), or run it now:

```bash
bench --site <site> execute eswasa_hr.demo_seed.run
```

| Login | Who | Role in the journey |
|---|---|---|
| `nomvula.dlamini@eswasa.demo` | Human Resources Manager | Raises the requisitions, prepares the offers, starts onboarding |
| `sandile.motsa@eswasa.demo` | Senior HR Officer (HR Manager role) | Second HR approval, approves the offers, interview panel |
| `mduduzi.nxumalo@eswasa.demo` | Certification Manager, head of Certification | Head approval, interview panel, line manager |
| `lindiwe.mamba@eswasa.demo` | Certification Officer, joined ~3 months ago | Joiner |
| `sibusiso.maseko@eswasa.demo` | Lead Auditor, joined ~2 months ago | Joiner (spouse and child as dependants) |
| `phumzile.hlophe@eswasa.demo` | Technical Reviewer, joined ~3 weeks ago | Joiner |

Every login has the emailed sign-in code switched off (`User.custom_otp_enabled = 0`), so sign in with the email and the password only. The addresses can't receive mail (`eswasa_demo_mail_domain` changes the domain), and personal emails are `@example.com`. Each hire takes one of Certification's open vacancies; a hire with no vacancy left is listed under `skipped` in `sites/<site>/private/hr_demo_seed.json`. Running it again only finishes what's missing.

Never set the flag on production. To retire the demo, disable the six users and set `eswasa_demo_seed` to 0.

## 11. Provisional Eswatini baseline (staging and demo sites)

Until ESWASA signs off its values, this makes every HR & People screen usable with an Eswatini-style organisation of 82 staff (85 with the demo joiners). The values are files in `apps/eswasa_hr/eswasa_hr/data/baseline/` (see its README), not code. They are loaded through the same mechanisms HR uses: the master-data loader, the employee import (recorded as HR Import Runs), and the setup records.

```json
"eswasa_hr_baseline": 1
```

The next `bench --site <site> migrate` loads it (just before the demo people), or run it now:

```bash
bench --site <site> execute eswasa_hr.baseline.run
```

It fills the ESWASA answers that are still open:

- A1: disciplinary code and warning months
- A2: issued item types
- A3: letter wording
- A8: milestone years

It also loads departments, heads, posts and the approved establishment, the Eswatini holidays for 2026–2027, leave types with the current leave period and policy, the competence catalogue, required documents and expense claim types. HR setup then shows these steps as done.

Only empty values get written, so anything HR has set stays as it is. A file already imported isn't imported again. Logins use `@eswasa.demo`, and invitation emails are muted. With `eswasa_demo_password` and the demo flag, every baseline login uses that password.

| Login | Who |
|---|---|
| `nompumelelo.dube@eswasa.demo` | Executive Director (`Eswasa Executive Director` role; decides establishment changes) |
| `melusi.khumalo@eswasa.demo` | Finance Manager (`Accounts Manager`) |
| `thabo.tsabedze@eswasa.demo` | Quality Manager (`Eswasa Quality Manager`) |
| `nokuthula.mhlanga@eswasa.demo` | Metrology Manager, head of Metrology (line manager of 10) |
| `melusi.sibandze@eswasa.demo` | Human Resources Officer (`HR User`) |
| `ncamsile.nxumalo@eswasa.demo` | Laboratory Analyst (an ordinary employee) |

The result goes to `sites/<site>/private/hr_baseline.json`, with a reason for each skipped step. Never set the flag on production; ESWASA's real data goes in through HR setup (section 5).
