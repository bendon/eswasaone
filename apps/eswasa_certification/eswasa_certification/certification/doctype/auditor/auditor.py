# Copyright (c) 2026, ESWASA and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.model.document import Document


class Auditor(Document):
    def validate(self) -> None:
        if not self.auditor_code:
            frappe.throw("Auditor Code is required")
        if not self.auditor_name:
            frappe.throw("Auditor Name is required")
        self.auditor_code = self.auditor_code.strip().upper()
        if self.email and "@" not in self.email:
            frappe.throw("Email must be a valid email address")
