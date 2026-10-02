# eswasa_certification (A5 / WS2)

ISO/IEC 17021/17065 CBMS vertical slice for EswasaOne.

## DocTypes

| DocType | Purpose |
|---|---|
| Certification Scheme | Accredited scheme catalogue (17021/17065) |
| Certification Application | Application lifecycle (workflow) |
| Audit | Planned / overdue / completed audits |
| Audit Finding | Nonconformities (NC) and observations |
| Certificate | Issued certificates (submittable — R-C3 gate) |
| Auditor | Auditor register |
| Auditor Competence | Scheme/standard competence records |
| Surveillance Visit | Post-certification surveillance |

## Workflow (Certification Application)

Canonical Desk states:

`Application → Assessment → Audit Scheduled → Audit → NC Resolution → Certified → Surveillance → Renewal / Withdraw`

### Portal display mapping

API responses (`list_applications`, `get_application`, `create_application`, `advance_state`) expose **portal labels** via `workflow_map.DISPLAY_STATUS`:

| workflow_state | status (API / portals) |
|---|---|
| Application | Submitted |
| Assessment | **In Review** |
| Audit Scheduled | Audit Scheduled |
| Audit | Audit In Progress |
| NC Resolution | NC Resolution |
| Certified | Certified |
| Surveillance | Surveillance |
| Renewal | Renewal |
| Withdraw | Withdrawn |

`list_applications(status=…)` accepts either form (`In Review`, `Submitted`, or canonical names).

## Rules (R-C1…C7)

Implemented in `eswasa_certification.rules` + `hooks.py` `doc_events` / `scheduler_events`.

| ID | Trigger | Action |
|---|---|---|
| R-C1 | Application `on_submit` / Assessment entry | Stage-1 Audit (+14d), Cert Officer ToDo, feed |
| R-C2 | Audit `on_submit` outcome=NC / NC Finding | Findings, `certificate_blocked`, feed |
| **R-C3** | **Certificate `on_submit`** | **Sales Invoice + QR/token + Register Entry + Surveillance + feed APPROVED** |
| R-C4 | daily cron | Certificate expiry ≤42d → RENEWAL DUE |
| R-C5 | daily cron | Surveillance due ≤30d; overdue → SLA breach |
| R-C6 | daily cron | Assessment beyond scheme turnaround → SLA BREACH |
| R-C7 | daily cron + Audit validate | Competence expiry blocks auditor assignment |

**Dependency:** R-C3 Register Entry / Verification Token live in `eswasa_verification` (created via `frappe.get_doc` with try/except).

## Whitelisted API (`eswasa_certification.api`)

Called by Core BFF (`core/app/gateway/router.py`):

| Method | Contract shape | Notes |
|---|---|---|
| `list_overdue(auditor=None, scheme=None)` | `{ items: AuditSummary[] }` | Ask-box tool; preserves **AUD-2026-00001** smoke |
| `list_applications(status=None, limit=20)` | `{ items: CertificationApplication[] }` | Status aliases supported |
| `get_application(name)` | `CertificationApplication` | |
| `create_application(..., confirm=true)` | `CertificationApplication` | confirm-before-commit |
| `advance_state(name, action, comment=None, confirm=true)` | `CertificationApplication` | confirm-before-commit; Certificate submit on Certify (R-C3) |

## Demo seed vs A10 DemoSeed

`seed.ensure_demo_data()` is **demo-only and absorbable**:

- Tags docs with `demo-overdue-application` / `demo-overdue-audit` markers.
- Applications use **APP-.YYYY.-.#####** — does **not** create `CERT-2025-0041` (reserved for A10 narrative / Certificate).
- Prefers overdue audit name **AUD-2026-00001** for the live Core smoke path; will not overwrite that name if it exists without our marker.
- Disable local seeding so A10 can own data:

```bash
# site_config.json
"eswasa_certification_demo_seed": 0

# or env
ESWASA_CERT_DEMO_SEED=0
```

On install/migrate: scheme `ISO9001-QMS`, auditor `AUD-001`, one APP- application, one overdue Stage-1 audit (usually `AUD-2026-00001`).

## Print format

Fixture **Certificate of Conformity** (Jinja) on DocType `Certificate`. Includes verification token / QR payload after R-C3 submit.

## Install

```bash
# from frappe-bench (after WS1 bootstrap)
bench get-app /srv/projects/eswasaone/apps/eswasa_certification
bench --site <site> install-app eswasa_certification
```

## R-C3 smoke (acceptance gate)

```bash
cd engine/frappe-bench
bench --site eswasaone.localhost execute eswasa_certification.smoke_rc3.run
# expect JSON with "R-C3": "PASS"
```

## Smoke (no bench)

```bash
python3 -m unittest apps/eswasa_certification/tests/test_contract_shapes.py -v
```

With bench:

```bash
bench --site eswasaone.localhost run-tests --app eswasa_certification
```
