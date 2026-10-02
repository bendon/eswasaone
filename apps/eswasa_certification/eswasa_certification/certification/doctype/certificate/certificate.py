# Copyright (c) 2026, ESWASA and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.model.document import Document
from frappe.utils import getdate

from eswasa_certification.rules import application_has_open_nc, rc3_certificate_submitted


class Certificate(Document):
    def validate(self) -> None:
        if not self.certificate_number:
            frappe.throw("Certificate Number is required")
        if not self.application:
            frappe.throw("Application is required")
        if not self.issued_on or not self.valid_until:
            frappe.throw("Issued On and Valid Until are required")
        if getdate(self.valid_until) < getdate(self.issued_on):
            frappe.throw("Valid Until cannot be before Issued On")
        if not self.scheme and self.application:
            self.scheme = frappe.db.get_value(
                "Certification Application", self.application, "scheme"
            )
        if not self.holder_name and self.application:
            self.holder_name = frappe.db.get_value(
                "Certification Application", self.application, "applicant_name"
            )
        # R-C2: refuse new/draft certificates while NC open
        if int(self.docstatus or 0) < 1 and application_has_open_nc(self.application):
            frappe.throw(
                "Certificate blocked: application has open nonconformities (R-C2)."
            )

    def before_submit(self) -> None:
        if application_has_open_nc(self.application):
            frappe.throw(
                "Cannot submit Certificate while application has open NCs (R-C2).",
            )

    def on_submit(self) -> None:
        # R-C3 acceptance gate
        rc3_certificate_submitted(self, "on_submit")
