# Copyright (c) 2026, ESWASA and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today

from eswasa_certification.rules import rc2_audit_nc, validate_auditor_assignment


class Audit(Document):
    def validate(self) -> None:
        if not self.application:
            frappe.throw("Application is required")
        if not self.due_date:
            frappe.throw("Due Date is required")
        if not self.scheme and self.application:
            self.scheme = frappe.db.get_value(
                "Certification Application", self.application, "scheme"
            )
        # R-C7: competence gate on assignment
        validate_auditor_assignment(self)
        # Auto-flag overdue on save
        if (
            self.status in ("Planned", "In Progress", "Overdue")
            and self.due_date
            and getdate(self.due_date) < getdate(today())
        ):
            self.status = "Overdue"

    def on_submit(self) -> None:
        if self.status != "Completed":
            self.db_set("status", "Completed", update_modified=False)
            self.status = "Completed"
        # R-C2
        rc2_audit_nc(self, "on_submit")
