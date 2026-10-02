# eswasa_metrology (WS3 / A6 RegLive · S5 MetroRules)

ISO/IEC 17025 metrology + LIMS.

**DocTypes:** Instrument, Sample, Test Method, Calibration Job, Result, Calibration Certificate, Traceability Link

**Workflow:** Received → In Progress → Reviewed → Certified → Dispatched (on Calibration Job)

## Rules (R-M1…M4)

| ID | Trigger | Effect |
|----|---------|--------|
| R-M1 | Calibration Job `on_submit` (Received) | Assign Metrologist; `due_on` = method TAT; draft Sales Invoice; feed |
| R-M2 | Result `on_update_after_submit` when `reviewed` | Calibration Certificate + Traceability Link; finalise invoice; job → Dispatched; notify |
| R-M3 | Daily cron | Calibration-due notify; internal ESWASA overdue → `blocked_for_use` + validate on new jobs |
| R-M4 | Result `validate` / `before_submit` | Out-of-tolerance flag; supervisor sign-off required; feed |

Smoke: `bench --site eswasaone.localhost execute eswasa_metrology.smoke_rm.run`

## Whitelisted API (A4 / Core)

| Method | Notes |
|--------|--------|
| `eswasa_metrology.api.list_calibration_jobs` | OpenAPI `MetrologyJobSummary[]` / `/metrology/jobs` — `status`, `limit` |
| `eswasa_metrology.api.get_calibration_job` | Single job + Result rows |

`status` maps from Calibration Job `workflow_state`; `customer` comes from Instrument `owner_customer`.
