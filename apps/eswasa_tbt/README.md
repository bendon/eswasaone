# eswasa_tbt (WS3 / A6 RegLive / S8)

WTO/TBT alerts.

**DocTypes:** TBT Notification, Sector Tag, Subscription

**Workflow:** Ingested → Tagged → Notified

## Rules (R-T1…R-T2)

| Rule | Trigger | Actions |
|------|---------|---------|
| **R-T1** | TBT Notification insert/update | Classify sector/HS/jurisdiction → match Subscriptions → email + `eswasa_feed` → Draft Market Requirement (Export guidance) → workflow Notified |
| **R-T2** | Impact = high | Staff ToDos (TBT Officer/Analyst) + affected certified companies → feed, email, WhatsApp stub |

Implemented in `eswasa_tbt.rules` + `hooks.py` `doc_events`.

## Whitelisted API (A4 / Core)

| Method | Notes |
|--------|--------|
| `eswasa_tbt.api.list_notifications` | OpenAPI `/tbt/alerts` — `items` + `new_count`; params `unread_only`, `limit`, optional `sector` |
| `eswasa_tbt.api.list_subscriptions` | Active Subscription rows for the caller |

**Roles:** Eswasa TBT Officer / Analyst

Demo seed inserts ~4 notifications (incl. `G/TBT/N/EU/891`), sector tags, and subscriber demos.

Smoke: `bench --site eswasaone.localhost execute eswasa_tbt.smoke_rt.run`
