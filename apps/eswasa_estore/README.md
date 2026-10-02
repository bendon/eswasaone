# eswasa_estore (WS3 / S11 EstoreVerify)

Licensed standards sales — extends ERPNext Item/Website model (`required_apps`: erpnext).

**DocTypes:** Standard Product, License Entitlement, Download Token, Estore Order

## Whitelisted API (A4 / Core)

| Method | Notes |
|--------|--------|
| `eswasa_estore.api.list_products` | Thin catalogue from Standard Product (published only); no licensed body text |
| `eswasa_estore.api.checkout` | Confirm-before-commit → Estore Order; MoMo pending or invoice→R-E1 |
| `eswasa_estore.api.momo_callback` | R-E2 success / R-E3 fail-timeout; Payment Entry + fulfil |
| `eswasa_estore.api.download` | Redeem Download Token — watermark metadata; no licensed full text |
| `eswasa_estore.api.retry_payment` | R-E3 helper — new MoMo ref + notify |

## Rules (hooks + callback)

| Rule | Trigger | Action |
|------|---------|--------|
| **R-E1** | Order paid / fulfilment | License Entitlement + watermarked Download Token; email link |
| **R-E2** | MoMo SUCCESSFUL / Payment Entry submit | Payment Entry; mark Estore Order Paid; fire R-E1 (or cert/enrolment stub) |
| **R-E3** | MoMo FAILED / TIMEOUT | Notify (email stub); offer `retry_url` |

Email uses logger stub when SMTP / Email Account missing — `# TODO: wire real`.

## Smoke

```bash
bench --site eswasaone.localhost execute eswasa_estore.smoke_re.run
```
