# Copyright (c) 2026, ESWASA and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.model.document import Document


class CertificationScheme(Document):
    def validate(self) -> None:
        if not self.scheme_code:
            frappe.throw("Scheme Code is required")
        self.scheme_code = self.scheme_code.strip().upper()
        if self.surveillance_interval_months is not None and self.surveillance_interval_months < 1:
            frappe.throw("Surveillance Interval must be at least 1 month")
        if self.certificate_validity_months is not None and self.certificate_validity_months < 1:
            frappe.throw("Certificate Validity must be at least 1 month")
