"""Working days for HR deadlines (plan 03 step 1) — pure, no Frappe."""

from __future__ import annotations

import unittest
from datetime import date

from eswasa_hr import workdays


class WorkdayTests(unittest.TestCase):
    def test_weekends_are_skipped(self):
        self.assertEqual(workdays.add_working_days(date(2026, 10, 16), 2), date(2026, 10, 20))  # Fri → Tue
        self.assertEqual(workdays.add_working_days(date(2026, 10, 14), 0), date(2026, 10, 14))

    def test_holidays_are_skipped(self):
        self.assertEqual(workdays.add_working_days(date(2026, 10, 13), 2, {date(2026, 10, 14)}), date(2026, 10, 16))

    def test_a_weekend_plus_a_holiday(self):
        # Fri 24 Dec 2027, then Sat/Sun, then Mon 27 and Tue 28 Dec holidays → Wed 29, Thu 30
        hol = {date(2027, 12, 27), date(2027, 12, 28)}
        self.assertEqual(workdays.add_working_days(date(2027, 12, 24), 2, hol), date(2027, 12, 30))

    def test_working_days_before(self):
        end = date(2027, 3, 26)  # Fri
        self.assertEqual(workdays.working_days_before(end, 3), date(2027, 3, 23))
        self.assertEqual(workdays.working_days_before(end, 3, [date(2027, 3, 25)]), date(2027, 3, 22))

    def test_is_working_day(self):
        self.assertTrue(workdays.is_working_day(date(2026, 10, 16)))
        self.assertFalse(workdays.is_working_day(date(2026, 10, 17)))
        self.assertFalse(workdays.is_working_day(date(2026, 10, 16), [date(2026, 10, 16)]))


if __name__ == "__main__":
    unittest.main()
