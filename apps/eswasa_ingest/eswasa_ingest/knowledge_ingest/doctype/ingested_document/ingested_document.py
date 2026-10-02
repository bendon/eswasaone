"""Ingested Document DocType controller — R-T3 curation gate."""

from frappe.model.document import Document

from eswasa_ingest.rules import (
    rt3_needs_review,
    rt3_on_status_change,
    validate_authoritative_gate,
)


class IngestedDocument(Document):
    def validate(self):
        validate_authoritative_gate(self, "validate")

    def after_insert(self):
        rt3_needs_review(self, "after_insert")

    def on_update(self):
        rt3_on_status_change(self, "on_update")
