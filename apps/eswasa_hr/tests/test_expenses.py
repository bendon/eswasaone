"""Expense claims ↔ Approvals (plan 05) — pure rules, plus the Frappe glue against the leave tests' fake frappe."""

from __future__ import annotations

import sys
import unittest
from datetime import date

from eswasa_hr import expenses as ex, scope
from tests.test_leave import _Store, _fake_frappe

TODAY = date(2026, 10, 16)


def _line(**kw):
    base = {"expense_type": "Travel", "expense_date": "2026-10-12", "amount": 120.0, "description": "Taxi to Matsapha", "receipt": "taxi.pdf"}
    base.update(kw)
    return base


class RuleTests(unittest.TestCase):
    def test_lines_are_validated(self):
        self.assertIn("at least one", ex.claim_errors([], [], None, TODAY))
        self.assertIn("expense type", ex.claim_errors([_line(expense_type=" ")], ["taxi.pdf"], None, TODAY))
        self.assertIn("more than 0", ex.claim_errors([_line(amount=0)], ["taxi.pdf"], None, TODAY))
        self.assertIn("more than 0", ex.claim_errors([_line(amount=-5)], ["taxi.pdf"], None, TODAY))
        self.assertIn("date", ex.claim_errors([_line(expense_date="")], ["taxi.pdf"], None, TODAY))
        self.assertIn("future", ex.claim_errors([_line(expense_date="2026-10-17")], ["taxi.pdf"], None, TODAY))
        self.assertIsNone(ex.claim_errors([_line(), _line(expense_date="2026-10-16")], ["taxi.pdf"], None, TODAY))

    def test_empty_threshold_means_a_receipt_is_always_required(self):
        self.assertTrue(ex.receipt_needed(1, None))
        self.assertTrue(ex.receipt_needed(1, ""))
        self.assertIn("receipt", ex.claim_errors([_line(amount=5, receipt=None)], [], None, TODAY))
        self.assertIn("receipt", ex.claim_errors([_line(receipt="other.pdf")], ["taxi.pdf"], None, TODAY))

    def test_receipt_only_above_the_threshold(self):
        self.assertFalse(ex.receipt_needed(200, 200))
        self.assertTrue(ex.receipt_needed(200.01, 200))
        self.assertIsNone(ex.claim_errors([_line(amount=150, receipt=None)], [], 200, TODAY))
        self.assertIn("Line 2", ex.claim_errors([_line(amount=150, receipt=None), _line(amount=250, receipt=None)], [], 200, TODAY))

    def test_attachments_must_be_uploaded_first(self):
        self.assertIsNone(ex.attachment_error([{"file_name": "taxi.pdf", "url": "https://media.x/hr/taxi.pdf"}]))
        self.assertIn("Upload", ex.attachment_error([{"file_name": "taxi.pdf", "url": "javascript:alert(1)"}]))
        self.assertIn("file name", ex.attachment_error([{"file_name": "", "url": "https://media.x/a"}]))

    def test_title_names_the_claimant_and_the_total(self):
        self.assertEqual(ex.todo_title("Thandi Mamba", 1250), "Approve expense claim for Thandi Mamba, SZL 1,250.00")
        self.assertEqual(ex.total([_line(amount=10.5), _line(amount="4.25")]), 14.75)

    def test_routing_only_drafts_and_never_to_self(self):
        self.assertTrue(ex.needs_todo("Draft", 0, "sipho@x", "thandi@x"))
        self.assertFalse(ex.needs_todo("Approved", 1, "sipho@x", "thandi@x"))
        self.assertFalse(ex.needs_todo("Draft", 0, "thandi@x", "thandi@x"))
        self.assertFalse(ex.needs_todo("Draft", 0, None, "thandi@x"))
        self.assertEqual(ex.approver_problem("thandi@x", "thandi@x"), "self")
        self.assertEqual(ex.approver_problem(None, "thandi@x"), "none")

    def test_four_eyes(self):
        self.assertIsNone(ex.decider_error("sipho@x", "sipho@x", "thandi@x", ["Expense Approver"]))
        self.assertIsNone(ex.decider_error("fin@x", "sipho@x", "thandi@x", ["Accounts Manager"]))
        self.assertIn("own", ex.decider_error("thandi@x", "thandi@x", "thandi@x", ["HR Manager"]))
        self.assertIn("expense approver", ex.decider_error("zanele@x", "sipho@x", "thandi@x", ["HR User"]))

    def test_decisions_and_status_labels(self):
        self.assertEqual(ex.decision_status("Approve"), "Approved")
        with self.assertRaises(ValueError):
            ex.decision_status("pay")
        self.assertEqual(ex.status_label("Draft", "Draft", 0), "Waiting for approval")
        self.assertEqual(ex.status_label("Approved", "Unpaid", 1), "Approved, waiting for payment")
        self.assertEqual(ex.status_label("Approved", "Paid", 1), "Paid")
        self.assertEqual(ex.status_label("Rejected", "Rejected", 1), "Not approved")
        self.assertEqual(ex.status_label("Approved", "Cancelled", 2), "Cancelled")

    def test_row_carries_the_sla_only_while_open(self):
        row = {"name": "HR-EXP-1", "approval_status": "Draft", "docstatus": 0, "total_claimed_amount": 120, "expense_approver": "sipho@x"}
        out = ex.claim_row(row, "2026-10-14", TODAY)
        self.assertEqual((out["sla_date"], out["overdue"], out["status"]), ("2026-10-14", True, "Waiting for approval"))
        done = ex.claim_row({**row, "approval_status": "Approved", "docstatus": 1}, "2026-10-14", TODAY)
        self.assertEqual((done["sla_date"], done["overdue"]), (None, False))

    def test_who_can_see_a_claim(self):
        own = {"employee": "E-44", "expense_approver": "sipho@x"}
        self.assertTrue(ex.can_see("thandi@x", ["Employee"], "E-44", own))
        self.assertTrue(ex.can_see("sipho@x", ["Employee"], "E-10", own))
        self.assertTrue(ex.can_see("fin@x", ["Accounts Manager"], None, own))
        self.assertTrue(ex.can_see("hr@x", ["HR User"], None, own))
        self.assertFalse(ex.can_see("zanele@x", ["Employee"], "E-50", own))


class _Claim(dict):
    def __getattr__(self, k):
        return self.get(k)

    def __setattr__(self, k, v):
        self[k] = v


def _claim(**kw):
    base = dict(name="HR-EXP-0001", employee="HR-EMP-0044", employee_name="Thandi Mamba", approval_status="Draft", status="Draft",
                docstatus=0, expense_approver="sipho@x", total_claimed_amount=320.0,
                expenses=[_Claim(expense_type="Travel", amount=120.0, expense_date="2026-10-12"), _Claim(expense_type="Meals", amount=200.0, expense_date="2026-10-13")])
    base.update(kw)
    doc = _Claim(base)
    comments: list[str] = []
    doc["comments"] = comments
    doc["add_comment"] = lambda kind, text: comments.append(text)

    def submit():
        doc["docstatus"] = 1
        doc["status"] = "Rejected" if doc["approval_status"] == "Rejected" else "Unpaid"

    doc["submit"] = submit
    return doc


def _store():
    s = _Store()
    s["DocType"] = ["HR Alert"]
    s["Employee"] = [
        {"name": "HR-EMP-0044", "user_id": "thandi@x", "employee_name": "Thandi Mamba", "status": "Active", "company": "ESWASA", "expense_approver": "sipho@x"},
        {"name": "HR-EMP-0010", "user_id": "sipho@x", "employee_name": "Sipho Dlamini", "status": "Active", "company": "ESWASA", "expense_approver": "sipho@x"},
    ]
    s["Has Role"] = [{"parent": "fin@x", "role": "Accounts Manager", "parenttype": "User"}, {"parent": "fin2@x", "role": "Accounts Manager", "parenttype": "User"},
                     {"parent": "Administrator", "role": "Accounts Manager", "parenttype": "User"}]
    s["User"] = [{"name": "fin@x", "enabled": 1}, {"name": "fin2@x", "enabled": 0}]
    return s


class GlueTests(unittest.TestCase):
    def setUp(self):
        self._saved = (ex._hr_managers, ex._holidays, scope.viewer_for)
        ex._hr_managers = lambda exclude=None: [u for u in ("hr1@x", "hr2@x") if u != exclude]
        ex._holidays = lambda employee: set()

    def tearDown(self):
        ex._hr_managers, ex._holidays, scope.viewer_for = self._saved
        for m in ("frappe", "frappe.utils"):
            sys.modules.pop(m, None)

    def _open(self, store, ref="Expense Claim"):
        return [t for t in store.rows("ToDo") if t["status"] == "Open" and t["reference_type"] == ref]

    def test_new_claim_routes_to_the_named_approver_once(self):
        store = _store()
        _fake_frappe(store, user="thandi@x", roles=("Employee",))
        doc = _claim()
        ex.sync_todo(doc)
        ex.sync_todo(doc)
        todos = self._open(store)
        self.assertEqual([t["allocated_to"] for t in todos], ["sipho@x"])
        self.assertEqual(todos[0]["description"], "Approve expense claim for Thandi Mamba, SZL 320.00")
        self.assertEqual(todos[0]["date"], "2026-10-21")  # Fri + 3 working days
        self.assertEqual(store.rows("HR Alert"), [])

    def test_self_approver_raises_one_alert_to_hr_managers(self):
        store = _store()
        _fake_frappe(store, user="thandi@x", roles=("Employee",))
        doc = _claim(expense_approver="thandi@x")
        ex.sync_todo(doc)
        ex.sync_todo(doc)
        self.assertEqual(self._open(store), [])
        self.assertEqual(len(store.rows("HR Alert")), 1)
        self.assertEqual(store.rows("HR Alert")[0]["rule"], ex.RULE_APPROVER)
        self.assertEqual(sorted(t["allocated_to"] for t in self._open(store, "HR Alert")), ["hr1@x", "hr2@x"])

    def test_approver_approves_submits_and_closes_the_todo(self):
        store = _store()
        f = _fake_frappe(store, user="sipho@x", roles=("Expense Approver",))
        doc = _claim()
        ex.sync_todo(doc)
        f.get_doc = lambda d, *a: doc
        out = ex.decide(doc.name, "approve")
        self.assertEqual((out["status"], doc.docstatus, doc.approval_status), ("Approved", 1, "Approved"))
        self.assertEqual([line.sanctioned_amount for line in doc.expenses], [120.0, 200.0])
        self.assertEqual(self._open(store), [])

    def test_four_eyes_on_decide(self):
        store = _store()
        f = _fake_frappe(store, user="thandi@x", roles=("HR Manager",))
        doc = _claim()
        f.get_doc = lambda d, *a: doc
        with self.assertRaises(f.PermissionError):
            ex.decide(doc.name, "approve")
        sys.modules["frappe"].session.user = "zanele@x"
        sys.modules["frappe"].get_roles = lambda *a: ["Employee"]
        with self.assertRaises(f.PermissionError):
            ex.decide(doc.name, "approve")
        self.assertEqual(doc.docstatus, 0)

    def test_reject_needs_a_note_and_decided_claims_are_final(self):
        store = _store()
        f = _fake_frappe(store, user="sipho@x", roles=("Expense Approver",))
        doc = _claim()
        f.get_doc = lambda d, *a: doc
        with self.assertRaises(f.ValidationError):
            ex.decide(doc.name, "reject", " ")
        out = ex.decide(doc.name, "reject", "No receipt for the meal")
        self.assertEqual((out["status"], doc.status), ("Rejected", "Rejected"))
        self.assertEqual(doc.comments, ["No receipt for the meal"])
        with self.assertRaises(f.ValidationError):
            ex.decide(doc.name, "approve")

    def test_overdue_claim_escalates_to_named_finance_once(self):
        store = _store()
        _fake_frappe(store, user="Administrator", roles=("System Manager",), today="2026-10-22")
        store["Expense Claim"] = [{"name": "HR-EXP-0001", "employee": "HR-EMP-0044", "employee_name": "Thandi Mamba", "approval_status": "Draft",
                                   "docstatus": 0, "expense_approver": "sipho@x", "total_claimed_amount": 320.0}]
        store["ToDo"] = [{"name": "T-1", "reference_type": "Expense Claim", "reference_name": "HR-EXP-0001", "allocated_to": "sipho@x",
                          "status": "Open", "date": "2026-10-21"}]
        self.assertEqual(ex.escalate_overdue(), 1)
        self.assertEqual(ex.escalate_overdue(), 0)
        alerts = store.rows("HR Alert")
        self.assertEqual((len(alerts), alerts[0]["rule"]), (1, ex.RULE_OVERDUE))
        self.assertEqual([t["allocated_to"] for t in self._open(store, "HR Alert")], ["fin@x"])  # enabled, named, not Administrator
        self.assertEqual(len(self._open(store)), 1)  # the approver's ToDo stays

    def test_not_yet_due_or_decided_claims_do_not_escalate(self):
        store = _store()
        _fake_frappe(store, user="Administrator", roles=("System Manager",), today="2026-10-21")
        store["Expense Claim"] = [{"name": "HR-EXP-0001", "approval_status": "Draft", "docstatus": 0, "employee": "HR-EMP-0044"},
                                  {"name": "HR-EXP-0002", "approval_status": "Approved", "docstatus": 1, "employee": "HR-EMP-0044"}]
        store["ToDo"] = [{"name": "T-1", "reference_type": "Expense Claim", "reference_name": "HR-EXP-0001", "status": "Open", "date": "2026-10-21"},
                         {"name": "T-2", "reference_type": "Expense Claim", "reference_name": "HR-EXP-0002", "status": "Open", "date": "2026-10-01"}]
        self.assertEqual(ex.escalate_overdue(), 0)

    def test_submit_creates_a_draft_for_the_callers_employee(self):
        store = _store()
        f = _fake_frappe(store, user="thandi@x", roles=("Employee",))
        f.db.get_single_value = lambda dt, fn: None
        out = ex.submit_impl([_line()], "Site visit", [{"file_name": "taxi.pdf", "url": "https://media.x/hr/taxi.pdf"}])
        claim = store.rows("Expense Claim")[0]
        self.assertEqual((claim["employee"], claim["expense_approver"], claim["approval_status"]), ("HR-EMP-0044", "sipho@x", "Draft"))
        self.assertEqual(claim["expenses"][0]["custom_receipt"], "taxi.pdf")
        self.assertEqual(store.rows("File")[0]["attached_to_name"], out["name"])
        self.assertEqual(out["approver"], "sipho@x")

    def test_submit_refuses_a_missing_receipt_or_approver(self):
        store = _store()
        f = _fake_frappe(store, user="thandi@x", roles=("Employee",))
        f.db.get_single_value = lambda dt, fn: None
        with self.assertRaises(f.ValidationError):
            ex.submit_impl([_line(receipt=None)], "x", [])
        store["Employee"][0]["expense_approver"] = None
        with self.assertRaises(f.ValidationError):
            ex.submit_impl([_line()], "x", [{"file_name": "taxi.pdf", "url": "https://media.x/a"}])
        self.assertEqual(store.rows("Expense Claim"), [])

    def test_lists_are_scoped(self):
        store = _store()
        _fake_frappe(store, user="zanele@x", roles=("Employee",))
        store["Expense Claim"] = [
            {"name": "E-1", "employee": "HR-EMP-0044", "expense_approver": "sipho@x", "approval_status": "Draft", "docstatus": 0},
            {"name": "E-2", "employee": "HR-EMP-0050", "expense_approver": "zanele@x", "approval_status": "Draft", "docstatus": 0},
            {"name": "E-3", "employee": "HR-EMP-0051", "expense_approver": "sipho@x", "approval_status": "Draft", "docstatus": 0},
        ]
        scope.viewer_for = lambda user=None: scope.Viewer(user="zanele@x", roles=["Employee"], employee="HR-EMP-0050")
        self.assertEqual([r["id"] for r in ex.list_impl()], ["E-2"])
        scope.viewer_for = lambda user=None: scope.Viewer(user="sipho@x", roles=["Employee"], employee="HR-EMP-0010")
        self.assertEqual([r["id"] for r in ex.list_impl()], ["E-1", "E-3"])
        scope.viewer_for = lambda user=None: scope.Viewer(user="fin@x", roles=["Accounts Manager"])
        self.assertEqual(len(ex.list_impl()), 3)

    def test_detail_refuses_someone_elses_claim(self):
        store = _store()
        f = _fake_frappe(store, user="zanele@x", roles=("Employee",))
        store["Expense Claim"] = [{"name": "E-1", "employee": "HR-EMP-0044", "expense_approver": "sipho@x"}]
        doc = _claim(name="E-1")
        f.get_doc = lambda d, *a: doc
        scope.viewer_for = lambda user=None: scope.Viewer(user="zanele@x", roles=["Employee"], employee="HR-EMP-0050")
        with self.assertRaises(f.PermissionError):
            ex.detail_impl("E-1")
        scope.viewer_for = lambda user=None: scope.Viewer(user="thandi@x", roles=["Employee"], employee="HR-EMP-0044")
        out = ex.detail_impl("E-1")
        self.assertEqual([line["expense_type"] for line in out["lines"]], ["Travel", "Meals"])


if __name__ == "__main__":
    unittest.main()
