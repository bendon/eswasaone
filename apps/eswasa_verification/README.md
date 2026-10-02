# eswasa_verification (WS3 / S11 EstoreVerify)

Public register + QR mark verification. Consumes Register Entry + Verification Token
created by certification **R-C3**.

**DocTypes:** Register Entry, Verification Token

## Whitelisted API (A4 / Core)

| Method | Notes |
|--------|--------|
| `eswasa_verification.api.verify_token` | `allow_guest`; OpenAPI `VerificationResult` / `/verify/{token}`; Register Entry + Verification Token lookup; graceful `not_found` |
| `eswasa_verification.api.lookup_register` | Staff Register Entry read |

Guests only receive **public** register entries (`is_public=1`). Missing / private / unknown tokens return `valid: false` with `details.reason: not_found`. Uses `db.get_value` so Desk permissions do not block the public path.

## Smoke

```bash
bench --site eswasaone.localhost execute eswasa_verification.smoke_verify.run
```
