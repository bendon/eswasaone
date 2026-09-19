# Engine (WS1)

Native Frappe v16 + ERPNext v16 bench (no Docker).

```bash
cp ../.env.example ../.env   # edit secrets
chmod +x bootstrap.sh
./bootstrap.sh
```

- `apps.txt` — apps to install / link
- `fixtures/` — roles, workflows, print formats, custom fields (WS1)
- Bench lives in `frappe-bench/` (gitignored)

Expose REST on `127.0.0.1:8020` for Core.
