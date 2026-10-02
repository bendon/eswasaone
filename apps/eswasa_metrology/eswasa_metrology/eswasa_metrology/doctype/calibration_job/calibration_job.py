# Copyright (c) 2026, ESWASA and contributors
# License: MIT

from __future__ import annotations

import frappe
from frappe.model.document import Document

from eswasa_metrology.rules import (
    rm1_job_received,
    rm1_on_job_update,
    rm2_on_job_reviewed,
    validate_instrument_not_blocked,
)


class CalibrationJob(Document):
    def validate(self) -> None:
        validate_instrument_not_blocked(self, "validate")

    def on_submit(self) -> None:
        # R-M1: Received → assign Metrologist, TAT due, draft invoice
        rm1_job_received(self, "on_submit")

    def on_update(self) -> None:
        rm1_on_job_update(self, "on_update")
        rm2_on_job_reviewed(self, "on_update")
