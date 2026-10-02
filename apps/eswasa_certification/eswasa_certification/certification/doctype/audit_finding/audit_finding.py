# Copyright (c) 2026, ESWASA and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.model.document import Document
from frappe.utils import nowdate

from eswasa_certification.rules import rc2_on_finding_close, rc2_on_finding_insert


class AuditFinding(Document):
    def validate(self) -> None:
        if not self.audit:
            frappe.throw("Audit is required")
        if not self.description:
            frappe.throw("Description is required")
        if not self.application and self.audit:
            self.application = frappe.db.get_value("Audit", self.audit, "application")
        if self.status == "Closed" and not self.closed_on:
            self.closed_on = nowdate()

    def after_insert(self) -> None:
        rc2_on_finding_insert(self, "after_insert")

    def on_update(self) -> None:
        if self.has_value_changed("status") and self.status == "Closed":
            rc2_on_finding_close(self, "on_update")
