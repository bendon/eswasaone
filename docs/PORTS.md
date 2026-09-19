# EswasaOne — Port Allocation (block `15`)

All app listeners bind **`127.0.0.1` only**. Nginx proxies `eswasaone.aiceafrica.com`.

| Service | Port / resource | Notes |
|---|---|---|
| Service Portal | `3015` | Vite / React (public) |
| Institution Portal | `3016` | Vite / React (staff) |
| EswasaOne Core | `8015` | FastAPI BFF + `/ws/feed` |
| Ingest worker health | `8016` | Optional metrics |
| Frappe / ERPNext | `8020` | Gunicorn / bench serve |
| Frappe Socket.io | `9020` | Realtime |
| Redis DB index | `15` | Shared Redis instance |
| MariaDB database | `eswasaone` | Shared MariaDB `:3306` |
| Qdrant collections | `eswasaone_*` | Shared `/opt/qdrant` |

## Public URL map

| Path | Upstream |
|---|---|
| `/` | Service Portal `:3015` |
| `/institution/` | Institution Portal `:3016` |
| `/api/` | Core `:8015` |
| `/ws/` | Core `:8015` (WebSocket) |
| `/desk` (later) | Frappe `:8020` — admin only |

Shared platform defaults: see `/opt/platform/PORTS.md`.
