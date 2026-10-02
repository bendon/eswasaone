# Copyright (c) 2026, ESWASA and contributors
# License: MIT

from __future__ import annotations

from frappe.model.document import Document

from eswasa_metrology.rules import (
    rm2_result_approved,
    rm4_after_insert,
    rm4_before_submit,
    rm4_out_of_tolerance,
)


class Result(Document):
    def validate(self) -> None:
        # R-M4: flag OOT + notify (draft OK); block if reviewed without sign-off
        rm4_out_of_tolerance(self, "validate")

    def after_insert(self) -> None:
        rm4_after_insert(self, "after_insert")

    def before_submit(self) -> None:
        rm4_before_submit(self, "before_submit")

    def on_update_after_submit(self) -> None:
        # R-M2: reviewed after submit → certificate + invoice + dispatch
        rm2_result_approved(self, "on_update_after_submit")
