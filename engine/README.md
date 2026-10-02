# Engine (WS1) — Atlas

Native Frappe v16 + ERPNext v16 bench (no Docker).

```bash
# Host notes: PYTHON.md (Python 3.14, OS user frappe, Node 24+)
chmod +x bootstrap.sh
./bootstrap.sh   # re-execs as frappe if started as root
```

- Bench: `frappe-bench/` (gitignored)
- Site: `eswasaone.localhost` → `http://127.0.0.1:8020`
- Start: `cd frappe-bench && bench start` (as user `frappe`)
- Fixtures: `fixtures/` + `fixtures/run_in_site.py`
- Desk vs Institution Portal: `HANDOFF_DESK.md`
- Custom apps linked from `../apps/*` (WS2/WS3/WS8)

Admin password: `FRAPPE_ADMIN_PASSWORD` in `../.env` (never echo secrets).
