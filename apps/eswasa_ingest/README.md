# eswasa_ingest (WS8 / S8)

Source registry, corpus metadata, curation queue. Rights flag: `open` / `public` / `licensed`.

## DocTypes

| DocType | Purpose |
|---|---|
| **Source** | Registry of ingest sources (api/feed/web/document) |
| **Ingested Document** | Corpus metadata + object-store pointer |
| **Market Requirement** | Curated applicability / Export guidance |
| **Requirement Link** | Links requirements ↔ documents |
| **Curation Task** | Review queue |

## Rule R-T3

| Trigger | Actions |
|---------|---------|
| Ingested Document status = Pending Review (needs-review) | Create **Curation Task**; assign Ingest Curator / Info Officer pool; **not authoritative** until Approved (blocks public citations in `check_applicability`) |

## Whitelisted API

- `eswasa_ingest.api.check_applicability` → OpenAPI `ApplicabilityResult` (**Approved only**)
- `eswasa_ingest.api.list_curation_queue` → curation review queue

**Roles:** Ingest Curator / Viewer

Pairs with `ingest/` worker (ePing/TBT E2E). Licensed full text is never returned in free answers — paraphrase-and-cite + e-store buy links.

Smoke: `bench --site eswasaone.localhost execute eswasa_ingest.smoke_rt3.run`
