# EswasaOne Core (WS4)

FastAPI BFF on `127.0.0.1:8015`.

## Start

```bash
cd /srv/projects/eswasaone/core
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --host 127.0.0.1 --port 8015
```

Loads `/srv/projects/eswasaone/.env` (Redis, Qdrant, Frappe, MoMo).

## Package map

| Package | Role |
|---|---|
| `gateway/` | Composed BFF routes |
| `identity/` | SSO/session; RBAC delegated to Frappe |
| `agent/` | tool_registry, RAG (`eswasaone_tbt_notifications`), guardrails, `/api/agent/ask` |
| `events/` | MoMo callback + webhooks + R-A2 SLA sweep + `/ws/feed` |
| `adapters/` | MoMo / TBT / messaging — **WS6** |
| `frappe_client.py` | Acts-as-user httpx client |

Contract: `contracts/openapi.yaml`. Mock Frappe until engine is up.

## R-A2 SLA sweep + feed

Overdue approvals (`sla_breached` from `eswasa_governance.api.list_approvals`)
are escalated to the next fixture role (ToDo `role` + Comment marker) and
published on **`WS /ws/feed`** as OpenAPI `FeedItem` events (`type: sla.escalated`).

Email/SMS go through `adapters/messaging` (console stub when SMTP/SMS unset).

### Cron (host crontab / systemd timer)

```bash
# Staff session required (permissions always). Example with prior login cookie/Bearer:
curl -sS -X POST http://127.0.0.1:8015/api/events/sla/sweep \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true, "limit": 50}'

# Preview without writes:
curl -sS -X POST http://127.0.0.1:8015/api/events/sla/sweep \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

Suggested schedule: every 15–60 minutes. Path is Core-internal until Orchestrator
adds it to `contracts/openapi.yaml`.

### HR notification outbox (plan 04)

HR queues plain-language email/SMS in Frappe (`HR Notification`); Core sends them through
`adapters/messaging` (console fallback when SMTP/SMS is unset) and marks each Sent, Failed or Skipped.
HR escalations themselves run in Frappe (`eswasa_hr.tasks.daily`) to named users; the generic SLA sweep
skips HR.

```bash
# Host cron, no login: set HR_NOTIFY_CRON_TOKEN and FRAPPE_SERVICE_API_KEY/SECRET (a System Manager user) in .env
curl -sS -X POST http://127.0.0.1:8015/api/events/hr-notify \
  -H "X-Cron-Token: $HR_NOTIFY_CRON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true, "limit": 50}'
```

Or call it as a logged-in System Manager with `Authorization: Bearer $TOKEN`. Suggested schedule: every 5–15 minutes.

## Smoke

```bash
cd core && . .venv/bin/activate && pytest -q
```
