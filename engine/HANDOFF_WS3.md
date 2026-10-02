# HANDOFF — RegApps Skeleton (WS3) ready for install

**Status:** WS3 complete. Six apps under `/srv/projects/eswasaone/apps/`.

```bash
cd /srv/projects/eswasaone/engine/frappe-bench
for app in eswasa_standards eswasa_metrology eswasa_estore eswasa_verification eswasa_tbt eswasa_governance; do
  ln -sfn "/srv/projects/eswasaone/apps/$app" "apps/$app"
  bench --site eswasaone.localhost install-app "$app" || true
done
```

Also install `eswasa_certification` (WS2) and later `eswasa_ingest` (WS8) the same way.

Install order tip: `eswasa_estore` declares `required_apps: erpnext` — install ERPNext first.
