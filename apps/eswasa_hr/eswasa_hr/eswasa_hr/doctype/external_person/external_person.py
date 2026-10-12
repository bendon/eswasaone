# Copyright (c) 2026, ESWASA and contributors
# License: MIT

import frappe
from frappe.model.document import Document

from eswasa_hr import external


class ExternalPerson(Document):
    def validate(self) -> None:
        if self.is_new() and not external.enabled():
            frappe.throw(external.DISABLED, frappe.ValidationError)
        errors = external.create_errors(self.as_dict())
        if errors:
            frappe.throw(" ".join(errors), frappe.ValidationError)
