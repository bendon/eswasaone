"""Issued items and offboarding clearance (additions plan 02) — pure rules, plus the flows on a fake frappe."""

from __future__ import annotations

import unittest
from datetime import date

from eswasa_hr import issued_items as ii
from tests import _fakefrappe as ff

TODAY = date(2026, 10, 16)
TYPES = ["Laptop", "Access card"]


class RuleTests(unittest.TestCase):
    def test_types_parse_one_per_line(self):
        self.assertEqual(ii.parse_types("Laptop\n Access card \n\nLaptop, Phone"), ["Laptop", "Access card", "Phone"])
        self.assertEqual(ii.parse_types(None), [])

    def test_issue_refused_without_types_or_for_an_inactive_person(self):
        self.assertEqual(ii.issue_errors("Laptop", [], "Active"), [ii.AWAITING])
        self.assertIn("awaiting ESWASA A2", ii.AWAITING)
        self.assertEqual(ii.issue_errors("Laptop", TYPES, "Active"), [])
        self.assertIn("active employee", ii.issue_errors("Laptop", TYPES, "Left")[0])
        self.assertIn("HR setup list", ii.issue_errors("Car", TYPES, "Active")[0])

    def test_return_only_from_issued_or_acknowledged(self):
        self.assertEqual(ii.return_errors("Issued"), [])
        self.assertEqual(ii.return_errors("Acknowledged"), [])
        for done in ("Returned", "Lost", "Written off"):
            self.assertIn("still out", ii.return_errors(done)[0])

    def test_lost_needs_a_note_and_an_hr_manager(self):
        self.assertEqual(ii.return_errors("Issued", "Lost", "Stolen from car, police case 12/26", hr_manager=True), [])
        errs = ii.return_errors("Issued", "Written off", "", hr_manager=False)
        self.assertEqual(len(errs), 2)
        self.assertIn("HR Manager", errs[0])
        self.assertIn("what happened", ii.return_errors("Issued", "Lost", " ", hr_manager=True)[0])

    def test_clearance_blocked_while_items_are_out(self):
        rows = [{"item_type": "Laptop", "tag": "DL-1", "status": "Acknowledged"}, {"item_type": "Access card", "status": "Returned"}]
        self.assertEqual(ii.outstanding(rows), [rows[0]])
        self.assertEqual(ii.clearance_blocked(rows), "1 item is still out: Laptop DL-1.")
        self.assertIsNone(ii.clearance_blocked([rows[1]]))
        self.assertTrue(ii.is_clearance_activity(ii.clearance_activity(2)))
        self.assertEqual(ii.clearance_activity(2), "Return issued items (2)")

    def test_overdue_and_titles(self):
        self.assertTrue(ii.is_overdue({"status": "Issued", "return_due": "2026-10-15"}, TODAY))
        self.assertFalse(ii.is_overdue({"status": "Returned", "return_due": "2026-10-15"}, TODAY))
        self.assertFalse(ii.is_overdue({"status": "Issued", "return_due": None}, TODAY))
        self.assertEqual(ii.acknowledge_title("Laptop", "DL-1"), "Acknowledge receipt of Laptop DL-1")
        self.assertTrue(ii.acknowledge_title("Laptop", None).startswith("Acknowledge"))  # a do card in Approvals


class FlowTests(unittest.TestCase):
    def setUp(self):
        self.store = {
            "Employee": [
                {"name": "EMP-7", "employee_name": "Gcina Mavuso", "status": "Active", "department": "ICT", "user_id": "gcina@x", "reports_to": "EMP-2"},
                {"name": "EMP-2", "employee_name": "Busi Fakudze", "status": "Active", "department": "ICT", "user_id": "busi@x"},
                {"name": "EMP-9", "employee_name": "Left Person", "status": "Left", "department": "ICT", "user_id": "left@x"},
            ],
            "Has Role": [{"parent": "hrm@x", "role": "HR Manager", "parenttype": "User"}],
            "User": [{"name": "hrm@x", "enabled": 1}],
        }
        self._types = ii.types
        ii.types = lambda: list(TYPES)
        self.addCleanup(self._restore)

    def _restore(self):
        ii.types = self._types
        ff.uninstall()

    def _as(self, user, roles):
        return ff.install(self.store, user=user, roles=roles, today="2026-10-16", doctypes=("HR Issued Item", "HR Alert"))

    def _issue(self, employee="EMP-7"):
        self._as("hr@x", ("HR User",))
        ii.issue_impl(employee, "Laptop", tag="DL-1", return_due="2026-12-31")
        return self.store["HR Issued Item"][-1]["name"]

    def test_issue_refused_with_an_empty_type_list_or_an_inactive_person(self):
        f = self._as("hr@x", ("HR User",))
        ii.types = lambda: []
        with self.assertRaisesRegex(f.ValidationError, "awaiting ESWASA A2"):
            ii.issue_impl("EMP-7", "Laptop")
        ii.types = lambda: list(TYPES)
        with self.assertRaisesRegex(f.ValidationError, "active employee"):
            ii.issue_impl("EMP-9", "Laptop")
        self.assertFalse(self.store.get("HR Issued Item"))

    def test_only_hr_issues(self):
        f = self._as("busi@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            ii.issue_impl("EMP-7", "Laptop")

    def test_issue_opens_a_do_card_and_only_the_holder_acknowledges(self):
        name = self._issue()
        row = self.store["HR Issued Item"][0]
        self.assertEqual((row["status"], row["issued_by"], row["issued_on"]), ("Issued", "hr@x", "2026-10-16"))
        todo = self.store["ToDo"][0]
        self.assertEqual((todo["allocated_to"], todo["description"]), ("gcina@x", "Acknowledge receipt of Laptop DL-1"))
        f = self._as("busi@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            ii.acknowledge_impl(name)
        self._as("gcina@x", ("Employee",))
        res = ii.decide(name, "approve")
        self.assertEqual(res["status"], "Acknowledged")
        self.assertEqual((row["status"], row["acknowledged_on"], todo["status"]), ("Acknowledged", "2026-10-16", "Closed"))
        f = self._as("gcina@x", ("Employee",))
        with self.assertRaises(f.ValidationError):
            ii.acknowledge_impl(name)

    def test_line_manager_takes_it_back_once(self):
        name = self._issue()
        f = self._as("left@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            ii.return_impl(name)
        self._as("busi@x", ("Employee",))
        out = ii.return_impl(name, "Returned", "Good")
        row = self.store["HR Issued Item"][0]
        self.assertEqual((row["status"], row["received_by"], row["condition_in"]), ("Returned", "busi@x", "Good"))
        self.assertTrue(out["can_return"])
        f = self._as("busi@x", ("Employee",))
        with self.assertRaisesRegex(f.ValidationError, "still out"):
            ii.return_impl(name)

    def test_lost_needs_a_note_and_an_hr_manager(self):
        name = self._issue()
        f = self._as("hr@x", ("HR User",))
        with self.assertRaises(f.PermissionError):
            ii.return_impl(name, "Lost", note="Stolen")
        f = self._as("hrm@x", ("HR Manager",))
        with self.assertRaisesRegex(f.ValidationError, "what happened"):
            ii.return_impl(name, "Lost")
        ii.return_impl(name, "Lost", note="Stolen from car, police case 12/26")
        row = self.store["HR Issued Item"][0]
        self.assertEqual((row["status"], row.get("received_by")), ("Lost", None))

    def test_clearance_blocked_while_items_are_out(self):
        name = self._issue()
        self.assertEqual(ii.clearance_error("EMP-7", "Return issued items (1)"), "1 item is still out: Laptop DL-1.")
        self.assertIsNone(ii.clearance_error("EMP-7", "Exit interview"))
        act = ii.separation_activity("EMP-7", "hr@x")
        self.assertEqual(act, {"activity_name": "Return issued items (1)", "group": "HR", "user": "hr@x"})
        detail = ii.offboarding_items({"employee": "EMP-7", "activities": [{"activity_name": "Return issued items (1)", "status": "Open"}]})
        self.assertEqual([r["name"] for r in detail["items_out"]], [name])
        self.assertIn("still out", detail["activities"][0]["blocked"])
        ii.return_impl(name)
        self.assertIsNone(ii.clearance_error("EMP-7", "Return issued items (1)"))
        self.assertIsNone(ii.separation_activity("EMP-7", "hr@x"))

    def test_last_day_alert_raised_once(self):
        self._issue()
        self._as("Administrator", ("System Manager",))
        e = dict(self.store["Employee"][0])
        self.assertEqual(ii.on_last_day(e, "busi@x"), 1)
        self.assertEqual(self.store["ToDo"][0]["status"], "Cancelled")  # the leaver's acknowledgement card
        alert = self.store["HR Alert"][0]
        self.assertEqual((alert["rule"], alert["key"], alert["employee"]), ("Items not returned", "items:EMP-7:lastday", "EMP-7"))
        self.assertEqual(sorted(t["allocated_to"] for t in self.store["ToDo"] if t["reference_type"] == "HR Alert"), ["busi@x", "hrm@x"])
        self.store["Employee"][0]["status"] = "Left"
        self.assertEqual(ii.on_last_day(e, "busi@x"), 0)
        self.assertEqual(ii.items_not_returned(), 0)
        self.assertEqual(len(self.store["HR Alert"]), 1)

    def test_daily_check_catches_a_leaver_missed_on_the_day(self):
        self._issue()
        self.store["Employee"][0].update({"status": "Left", "relieving_date": "2026-10-10"})
        self._as("Administrator", ("System Manager",))
        self.assertEqual(ii.items_not_returned(), 1)
        self.assertEqual(ii.items_not_returned(), 0)

    def test_scope(self):
        self._issue()
        self._as("busi@x", ("Employee",))
        self.assertEqual(ii.employee_items_impl("EMP-7")["items"][0]["item_type"], "Laptop")
        self.assertTrue(ii.has_permission({"employee": "EMP-7"}, "read", "busi@x"))
        self.assertFalse(ii.has_permission({"employee": "EMP-7"}, "write", "busi@x"))
        f = self._as("left@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            ii.employee_items_impl("EMP-7")
        with self.assertRaises(f.PermissionError):
            ii.register_impl()
        self._as("gcina@x", ("Employee",))
        self.assertEqual(ii.my_items_impl()["waiting"], 1)


if __name__ == "__main__":
    unittest.main()
