"""HR Settings rules (eswasa_hr.settings) and the seeded records' read side (eswasa_hr.seed_records)."""

import sys
import unittest

from tests import _fakefrappe

from eswasa_hr import seed_records, settings


class SettingsTests(unittest.TestCase):
    def tearDown(self):
        _fakefrappe.uninstall()

    def test_fallbacks_without_frappe(self):
        sys.modules.pop("frappe", None)
        self.assertEqual(settings.get("leave_sla_days"), 2)
        self.assertEqual(settings.get("expiry_alert_days"), (60, 30, 7))
        self.assertEqual(settings.get("hr_email"), "info@swasa.co.sz")

    def test_hr_settings_win_and_lists_are_parsed(self):
        f = _fakefrappe.install({})
        values = {"custom_leave_sla_days": "4", "custom_expiry_alert_days": "14, 90,30", "custom_contract_notice_days": None}
        f.db.get_single_value = lambda dt, field: values.get(field)
        self.assertEqual(settings.get("leave_sla_days"), 4)
        self.assertEqual(settings.get("expiry_alert_days"), (90, 30, 14))
        self.assertEqual(settings.get("contract_notice_days"), 60)  # blank keeps the fallback

    def test_public_lists_every_rule(self):
        f = _fakefrappe.install({})
        f.db.get_single_value = lambda dt, field: None
        out = settings.public()
        self.assertTrue(set(settings.FIELDS) <= set(out))
        self.assertEqual(out["expiry_alert_days"], [60, 30, 7])
        self.assertEqual(out["working_week"], [1, 2, 3, 4, 5])

    def test_live_leaves_out_demo_records_when_the_field_exists(self):
        from types import SimpleNamespace

        f = _fakefrappe.install({})
        f.get_meta = lambda dt: SimpleNamespace(has_field=lambda fn: fn == "custom_is_demo")
        self.assertEqual(settings.live({"status": "Active"}), {"status": "Active", "custom_is_demo": ["!=", 1]})
        f.get_meta = lambda dt: SimpleNamespace(has_field=lambda fn: False)
        self.assertEqual(settings.live({"status": "Active"}), {"status": "Active"})


class TemplateTests(unittest.TestCase):
    def tearDown(self):
        _fakefrappe.uninstall()

    def test_best_matching_template_and_owner_kinds(self):
        store = {
            "Employee Onboarding Template": [
                {"name": "ALL", "department": None, "designation": None, "employee_grade": None},
                {"name": "MET", "department": "Metrology", "designation": None, "employee_grade": None},
                {"name": "FIN", "department": "Finance", "designation": None, "employee_grade": None},
            ],
            "Employee Boarding Activity": [
                {"parent": "ALL", "parenttype": "Employee Onboarding Template", "activity_name": "Contract", "custom_owner": "HR", "custom_team": "HR", "idx": 1},
                {"parent": "MET", "parenttype": "Employee Onboarding Template", "activity_name": "Lab safety", "custom_owner": "Line manager", "custom_team": "Lab", "idx": 1},
                {"parent": "MET", "parenttype": "Employee Onboarding Template", "activity_name": "Laptop", "custom_owner": None, "custom_team": "ICT", "idx": 2},
            ],
        }
        f = _fakefrappe.install(store)
        f.db.exists = lambda dt, key=None: True
        rows = seed_records.template_rows("Employee Onboarding Template", {"department": "Metrology"})
        self.assertEqual(rows, [("manager", "Lab safety", "Lab"), ("pick", "Laptop", "ICT")])
        self.assertEqual(seed_records.template_rows("Employee Onboarding Template", {"department": "Legal"}), [("hr", "Contract", "HR")])

    def test_seeded_wording_never_waits_on_anyone(self):
        for text in seed_records.WORDING.values():
            self.assertNotIn("awaiting", text.lower())
            self.assertNotIn("ESWASA confirms", text)


if __name__ == "__main__":
    unittest.main()
