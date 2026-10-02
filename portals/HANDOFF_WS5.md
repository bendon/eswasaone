# HANDOFF — PortalCraft (WS5) running

Portals are up (MSW until Core live):

| Portal | URL |
|---|---|
| Service | http://127.0.0.1:3015 |
| Institution | http://127.0.0.1:3016 |

When Core listens on `:8015`, set `VITE_API_BASE=http://127.0.0.1:8015/api` and disable MSW (or `VITE_USE_MSW=false` if supported). Wire `/ws/feed` next.

Public path (WS7 nginx): `/` → 3015, `/institution/` → 3016, `/api/` → 8015.
