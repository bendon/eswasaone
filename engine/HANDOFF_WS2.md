# HANDOFF — Certify Slice (WS2) ready for install

**Status:** WS2 complete. Install when site exists.

```bash
cd /srv/projects/eswasaone/engine/frappe-bench
ln -sfn /srv/projects/eswasaone/apps/eswasa_certification apps/eswasa_certification
bench --site eswasaone.localhost install-app eswasa_certification
# or: bench --site eswasaone.localhost migrate
```

App provides: `list_overdue`, `create_application`, `advance_state` + seed overdue audit.
