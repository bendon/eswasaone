"""Service milestones (HR additions plan 08): years from HR Settings (A8), leap-day joiners, leavers skipped, alert once."""

from __future__ import annotations

import unittest
from datetime import date
from unittest import mock

from eswasa_hr import milestones as ms

PEOPLE = [
    {"name": "E1", "employee_name": "Thandi Mamba", "date_of_joining": "2016-11-01", "status": "Active", "reports_to": "E9"},
    {"name": "E2", "employee_name": "Sipho Dlamini", "date_of_joining": "2016-02-29", "status": "Active"},
    {"name": "E3", "employee_name": "Gone Person", "date_of_joining": "2016-11-02", "status": "Left"},
    {"name": "E9", "employee_name": "Line Manager", "date_of_joining": "2010-01-01", "status": "Active", "user_id": "lm@x"},
]


class RuleTests(unittest.TestCase):
    def test_parse_years(self):
        self.assertEqual(ms.parse_years(" 10, 5,x, 5 ,0, 20"), [5, 10, 20])
        self.assertEqual(ms.parse_years(None), [])

    def test_leap_day_joiner(self):
        self.assertEqual(ms.anniversary("2016-02-29", 10), date(2026, 2, 28))
        self.assertEqual(ms.anniversary("2016-02-29", 8), date(2024, 2, 29))

    def test_next_milestone(self):
        today = date(2026, 10, 13)
        self.assertEqual(ms.next_milestone("2016-11-01", [5, 10, 20], today), {"years": 10, "date": "2026-11-01"})
        self.assertEqual(ms.next_milestone("2016-11-01", [], today), None)
        self.assertEqual(ms.next_milestone("1990-01-01", [5, 10], today), None)

    def test_upcoming_skips_leavers_and_respects_the_window(self):
        out = ms.upcoming_milestones(PEOPLE, [10], date(2026, 10, 13))
        self.assertEqual([(r["employee"], r["years"], r["date"]) for r in out], [("E1", 10, "2026-11-01")])
        self.assertEqual(ms.upcoming_milestones(PEOPLE, [10], date(2026, 9, 1)), [])

    def test_months_window(self):
        self.assertEqual(ms.months_window(date(2026, 10, 13)), (date(2026, 10, 1), date(2026, 11, 30)))
        self.assertEqual(ms.months_window(date(2026, 12, 5)), (date(2026, 12, 1), date(2027, 1, 31)))
        self.assertEqual(ms.months_window(date(2026, 11, 5)), (date(2026, 11, 1), date(2026, 12, 31)))

    def test_title(self):
        self.assertEqual(ms.alert_title("Thandi Mamba", 10, "2026-11-01"), "Thandi Mamba reaches 10 years of service on 1 Nov 2026")


class AlertTests(unittest.TestCase):
    def setUp(self):
        from tests import _fakefrappe as ff

        self.store = {
            "Employee": [dict(p) for p in PEOPLE],
            "Has Role": [{"parent": "hrm@x", "role": "HR Manager", "parenttype": "User"}],
            "User": [{"name": "hrm@x", "enabled": 1}],
            "HR Alert": [],
            "ToDo": [],
        }
        ff.install(self.store, today="2026-10-13", doctypes=("HR Alert",))
        self.addCleanup(ff.uninstall)

    def test_raised_once_to_hr_and_the_line_manager(self):
        with mock.patch.object(ms, "years_set", return_value=[10]):
            self.assertEqual(ms.service_milestones(), 1)
            self.assertEqual(ms.service_milestones(), 0)
        [alert] = self.store["HR Alert"]
        self.assertEqual((alert["key"], alert["rule"], alert["employee"]), ("service:E1:10", "Service milestone", "E1"))
        self.assertEqual(sorted(t["allocated_to"] for t in self.store["ToDo"]), ["hrm@x", "lm@x"])

    def test_nothing_without_years(self):
        with mock.patch.object(ms, "years_set", return_value=[]):
            self.assertEqual(ms.service_milestones(), 0)
            self.assertEqual(ms.overview_block(date(2026, 10, 13)), {"milestone_years": [], "milestones": []})
        with mock.patch.object(ms, "years_set", return_value=[10]):
            out = ms.overview_block(date(2026, 10, 13))
        self.assertEqual([m["employee"] for m in out["milestones"]], ["E1"])


if __name__ == "__main__":
    unittest.main()
