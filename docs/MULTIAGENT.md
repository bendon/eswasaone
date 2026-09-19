# Multi-agent execution plan (host-adapted)

## Waves

| Wave | Agents | Notes |
|---|---|---|
| 0 | WS0 Orchestrator | Scaffold — **complete when committed** |
| Gate | Human | Drop mock UIs into `docs/mocks/` |
| 1 | WS1, WS4, WS5-A, WS8 | Parallel after WS0 |
| 2 | WS2, WS3, WS6 | After WS1 base / WS4 skeleton |
| 3 | WS7 | Integrate, nginx+TLS, smoke |

## Ownership

| Agent | Owns |
|---|---|
| WS0/WS7 | Root, `contracts/`, `.env.example`, nginx drafts, `apps.txt` |
| WS1 | `engine/` |
| WS2 | `apps/eswasa_certification/` |
| WS3 | six apps: standards, metrology, estore, verification, tbt, governance |
| WS4 | `core/` (stub adapters) |
| WS5 | `portals/` |
| WS6 | `core/app/adapters/` only |
| WS8 | `apps/eswasa_ingest/` + `ingest/` |

## Public host

`eswasaone.aiceafrica.com` → see `docs/PORTS.md` and `docs/nginx/`.
