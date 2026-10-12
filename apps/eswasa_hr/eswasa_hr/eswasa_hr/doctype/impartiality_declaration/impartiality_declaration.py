# Copyright (c) 2026, ESWASA and contributors
# License: MIT

from frappe.model.document import Document

from eswasa_hr import declarations


class ImpartialityDeclaration(Document):
    def validate(self) -> None:
        declarations.validate(self)

    def before_submit(self) -> None:
        declarations.before_submit(self)

    def on_submit(self) -> None:
        declarations.on_submit(self)
