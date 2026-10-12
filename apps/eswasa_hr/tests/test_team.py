"""My team and probation (T1–T4, R-H1) — pure rules, plus the probation review on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import team as tm

TODAY = date(2026, 10, 12)


class RuleTests(unittest.TestCase):
    def test_report_tree_is_direct_and_indirect_and_cycle_safe(self):
        edges = [("sm", "nt"), ("nd", "nt"), ("tm", "sm"), ("bd", "sm"), ("x", "tm"), ("nt", "x"), ("other", "ed")]
        self.assertEqual(tm.report_tree("nt", edges), ["sm", "nd", "tm", "bd", "x"])
        self.assertEqual(tm.report_tree("tm", edges), ["x", "nt", "sm", "nd", "bd"])  # cycle stops at tm
        self.assertEqual(tm.report_tree("bd", edges), [])

    def test_probation_due_window(self):
        self.assertEqual(tm.probation_due("2026-10-31", None, TODAY), date(2026, 10, 31))
        self.assertEqual(tm.probation_due("2026-10-01", None, TODAY), date(2026, 10, 1))  # overdue still shows
        self.assertIsNone(tm.probation_due("2026-12-31", None, TODAY))
        self.assertIsNone(tm.probation_due("2026-10-31", "2026-10-20", TODAY))

    def test_contract_window(self):
        self.assertEqual(tm.contract_ending("2026-11-30", TODAY), date(2026, 11, 30))
        self.assertIsNone(tm.contract_ending("2027-03-01", TODAY))
        self.assertIsNone(tm.contract_ending("2026-10-01", TODAY))

    def test_probation_review_rules(self):
        self.assertEqual(tm.probation_errors("confirm", "Reliable reviews, good with clients.", None, "2026-10-31"), [])
        self.assertIn("Say briefly", tm.probation_errors("confirm", "ok", None, "2026-10-31")[0])
        self.assertIn("after the current one", tm.probation_errors("extend", "Needs the QMS audits done.", "2026-10-01", "2026-10-31")[0])
        self.assertIn("new review date", tm.probation_errors("extend", "Needs the QMS audits done.", None, "2026-10-31")[0])
        self.assertIn("Choose confirm", tm.probation_errors("fire", "Needs the QMS audits done.", None, None)[0])


class _Err(Exception):
    pass


def _fake(user, employees, todos):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    by_user = {e["user_id"]: e["name"] for e in employees.values() if e.get("user_id")}

    def get_value(dt, key, field=None, *a, **k):
        if dt == "Employee" and isinstance(key, dict):
            return by_user.get(key.get("user_id"))
        if dt == "Employee":
            return employees.get(key, {}).get(field)
        return None

    f.db = SimpleNamespace(get_value=get_value, set_value=lambda dt, name, field, val: next(t for t in todos if t["name"] == name).__setitem__(field, val))

    def get_all(dt, filters=None, fields=None, **kw):
        if dt == "Employee":
            return [{"name": e["name"], "reports_to": e.get("reports_to")} for e in employees.values()]
        if dt == "ToDo":
            return [{"name": t["name"], "description": t["description"]} for t in todos
                    if t["reference_name"] == filters["reference_name"] and t["status"] == "Open" and t["allocated_to"] == filters["allocated_to"]]
        return []

    f.get_all = get_all

    def get_doc(dt, name):
        e = employees[name]
        d = SimpleNamespace(**e, flags=SimpleNamespace(), comments=[])
        d.save = lambda: e.update({k: getattr(d, k) for k in ("final_confirmation_date", "scheduled_confirmation_date")})
        d.add_comment = lambda kind, text: e.setdefault("comments", []).append(text)
        return d

    f.get_doc = get_doc
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda v: date.fromisoformat(str(v))
    utils.nowdate = lambda: TODAY.isoformat()
    utils.add_days = lambda d, n: date.fromordinal(d.toordinal() + n)
    sys.modules["frappe"], sys.modules["frappe.utils"] = f, utils
    return f


def _staff():
    return {
        "EMP-31": {"name": "EMP-31", "employee_name": "Sipho Magagula", "user_id": "sipho@x", "reports_to": "EMP-09"},
        "EMP-09": {"name": "EMP-09", "employee_name": "Nomvula Tsabedze", "user_id": "nomvula@x", "reports_to": None},
        "EMP-79": {"name": "EMP-79", "employee_name": "Bongani Dlamini", "user_id": "bongani@x", "reports_to": "EMP-31",
                   "scheduled_confirmation_date": "2026-10-31", "final_confirmation_date": None},
    }


class ProbationTests(unittest.TestCase):
    def setUp(self):
        self._member = tm.member_impl
        tm.member_impl = lambda employee: {"employee": employee}

    def tearDown(self):
        tm.member_impl = self._member
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def test_direct_manager_confirms_and_task_closes(self):
        staff = _staff()
        todos = [{"name": "TD-1", "reference_name": "EMP-79", "allocated_to": "sipho@x", "status": "Open", "description": "Review Bongani Dlamini's probation by 31 Oct 2026"}]
        _fake("sipho@x", staff, todos)
        tm.probation_review_impl("EMP-79", "confirm", "Reliable document reviews; good with clients.", None)
        self.assertEqual(staff["EMP-79"]["final_confirmation_date"], "2026-10-12")
        self.assertEqual(todos[0]["status"], "Closed")
        self.assertIn("confirm", staff["EMP-79"]["comments"][0])

    def test_extend_moves_the_date(self):
        staff = _staff()
        _fake("sipho@x", staff, [])
        tm.probation_review_impl("EMP-79", "extend", "Needs the QMS witnessed audits done.", "2027-01-31")
        self.assertEqual((staff["EMP-79"]["scheduled_confirmation_date"], staff["EMP-79"]["final_confirmation_date"]), ("2027-01-31", None))

    def test_only_the_direct_manager_reviews(self):
        staff = _staff()
        f = _fake("nomvula@x", staff, [])  # indirect manager: sees the person, can't review probation
        with self.assertRaisesRegex(f.PermissionError, "direct line manager"):
            tm.probation_review_impl("EMP-79", "confirm", "Reliable document reviews; good with clients.", None)
        f = _fake("bongani@x", staff, [])
        with self.assertRaisesRegex(f.PermissionError, "doesn't report to you"):
            tm.probation_review_impl("EMP-31", "confirm", "Reliable document reviews; good with clients.", None)


if __name__ == "__main__":
    unittest.main()
