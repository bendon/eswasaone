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

## Smoke

```bash
cd core && . .venv/bin/activate && pytest -q
```
