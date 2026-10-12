"""Leave ↔ Approvals (journey J3) — pure rules, plus the Frappe glue against a fake frappe module."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import leave


class RuleTests(unittest.TestCase):
    def test_titles_read_like_a_sentence(self):
        self.assertEqual(leave.todo_title("Thandi Mamba", "2026-11-02", "2026-11-06"), "Approve leave for Thandi Mamba, 2 to 6 Nov")
        self.assertEqual(leave.todo_title("Thandi Mamba", "2026-11-02", "2026-11-02"), "Approve leave for Thandi Mamba, on 2 Nov")
        self.assertEqual(leave.todo_title("Thandi Mamba", "2026-10-30", "2026-11-03"), "Approve leave for Thandi Mamba, 30 Oct to 3 Nov")

    def test_sla_skips_weekends(self):
        self.assertEqual(leave.add_working_days(date(2026, 10, 16), 2), date(2026, 10, 20))  # Fri → Tue

    def test_routing_only_open_and_never_to_self(self):
        self.assertTrue(leave.needs_todo("Open", 0, "sipho@x", "thandi@x"))
        self.assertFalse(leave.needs_todo("Approved", 1, "sipho@x", "thandi@x"))
        self.assertFalse(leave.needs_todo("Open", 0, None, "thandi@x"))
        self.assertFalse(leave.needs_todo("Open", 0, "thandi@x", "thandi@x"))

    def test_decisions(self):
        self.assertEqual(leave.decision_status("Approve"), "Approved")
        self.assertEqual(leave.decision_status("reject"), "Rejected")
        with self.assertRaises(ValueError):
            leave.decision_status("return")

    def test_who_decides(self):
        self.assertIsNone(leave.decider_error("sipho@x", "sipho@x", "thandi@x", ["Leave Approver"]))
        self.assertIsNone(leave.decider_error("hr@x", "sipho@x", "thandi@x", ["HR Manager"]))
        self.assertIn("own", leave.decider_error("thandi@x", "thandi@x", "thandi@x", ["HR Manager"]))
        self.assertIn("leave approver", leave.decider_error("zanele@x", "sipho@x", "thandi@x", ["Employee"]))


class _Throw(Exception):
    pass


def _fake_frappe(todos, user="sipho@x", roles=("Leave Approver",)):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    f.PermissionError = type("PermissionError", (_Throw,), {})
    f.ValidationError = type("ValidationError", (_Throw,), {})
    f._ = lambda s: s

    def throw(msg, exc=_Throw):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)
    f.db = SimpleNamespace(
        get_value=lambda dt, name, field: "thandi@x",
        set_value=lambda dt, name, field, val: next(t for t in todos if t["name"] == name).__setitem__(field, val),
    )
    f.get_all = lambda dt, filters, fields: [
        {"name": t["name"], "allocated_to": t["allocated_to"]}
        for t in todos
        if t["reference_name"] == filters["reference_name"] and t["status"] == "Open"
    ]

    class _Doc(dict):
        def insert(self, ignore_permissions=False):
            self["name"] = f"TD-{len(todos) + 1}"
            todos.append(dict(self))
            return self

    f.get_doc = lambda d, *a: _Doc(d) if isinstance(d, dict) else f._leave
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda v: date.fromisoformat(str(v))
    utils.nowdate = lambda: "2026-10-16"
    f.utils = utils
    sys.modules["frappe"] = f
    sys.modules["frappe.utils"] = utils
    return f


def _leave_doc(**kw):
    base = dict(name="HR-LAP-002", employee="HR-EMP-0044", employee_name="Thandi Mamba", from_date="2026-11-02",
                to_date="2026-11-06", status="Open", docstatus=0, leave_approver="sipho@x")
    base.update(kw)
    doc = SimpleNamespace(**base)
    doc.comments = []
    doc.add_comment = lambda kind, text: doc.comments.append(text)

    def submit():
        doc.docstatus = 1

    doc.submit = submit
    return doc


class GlueTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def test_new_request_gets_one_todo_for_the_approver(self):
        todos = []
        _fake_frappe(todos)
        doc = _leave_doc()
        leave.sync_todo(doc)
        leave.sync_todo(doc)  # on_update after after_insert must not duplicate
        self.assertEqual(len(todos), 1)
        t = todos[0]
        self.assertEqual(t["allocated_to"], "sipho@x")
        self.assertEqual(t["description"], "Approve leave for Thandi Mamba, 2 to 6 Nov")
        self.assertEqual(t["date"], "2026-10-20")
        self.assertNotIn("role", t)  # never a role pool

    def test_changed_approver_moves_the_todo(self):
        todos = [{"name": "TD-1", "allocated_to": "sipho@x", "reference_name": "HR-LAP-002", "status": "Open"}]
        _fake_frappe(todos)
        leave.sync_todo(_leave_doc(leave_approver="nomvula@x"))
        self.assertEqual(todos[0]["status"], "Closed")
        self.assertEqual([t["allocated_to"] for t in todos if t["status"] == "Open"], ["nomvula@x"])

    def test_approve_submits_and_closes_the_todo(self):
        todos = [{"name": "TD-1", "allocated_to": "sipho@x", "reference_name": "HR-LAP-002", "status": "Open"}]
        f = _fake_frappe(todos)
        f._leave = _leave_doc()
        res = leave.decide("HR-LAP-002", "approve")
        self.assertEqual((res["status"], f._leave.docstatus), ("Approved", 1))
        self.assertEqual(todos[0]["status"], "Closed")

    def test_reject_needs_a_reason(self):
        f = _fake_frappe([])
        f._leave = _leave_doc()
        with self.assertRaises(f.ValidationError):
            leave.decide("HR-LAP-002", "reject")
        res = leave.decide("HR-LAP-002", "reject", "Audit week; please move it by a week.")
        self.assertEqual(res["status"], "Rejected")
        self.assertEqual(f._leave.comments, ["Audit week; please move it by a week."])

    def test_applicant_cannot_decide_and_decided_requests_are_final(self):
        f = _fake_frappe([], user="thandi@x", roles=("HR Manager",))
        f._leave = _leave_doc()
        with self.assertRaises(f.PermissionError):
            leave.decide("HR-LAP-002", "approve")
        f = _fake_frappe([])
        f._leave = _leave_doc(status="Approved", docstatus=1)
        with self.assertRaises(f.ValidationError):
            leave.decide("HR-LAP-002", "approve")


if __name__ == "__main__":
    unittest.main()
