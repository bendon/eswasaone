# Copyright (c) 2026, ESWASA and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.model.document import Document

from eswasa_certification.rules import rc1_application_submitted, rc1_on_application_update
from eswasa_certification.workflow_map import STATES


class CertificationApplication(Document):
    def validate(self) -> None:
        if not self.scheme:
            frappe.throw("Scheme is required")
        if not self.applicant_name:
            frappe.throw("Applicant Name is required")
        if self.contact_email and "@" not in self.contact_email:
            frappe.throw("Contact Email must be a valid email address")
        if not self.workflow_state:
            self.workflow_state = "Application"
        if self.workflow_state not in STATES:
            frappe.throw(f"Invalid workflow state: {self.workflow_state}")
        if not frappe.db.exists("Certification Scheme", self.scheme):
            frappe.throw(f"Unknown scheme: {self.scheme}")

    def on_submit(self) -> None:
        # R-C1: Stage-1 audit, assign, queue, notify
        if self.workflow_state == "Application":
            self.db_set("workflow_state", "Assessment", update_modified=False)
            self.workflow_state = "Assessment"
        rc1_application_submitted(self, "on_submit")

    def on_update(self) -> None:
        rc1_on_application_update(self, "on_update")
