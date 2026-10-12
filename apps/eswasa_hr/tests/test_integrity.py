"""R-H7 nightly integrity check: the pure rule, and the snapshot against a fake frappe."""

from __future__ import annotations

import json
import unittest
from datetime import date
from unittest import mock

from eswasa_hr import integrity as ig
from eswasa_hr import overview as ov
from tests import _fakefrappe as ff

FULL = {"name": "EMP-2", "employee_name": "Thandi Mamba", "department": "Certification", "designation": "Auditor", "grade": "G5",
        "holiday_list": "ESW 2026", "reports_to": "EMP-1", "leave_approver": "ed@x", "user_id": "thandi@x"}
DEPTS = {"Certification": {"is_group": 0, "disabled": 0}, "Operations": {"is_group": 1, "disabled": 0}, "Old Unit": {"is_group": 0, "disabled": 1}}


class RuleTests(unittest.TestCase):
    def test_complete_record_has_no_gaps(self):
        self.assertEqual(ig.gaps(FULL, ["EMP-1"], DEPTS), [])

    def test_top_employee_is_exempt_from_a_line_manager_only(self):
        ed = {**FULL, "name": "EMP-1", "reports_to": None}
        self.assertEqual(ig.gaps(ed, ["EMP-1"], DEPTS), [])
        self.assertEqual(ig.gaps({**ed, "grade": None}, ["EMP-1"], DEPTS), ["grade"])
        self.assertEqual(ig.gaps(ed, [], DEPTS), ["reports_to"])

    def test_no_executive_director_is_flagged_not_guessed(self):
        s = ig.summarise([FULL], [], DEPTS)
        self.assertEqual(s["by_field"]["executive_director"], 1)
        self.assertIn({"field": "executive_director", "label": "No Executive Director set", "count": 1}, ig.quality(s))
        self.assertNotIn("executive_director", ig.summarise([FULL], ["EMP-1"], DEPTS)["by_field"])

    def test_group_or_disabled_or_unknown_department_is_flagged(self):
        for d in ("Operations", "Old Unit", "Gone"):
            self.assertEqual(ig.gaps({**FULL, "department": d}, ["EMP-1"], DEPTS), ["department_invalid"])
        self.assertEqual(ig.gaps({**FULL, "department": None}, ["EMP-1"], DEPTS), ["department"])

    def test_missing_fields_and_rows_are_capped(self):
        bare = {"name": "EMP-9"}
        self.assertEqual(ig.gaps(bare, ["EMP-1"], DEPTS), ["department", "designation", "grade", "holiday_list", "reports_to", "leave_approver", "user_id"])
        many = ig.summarise([{"name": f"E{i}"} for i in range(ig.MAX_ROWS + 5)], ["EMP-1"], DEPTS)
        self.assertEqual((many["people"], len(many["rows"])), (ig.MAX_ROWS + 5, ig.MAX_ROWS))

    def test_quality_keeps_the_overview_shape(self):
        s = ig.summarise([FULL, {**FULL, "name": "EMP-3", "user_id": None}], ["EMP-1"], DEPTS)
        self.assertEqual(ig.quality(s), [{"field": "user_id", "label": "No login linked", "count": 1}])
        legacy = {g["field"]: g["count"] for g in ov.record_gaps([{"department": "Finance", "reports_to": None}])}
        self.assertEqual((legacy["department"], legacy["reports_to"], legacy["user_id"]), (0, 1, 1))

    def test_alert_only_when_gaps_go_up(self):
        self.assertTrue(ig.went_up(None, {"people": 1}))
        self.assertFalse(ig.went_up({"people": 3}, {"people": 3}))
        self.assertFalse(ig.went_up({"people": 3}, {"people": 2}))
        self.assertEqual(ig.alert_title(2, date(2026, 10, 16)), "2 employee records have gaps after the 16 Oct 2026 integrity check. Fix them in the directory")


def _store():
    return {
        "Has Role": [{"parent": "ed@x", "role": ig.TOP_ROLE, "parenttype": "User"}],
        "Employee": [
            {**FULL, "name": "EMP-1", "employee_name": "Executive Director", "reports_to": None, "user_id": "ed@x", "status": "Active", "company": "ESWASA"},
            {**FULL, "status": "Active", "holiday_list": None, "company": "ESWASA"},  # company default counts
            {**FULL, "name": "EMP-3", "employee_name": "No Login", "user_id": None, "status": "Active"},
            {**FULL, "name": "EMP-4", "status": "Left", "department": None},
        ],
        "Company": [{"name": "ESWASA", "default_holiday_list": "ESW 2026"}],
        "Department": [{"name": k, **v} for k, v in DEPTS.items()],
    }


class RunTests(unittest.TestCase):
    def setUp(self):
        self.store = _store()
        ff.install(self.store, doctypes=(ig.SNAPSHOT, "HR Alert"))
        self.alerts = []
        p1 = mock.patch("eswasa_hr.alerts.raise_alert", side_effect=lambda *a, **k: self.alerts.append(a) or 1)
        p2 = mock.patch("eswasa_hr.recruitment._hr_manager_users", return_value=["hr1@x"])
        p1.start(), p2.start()
        self.addCleanup(mock.patch.stopall)
        self.addCleanup(ff.uninstall)

    def test_snapshot_written_and_rerun_is_idempotent(self):
        self.assertIsNone(ig.current())
        self.assertEqual(ig.run(), {"people": 1, "raised": 1})
        snap = ig.current()
        self.assertEqual(snap["counts"], {"people": 1, "by_field": {**{f: 0 for f, _ in ig.CHECKS}, "user_id": 1}})
        self.assertEqual(snap["rows"], [{"employee": "EMP-3", "employee_name": "No Login", "gaps": ["user_id"]}])
        self.assertEqual(self.alerts[0][:2], ("integrity:2026-10-16", "Record gaps"))
        self.assertEqual(ig.run(), {"people": 1, "raised": 0})  # same picture: same snapshot, no new alert
        self.assertEqual(ig.current()["counts"], snap["counts"])
        self.assertEqual(json.loads(self.store["__single__"][ig.SNAPSHOT]["rows"]), snap["rows"])
        self.assertEqual(len(self.alerts), 1)

    def test_more_gaps_raise_the_alert(self):
        ig.run()
        self.store["Employee"][1]["grade"] = None
        self.assertEqual(ig.run()["people"], 2)
        self.assertEqual(len(self.alerts), 2)

    def test_nothing_before_migrate(self):
        ff.install(self.store, doctypes=())
        self.assertEqual(ig.run(), {"people": 0, "raised": 0})
        self.assertIsNone(ig.current())


if __name__ == "__main__":
    unittest.main()
