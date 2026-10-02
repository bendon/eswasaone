# HANDOFF — KnowledgeIngest (WS8) ready

## Install Frappe app
```bash
cd /srv/projects/eswasaone/engine/frappe-bench
ln -sfn /srv/projects/eswasaone/apps/eswasa_ingest apps/eswasa_ingest
bench --site eswasaone.localhost install-app eswasa_ingest
```

## Core RAG / applicability
- Qdrant collection: **`eswasaone_tbt_notifications`** (10 points from ePing/TBT)
- Frappe method (when installed): `eswasa_ingest.api.check_applicability`
- Object store: `/var/lib/eswasaone/ingest`
- Optional health: `127.0.0.1:8016`

Point Core RAG stub at `eswasaone_*` collections; enforce paraphrase-and-cite for licensed sources.
