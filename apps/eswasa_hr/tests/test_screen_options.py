"""Choices the HR screens read from the backend (screen ↔ backend sweep): expense form, correction fields,
Add person genders, document types. Nothing is hard-coded in the portal and nothing is invented here."""

from __future__ import annotations

import unittest

from eswasa_hr import documents, employees, expenses as ex, profile_changes as pc
from tests import _fakefrappe


class PureTests(unittest.TestCase):
    def test_expense_options_list_types_and_threshold(self):
        self.assertEqual(ex.options_view(["Travel", "Meals"], 200.0), {"types": ["Meals", "Travel"], "receipt_required_above": 200.0, "awaiting": None})

    def test_no_expense_types_is_an_empty_list_not_a_wait(self):
        out = ex.options_view([], None)
        self.assertEqual(out["types"], [])
        self.assertIsNone(out["awaiting"])
        self.assertIsNone(out["receipt_required_above"])

    def test_correction_fields_are_the_allowed_ones_and_names_need_evidence(self):
        opts = {o["field"]: o for o in pc.field_options()}
        self.assertEqual(set(opts), set(pc.ALLOWED))
        self.assertTrue(opts["last_name"]["evidence_required"])
        self.assertFalse(opts["cell_number"]["evidence_required"])
        self.assertNotIn("department", opts)  # job fields never by request


class GlueTests(unittest.TestCase):
    def tearDown(self):
        _fakefrappe.uninstall()

    def test_expense_options_read_types_and_settings(self):
        f = _fakefrappe.install({"Expense Claim Type": [{"name": "Travel"}, {"name": "Accommodation"}]}, doctypes=("Expense Claim Type",))
        f.db.get_single_value = lambda dt, field: 500
        self.assertEqual(ex.options_impl(), {"types": ["Accommodation", "Travel"], "receipt_required_above": 500.0, "awaiting": None})

    def test_expense_options_without_the_doctype(self):
        f = _fakefrappe.install({})
        f.db.get_single_value = lambda dt, field: None
        self.assertEqual(ex.options_impl()["types"], [])

    def test_genders_come_from_hrms(self):
        _fakefrappe.install({"Gender": [{"name": "Female"}, {"name": "Male"}, {"name": "Prefer not to say"}]}, doctypes=("Gender",))
        self.assertEqual(employees.form_options_impl(), {"genders": ["Female", "Male", "Prefer not to say"]})

    def test_no_gender_doctype_gives_an_empty_list(self):
        _fakefrappe.install({})
        self.assertEqual(employees.form_options_impl(), {"genders": []})

    def test_document_rows_carry_the_types(self):
        _fakefrappe.install({"Employee": [{"name": "E1", "employee_name": "Thandi", "employment_type": "Permanent"}]})
        orig = (documents.required_for, documents._rows)
        documents.required_for = lambda t: []
        documents._rows = lambda e: []
        try:
            out = documents.rows_for("E1", True)
        finally:
            documents.required_for, documents._rows = orig
        self.assertEqual(out["types"], list(documents.TYPES))
        self.assertFalse(out["required_set"])


if __name__ == "__main__":
    unittest.main()
