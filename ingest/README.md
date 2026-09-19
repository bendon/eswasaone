# Ingest worker (WS8)

Connectors → processing → enrich → storage → curation gate.

Ship **ePing/TBT** end-to-end first. Writes: raw → object store, metadata → Frappe (`eswasa_ingest`), chunks → Qdrant `eswasaone_*`.

Optional health port: `8016`.
