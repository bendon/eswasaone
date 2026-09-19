# EswasaOne

National Standards Authority platform for ESWASA — branded **EswasaOne**.

> Feed this file + `AGENTS.md` to Cursor agents. Architecture, stack, modules, and multi-agent routing live here. Host constraints for this server override the original Docker-centric playbook.

## What we are building

- **Use ERPNext (v16)** for finance, procurement, HR, CRM, LMS, helpdesk, website/e-store base, analytics.
- **Custom Frappe apps** only for regulatory IP (certification, metrology/LIMS, standards, verification, TBT, governance, ingest).
- **EswasaOne Core** (FastAPI BFF) — the only tier frontends talk to.
- **Two SPAs**: Service Portal (public/business) + Institution Portal (staff). Frappe Desk = admin/power-config only.

**Non-negotiables:** every action resolves against Frappe permissions; writes are audit-logged and confirm-before-commit.

## Host model (this server)

| Rule | Detail |
|---|---|
| No Docker | Native processes; shared MariaDB / Redis / Qdrant / Node |
| Ports | Block `15` — see [`docs/PORTS.md`](docs/PORTS.md) |
| Public URL | `https://eswasaone.aiceafrica.com` |
| Nginx | Draft at [`docs/nginx/eswasaone.aiceafrica.com.conf`](docs/nginx/eswasaone.aiceafrica.com.conf) |

```
/          → Service Portal :3015
/institution/ → Institution Portal :3016
/api/  /ws/ → Core :8015
```

## Architecture

```
FRONTEND (SPAs)  →  ESWASAONE CORE (FastAPI)  →  ENGINE (Frappe bench + ERPNext + custom apps)
```

## Repository layout

```
eswasaone/
├── README.md
├── AGENTS.md
├── .env.example
├── contracts/openapi.yaml    # SOURCE OF TRUTH
├── contracts/types.ts        # generated — do not hand-edit
├── engine/                   # WS1 — native bench bootstrap
├── apps/                     # custom Frappe apps (WS2, WS3, WS8)
├── core/                     # WS4 (+ WS6 adapters/)
├── ingest/                   # WS8 worker
├── portals/                  # WS5
└── docs/                     # PORTS, nginx, mocks/
```

## Contract

```bash
chmod +x scripts/codegen-types.sh
./scripts/codegen-types.sh
```

## Multi-agent waves

1. **WS0** (done when this scaffold lands) — monorepo, contract, ports, skeletons.
2. **You** — drop mock UIs into `docs/mocks/`.
3. **Wave 1 parallel** — WS1 Engine, WS4 Core, WS5 shells, WS8 ingest.
4. **Wave 2** — WS2 Certification, WS3 skeletons, WS6 adapters.
5. **WS7** — nginx/TLS, live wiring, smoke on public host.

See `AGENTS.md` for ground rules. Agent briefs: ask Orchestrator or see conversation plan.

## Mock UIs

Place `eswasaone-citizen-portal.html` and `eswasaone-admin-portal.html` in `docs/mocks/` before WS5 visual port.

## Status

`WS0: scaffold+contract+ports | blocked-on: mock UIs + Wave1 agents | stub-left: all modules`
