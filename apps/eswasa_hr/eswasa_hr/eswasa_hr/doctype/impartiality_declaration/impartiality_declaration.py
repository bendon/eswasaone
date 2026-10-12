# Copyright (c) 2026, ESWASA and contributors
# License: MIT

from frappe.model.document import Document

from eswasa_hr import declarations, external


class ImpartialityDeclaration(Document):
    def autoname(self) -> None:
        # IMP-{employee}-{year}, or IMP-{external person}-{year} (plan 07 step 7)
        self.name = declarations._doc_name(self.employee or self.external_person, int(self.year))

    def validate(self) -> None:
        external.validate_person(self)
        declarations.validate(self)

    def before_submit(self) -> None:
        declarations.before_submit(self)

    def on_submit(self) -> None:
        declarations.on_submit(self)
