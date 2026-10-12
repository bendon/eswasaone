"""Performance (J6) — pure rules, plus idempotent reminders on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace
from unittest import mock

from eswasa_hr import performance as pf


class RuleTests(unittest.TestCase):
    def test_working_days_skip_weekends_and_holidays(self):
        end = date(2027, 3, 26)  # a Friday
        self.assertEqual(pf.working_days_before(end, 3), date(2027, 3, 23))
        self.assertEqual(pf.working_days_before(end, 10), date(2027, 3, 12))
        self.assertEqual(pf.working_days_before(end, 3, [date(2027, 3, 25)]), date(2027, 3, 22))

    def test_reminder_due_only_on_the_10th_and_3rd_working_day(self):
        end = "2027-03-26"
        self.assertEqual(pf.reminder_due(date(2027, 3, 12), end), 10)
        self.assertEqual(pf.reminder_due(date(2027, 3, 23), end), 3)
        self.assertIsNone(pf.reminder_due(date(2027, 3, 22), end))
        self.assertIsNone(pf.reminder_due(date(2027, 3, 22), None))

    def test_completion_by_department(self):
        rows = [
            {"department": "Certification", "objectives": 3, "self_done": True, "manager_done": True},
            {"department": "Certification", "objectives": 0, "self_done": True, "manager_done": False},
            {"department": None, "objectives": 1, "self_done": False, "manager_done": False},
        ]
        self.assertEqual(pf.completion(rows), [
            {"department": "Certification", "people": 2, "objectives_set": 1, "self_done": 2, "manager_done": 1},
            {"department": "No department", "people": 1, "objectives_set": 1, "self_done": 0, "manager_done": 0},
        ])

    def test_steps(self):
        self.assertEqual(pf.step_of(False, False), "self")
        self.assertEqual(pf.step_of(True, False), "manager")
        self.assertEqual(pf.step_of(True, True), "done")

    def test_every_criterion_rated_1_to_5(self):
        crit = ["Quality of work", "Timeliness"]
        self.assertEqual(pf.rating_errors(crit, {"Quality of work": 4, "Timeliness": "3"}), [])
        self.assertIn("Timeliness", pf.rating_errors(crit, {"Quality of work": 4})[0])
        self.assertIn("1 to 5", pf.rating_errors(crit, {"Quality of work": 6, "Timeliness": 0})[0])

    def test_cycle_rules(self):
        self.assertEqual(pf.cycle_errors("Mid-year review 2026/27", "2026-10-01", "2027-03-31", "Auditors"), [])
        errs = pf.cycle_errors("", "2027-03-31", "2026-10-01", None)
        self.assertEqual(len(errs), 3)
        self.assertIn("after the start", errs[1])

    def test_titles(self):
        self.assertEqual(pf.self_title("Mid-year review", date(2026, 10, 30)), "Complete your self-assessment for Mid-year review by 30 Oct 2026")
        self.assertEqual(pf.review_title("Thandi Mamba", "Mid-year review", date(2026, 10, 30)), "Review Thandi Mamba's self-assessment for Mid-year review by 30 Oct 2026")


class RemindTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)

    def test_reminders_go_to_whoever_has_the_open_step_once(self):
        todos: list[dict] = []
        f = types.ModuleType("frappe")
        f.session = SimpleNamespace(user="hr@x")
        f.throw = lambda msg, exc=Exception: (_ for _ in ()).throw(exc(msg))
        f.DoesNotExistError = type("DoesNotExistError", (Exception,), {})
        staff = {"EMP-1": {"user_id": "thandi@x", "reports_to": "EMP-9"}, "EMP-2": {"user_id": "zanele@x", "reports_to": "EMP-9"},
                 "EMP-3": {"user_id": "bongani@x", "reports_to": "EMP-9"}, "EMP-9": {"user_id": "sipho@x"}}

        def get_value(dt, name, field, *a, **k):
            if dt == pf.CYCLE:
                return {"name": "CYC-1", "cycle_name": "Mid-year review", "end_date": "2026-10-30"}
            return staff.get(name, {}).get(field)

        def exists(dt, key):
            if dt == "DocType":  # no HR Notification outbox on this site
                return False
            return any(all(t.get(k) == v for k, v in key.items()) for t in todos)

        f.db = SimpleNamespace(get_value=get_value, exists=exists)
        f.get_doc = lambda d: SimpleNamespace(insert=lambda **k: todos.append(d))
        sys.modules["frappe"] = f
        rows = [
            {"appraisal": "APR-1", "employee": "EMP-1", "employee_name": "Thandi Mamba", "step": "self"},
            {"appraisal": "APR-2", "employee": "EMP-2", "employee_name": "Zanele Nkosi", "step": "manager"},
            {"appraisal": "APR-3", "employee": "EMP-3", "employee_name": "Bongani Dube", "step": "done"},
        ]
        with mock.patch.object(pf, "_rows", return_value=rows):
            self.assertEqual(pf.remind_impl("CYC-1"), {"sent": 2})
            self.assertEqual(pf.remind_impl("CYC-1"), {"sent": 0})
        self.assertEqual([(t["allocated_to"], t["reference_name"]) for t in todos], [("thandi@x", "APR-1"), ("sipho@x", "APR-2")])
        self.assertTrue(todos[1]["description"].startswith("Review Zanele Nkosi's self-assessment"))


if __name__ == "__main__":
    unittest.main()
