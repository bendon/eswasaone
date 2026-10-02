# Copyright (c) 2026, ESWASA and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.model.document import Document


class SurveillanceVisit(Document):
    def validate(self) -> None:
        if not self.certificate:
            frappe.throw("Certificate is required")
        if not self.planned_date:
            frappe.throw("Planned Date is required")
        if not self.application:
            self.application = frappe.db.get_value(
                "Certificate", self.certificate, "application"
            )
        if not self.scheme:
            self.scheme = frappe.db.get_value("Certificate", self.certificate, "scheme")
        if self.status == "Completed" and not self.completed_date:
            from frappe.utils import nowdate

            self.completed_date = nowdate()
