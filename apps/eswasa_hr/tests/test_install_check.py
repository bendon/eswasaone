"""Install check (plan 10 step 6) — pure, no Frappe."""

from __future__ import annotations

import types
import unittest

from eswasa_hr import hooks, install_check as ic


class InstallCheckTests(unittest.TestCase):
    def test_fixture_names_come_from_the_name_in_filters(self):
        names = ic.fixture_names([
            {"dt": "Role", "filters": [["name", "in", ["A", "B"]]]},
            {"dt": "Custom Field", "filters": [["name", "in", ["X-y"]], ["module", "=", "HR"]]},
            {"dt": "Workflow"},
            "Print Format",
        ])
        self.assertEqual(names["Role"], ["A", "B"])
        self.assertEqual(names["Custom Field"], ["X-y"])
        self.assertEqual(names["Print Format"], [])

    def test_layout_fields_are_ignored(self):
        doc = {"fields": [{"fieldname": "a", "fieldtype": "Data"}, {"fieldname": "s1", "fieldtype": "Section Break"},
                          {"fieldname": "b", "fieldtype": "Select"}]}
        self.assertEqual(ic.doctype_fields(doc), ["a", "b"])

    def test_patch_lines_skip_headers_and_comments(self):
        self.assertEqual(ic.patch_lines("[pre_model_sync]\n\n# x\n[post_model_sync]\na.b.c\n"), ["a.b.c"])

    def test_scheduler_methods_flatten_cron(self):
        ev = {"daily": ["m.a"], "cron": {"0 2 * * *": ["m.b", "m.a"]}}
        self.assertEqual(ic.scheduler_methods(ev), ["m.a", "m.b"])

    def test_compare_lists_only_what_is_missing(self):
        want = {"doctypes": {"HR Alert": ["key", "rule"], "HR Import Run": ["status"]}, "custom_fields": ["U-x"],
                "property_setters": [], "roles": ["R"], "print_formats": [], "scheduler": ["m"], "patches": ["p"]}
        have = {"doctypes": {"HR Alert": ["key"]}, "custom_fields": ["U-x"], "roles": [], "scheduler": ["m"], "patches": ["p"]}
        self.assertEqual(ic.compare(want, have), {"doctypes": ["HR Import Run"], "fields": {"HR Alert": ["rule"]}, "roles": ["R"]})
        self.assertEqual(ic.compare(want, {**have, "doctypes": {"HR Alert": ["key", "rule"], "HR Import Run": ["status"]},
                                           "roles": ["R"]}), {})

    def test_expected_reads_the_real_app(self):
        want = ic.expected(hooks, ic.app_doctypes(), ic.PATCHES.read_text())
        for dt in ("HR Alert", "Module Access Request", "HR Notification", "External Person", "HR Evidence Pack", "HR Import Run"):
            self.assertIn(dt, want["doctypes"])
        self.assertIn("rule", want["doctypes"]["HR Alert"])
        self.assertIn("Training Event-custom_skill", want["custom_fields"])
        self.assertIn("Eswasa Executive Director", want["roles"])
        self.assertIn("Certificate of Service", want["print_formats"])
        self.assertEqual(want["scheduler"], ["eswasa_hr.tasks.daily"])
        self.assertIn("eswasa_hr.patches.v1.requisition_stage", want["patches"])

    def test_expected_tolerates_missing_hooks(self):
        want = ic.expected(types.SimpleNamespace(), {}, "")
        self.assertEqual(want["custom_fields"], [])
        self.assertEqual(want["scheduler"], [])


if __name__ == "__main__":
    unittest.main()
