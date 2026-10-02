# Admin Access Security (fragment)

Paths live in `contracts/types.ts` / `portals/shared-ui/src/types.ts` (full admin contract
is richer than the thin wave-1 `openapi.yaml` — do not regen types from yaml alone).

| Method | Path | Notes |
|---|---|---|
| GET/PUT | `/admin/access/policy` | System Manager; PUT requires `confirm` |
| GET/POST | `/admin/access/networks` | Trusted LAN/WAN CIDRs |
| DELETE | `/admin/access/networks/{id}?confirm=true` | |
| GET/POST | `/admin/access/devices` | Device allowlist |
| PATCH | `/admin/access/devices/{id}` | Approve / revoke |
| GET | `/admin/access/events` | Deny/allow audit trail |
| POST | `/admin/access/evaluate` | What-if test |
| GET | `/auth/institution-access` | Edge gate (200 allow / 403 deny) for future nginx `auth_request` |

Default: `enforce_off_lan=false` until CIDRs + devices are configured and nginx is wired.
