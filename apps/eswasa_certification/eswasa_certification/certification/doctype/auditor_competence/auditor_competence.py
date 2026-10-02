# Copyright (c) 2026, ESWASA and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.model.document import Document
from frappe.utils import getdate


class AuditorCompetence(Document):
    def validate(self) -> None:
        if not self.auditor:
            frappe.throw("Auditor is required")
        if not self.competence_level:
            frappe.throw("Competence Level is required")
        if self.valid_from and self.valid_to:
            if getdate(self.valid_to) < getdate(self.valid_from):
                frappe.throw("Valid To cannot be before Valid From")
