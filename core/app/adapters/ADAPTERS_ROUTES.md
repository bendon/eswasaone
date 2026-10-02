# Adapter HTTP routes — notes for Orchestrator (WS0/WS7)

WS6 owns helper modules only (`momo.py`, `tbt.py`, `messaging.py`). Route wiring
belongs to WS4 (`gateway` / `events`) and contract edits to Orchestrator.

## Already in `contracts/openapi.yaml`

| Method | Path | Helper |
|---|---|---|
| `POST` | `/adapters/momo/callback` | `app.adapters.momo.handle_callback` / `parse_callback` |

WS4 should accept arbitrary JSON, call `handle_callback(body)`, then publish to
the events bus (payment settled / failed).

## Suggested env additions for `.env.example` (Orchestrator)

```bash
# MoMo (existing) + optional overrides
# MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com
# MOMO_TARGET_ENVIRONMENT=sandbox
# MOMO_CURRENCY=SZL

# TBT handoff (optional; stub if empty)
# TBT_HANDOFF_URL=

# Messaging (console/log fallback if empty)
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASSWORD=
# SMTP_FROM=
# SMTP_USE_TLS=true
# SMS_API_URL=
# SMS_API_KEY=
# WHATSAPP_API_URL=
# WHATSAPP_TOKEN=
# WHATSAPP_FROM=
```

## Optional future routes (not in OpenAPI yet — do not invent locally)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/adapters/tbt/handoff` | Accept normalized TBT batch (internal / ingest → Core) |
| `POST` | `/adapters/messaging/test` | Ops-only smoke send (auth required) |

Add to OpenAPI first if/when needed; regenerate `types.ts`.
