# HANDOFF — KnowledgeIngest (WS8) corpus ready

- Qdrant: collection **`eswasaone_tbt_notifications`** (prefix `eswasaone_`)
- Applicability: prefer `eswasa_ingest.api.check_applicability` when Frappe up; else RAG over Qdrant + OpenAPI `ApplicabilityResult` shape
- Guardrails: rights flag — paraphrase-and-cite licensed; quote-ok for open (TBT/ePing)

Wire `/api/ingest/applicability` and agent `check_applicability` tool to this corpus.
