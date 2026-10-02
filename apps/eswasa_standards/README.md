# eswasa_standards (WS3 / A6 RegLive · S6 StandardsRules)

Standards development + Technical Committees.

**DocTypes:** Standard, Technical Committee, TC Member (child), Work Item, Draft, Public Comment, Ballot, Gazette Notice

**Workflow:** New Work Item → Working Draft → Committee Draft → Public Review → Ballot → Published/Gazetted

**Roles:** Eswasa Standards Manager · Eswasa Standards Officer · Eswasa TC Member

## Business rules (R-S1…S4)

| Rule | Trigger | Effects |
|------|---------|---------|
| R-S1 | Work Item → `Public Review` | 60d comment window; Service Portal feed; email TC + subscribers |
| R-S2 | Daily cron | ≤7d closing reminder; on close → compile comments + open Ballot |
| R-S3 | Ballot `Approved` / Work Item → `Published/Gazetted` / `api.publish_standard` | Gazette Notice; catalogue Standard; Standard Product (+ Website Item if present); PUBLISHED feed |
| R-S4 | Standard.`supersedes` set | Prior → Superseded; notify cert holders (scheme.standard_ref) |

## Whitelisted API (A4 / Core)

| Method | Notes |
|--------|--------|
| `eswasa_standards.api.list_standards` | OpenAPI `StandardSummary[]` / `/standards` — `q`, `sector` filters |
| `eswasa_standards.api.get_standard` | Single summary by code |
| `eswasa_standards.api.publish_standard` | OpenAPI `/standards/publish` — `{standard, confirm}` → R-S3 gate |

Returns catalogue fields only (`code`, `title`, `sector`, `status`, `buy_url`). Never emits licensed full standard text — purchasers are routed via `buy_url` to the e-store.

## Smoke

```bash
bench --site eswasaone.localhost execute eswasa_standards.smoke_rs3.run
```
