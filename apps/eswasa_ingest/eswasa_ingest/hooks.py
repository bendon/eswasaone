app_name = "eswasa_ingest"
app_title = "Eswasa Ingest"
app_publisher = "ESWASA"
app_description = "Source registry, corpus metadata, and curation queue for EswasaOne"
app_email = "ict@eswasa.org.sz"
app_license = "mit"
app_version = "0.0.1"

fixtures = [
    {
        "dt": "Role",
        "filters": [
            [
                "name",
                "in",
                [
                    "Ingest Curator",
                    "Ingest Viewer",
                ],
            ]
        ],
    },
]

# R-T3 curation gate (controller also implements after_insert / on_update)
doc_events = {
    "Ingested Document": {
        "validate": "eswasa_ingest.rules.validate_authoritative_gate",
        "after_insert": "eswasa_ingest.rules.rt3_needs_review",
        "on_update": "eswasa_ingest.rules.rt3_on_status_change",
    },
}
