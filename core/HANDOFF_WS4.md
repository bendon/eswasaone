# HANDOFF — CoreMind (WS4) live

Core is running: `http://127.0.0.1:8015`

```bash
cd /srv/projects/eswasaone/core && . .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8015
```

Portals pointed at live Core (`VITE_USE_MSW=false`). Still blocked on Atlas Engine Frappe `:8020` for real SID + DocType RPCs.

WS7 next: nginx + TLS for eswasaone.aiceafrica.com once Frappe is up (or partial public SPA+Core now).
