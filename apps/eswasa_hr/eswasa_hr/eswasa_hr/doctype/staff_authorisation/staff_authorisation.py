# Copyright (c) 2026, ESWASA and contributors
# License: MIT

from __future__ import annotations

import frappe
from frappe.model.document import Document
from frappe.utils import add_months, date_diff, getdate, today


class StaffAuthorisation(Document):
    def validate(self) -> None:
        validate(self)

    def before_submit(self) -> None:
        if not self.approved_by:
            frappe.throw("Approved By is required before submit.")
        if self.approved_by == self.employee:
            frappe.throw("The person being authorised cannot approve their own authorisation.")
        self._recompute_status()

    def on_update_after_submit(self) -> None:
        self._recompute_status()

    def _recompute_status(self) -> None:
        if self.status == "Withdrawn":
            return
        end = getdate(self.valid_to) if self.valid_to else None
        if not end:
            self.status = "Current"
            return
        today_d = getdate(today())
        if end < today_d:
            self.status = "Expired"
        elif date_diff(end, today_d) <= 60:
            self.status = "Expiring"
        else:
            self.status = "Current"


def validate(doc: StaffAuthorisation | Document, method: str | None = None) -> None:
    if not doc.valid_from:
        return
    if not doc.valid_to and doc.skill:
        months = frappe.db.get_value("Skill", doc.skill, "custom_validity_months")
        if months:
            doc.valid_to = add_months(getdate(doc.valid_from), int(months))
    if doc.approved_by and doc.approved_by == doc.employee:
        frappe.throw("Approved By must differ from the employee (four-eyes).")
