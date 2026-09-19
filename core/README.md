# EswasaOne Core (WS4)

FastAPI BFF on `127.0.0.1:8015`.

| Package | Role |
|---|---|
| `gateway/` | Composed BFF routes |
| `identity/` | SSO/session; RBAC delegated to Frappe |
| `agent/` | tool_registry, RAG, guardrails, `/api/agent/ask` |
| `events/` | Webhooks + `/ws/feed` |
| `adapters/` | MoMo / TBT / messaging — **WS6 fills** |
| `frappe_client.py` | Acts-as-user httpx client |

Contract: `contracts/openapi.yaml`. Mock Frappe until WS1–2 ready.
