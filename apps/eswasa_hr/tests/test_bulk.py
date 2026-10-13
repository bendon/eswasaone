"""Bulk actions decided in Approvals (additions plan 06) — pure rules, plus flows on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date

from eswasa_hr import bulk_actions as ba
from tests import _fakefrappe as ff

# Christmas 2026: Fri 25 Dec and Mon 28 Dec are public holidays; closure Thu 24 Dec – Fri 1 Jan.
HOLIDAYS = {date(2026, 12, 25), date(2026, 12, 28), date(2027, 1, 1)}
PERSON = {"name": "EMP-7", "employee_name": "Gcina Mavuso", "status": "Active", "date_of_joining": "2020-01-06"}


class RuleTests(unittest.TestCase):
    def test_working_dates_skip_weekends_and_holidays(self):
        days = ba.working_dates("2026-12-24", "2027-01-01", HOLIDAYS)
        self.assertEqual([d.isoformat() for d in days], ["2026-12-24", "2026-12-29", "2026-12-30", "2026-12-31"])

    def test_closure_preview_balance_and_holidays(self):
        r = ba.closure_row(PERSON, "2026-12-24", "2027-01-01", HOLIDAYS, 10.0, [])
        self.assertEqual((r["days"], r["balance_after"], r["problem"]), (4.0, 6.0, None))
        self.assertIn("4 days off, balance 10 → 6", r["planned"])
        self.assertEqual(r["segments"], [("2026-12-24", "2026-12-31")])  # the weekend and holidays don't split it
        low = ba.closure_row(PERSON, "2026-12-24", "2027-01-01", HOLIDAYS, 2.0, [])
        self.assertIn("Not enough balance (2 left)", low["problem"])
        self.assertIsNone(ba.closure_row(PERSON, "2026-12-24", "2027-01-01", HOLIDAYS, 2.0, [], allow_negative=True)["problem"])
        self.assertIn("No leave allocated", ba.closure_row(PERSON, "2026-12-24", "2027-01-01", HOLIDAYS, None, [])["problem"])

    def test_closure_preview_overlap_skips_those_days(self):
        r = ba.closure_row(PERSON, "2026-12-24", "2027-01-01", HOLIDAYS, 10.0, [("2026-12-29", "2026-12-30")])
        self.assertEqual(r["days"], 2.0)
        self.assertIn("2 days already on leave", r["planned"])
        self.assertEqual(r["segments"], [("2026-12-24", "2026-12-24"), ("2026-12-31", "2026-12-31")])
        full = ba.closure_row(PERSON, "2026-12-24", "2027-01-01", HOLIDAYS, 10.0, [("2026-12-20", "2027-01-05")])
        self.assertIn("Already on leave", full["problem"])

    def test_closure_preview_joiner_and_inactive(self):
        late = ba.closure_row({**PERSON, "date_of_joining": "2027-01-04"}, "2026-12-24", "2027-01-01", HOLIDAYS, 10.0, [])
        self.assertEqual(late["problem"], "Joins after the closure.")
        mid = ba.closure_row({**PERSON, "date_of_joining": "2026-12-30"}, "2026-12-24", "2027-01-01", HOLIDAYS, 10.0, [])
        self.assertEqual(mid["days"], 2.0)
        self.assertEqual(ba.closure_row({**PERSON, "status": "Left"}, "2026-12-24", "2027-01-01", HOLIDAYS, 10.0, [])["problem"], "Not active.")
        rows = ba.closure_preview([PERSON], "2026-12-24", "2027-01-01", {"EMP-7": HOLIDAYS}, {"EMP-7": 5.0}, {})
        self.assertEqual(rows[0]["days"], 4.0)

    def test_allocation_preview(self):
        p = {"leave_type": "Annual Leave", "days": 21, "use_policy": False}
        rows = ba.allocation_preview([PERSON, {**PERSON, "name": "EMP-8"}, {**PERSON, "name": "EMP-9", "status": "Left"}], p, {"EMP-8"}, {})
        self.assertEqual(rows[0]["planned"], "Allocate 21 days of Annual Leave")
        self.assertIn("Already has an allocation", rows[1]["problem"])
        self.assertEqual(rows[2]["problem"], "Not active.")
        pol = ba.allocation_preview([PERSON, {**PERSON, "name": "EMP-8"}], {"use_policy": True, "carry_forward": True}, set(), {"EMP-7": "Grade A"})
        self.assertIn("Assign leave policy Grade A, carrying forward", pol[0]["planned"])
        self.assertEqual(pol[1]["problem"], "No leave policy for their grade.")

    def test_parameter_errors(self):
        self.assertEqual(ba.parameter_errors(ba.CLOSURE, {"leave_type": "Annual Leave", "from_date": "2026-12-24", "to_date": "2027-01-01"}), [])
        self.assertEqual(len(ba.parameter_errors(ba.CLOSURE, {"from_date": "2026-12-24", "to_date": "2026-12-20"})), 2)
        self.assertIn("at most a month", ba.parameter_errors(ba.CLOSURE, {"leave_type": "X", "from_date": "2026-11-01", "to_date": "2027-01-01"})[0])
        self.assertIn("number of days", ba.parameter_errors(ba.ALLOCATION, {"leave_type": "X", "from_date": "2026-01-01", "to_date": "2026-12-31"})[0])
        self.assertEqual(ba.parameter_errors(ba.ALLOCATION, {"use_policy": "1", "from_date": "2026-01-01", "to_date": "2026-12-31"}), [])
        self.assertIn("Choose", ba.parameter_errors("Termination", {})[0])

    def test_four_eyes(self):
        self.assertIsNone(ba.decider_error("hrm2@x", ["HR Manager"], "hrm@x", "Waiting"))
        self.assertIn("another HR Manager", ba.decider_error("hrm@x", ["HR Manager"], "hrm@x", "Waiting"))
        self.assertIn("includes you", ba.decider_error("hrm2@x", ["HR Manager"], "hrm@x", "Waiting", ["hrm2@x"]))
        self.assertIn("Only an HR Manager", ba.decider_error("hr@x", ["HR User"], "hrm@x", "Waiting"))
        self.assertIn("isn't waiting", ba.decider_error("hrm2@x", ["HR Manager"], "hrm@x", "Applied"))

    def test_misc(self):
        self.assertTrue(ba.approve_title(ba.CLOSURE, 12).startswith("Approve bulk office closure leave: 12 people"))
        self.assertEqual(ba.approve_title(ba.ALLOCATION, 1), "Approve bulk leave allocation: 1 person")
        self.assertEqual(ba.final_status([{"result": "Done"}, {"result": "Failed"}]), ba.PARTLY)
        self.assertEqual(ba.final_status([{"result": "Done"}]), ba.APPLIED)
        self.assertEqual(ba.to_apply([{"ref": "LA-1", "result": "Done"}, {"ref": None, "result": "Failed"}]), [{"ref": None, "result": "Failed"}])
        self.assertEqual(ba.kept_rows([{"employee": "A"}, {"employee": "B"}], ["B"]), [{"employee": "A"}])
        self.assertEqual(ba.selection_text({"departments": ["ICT"], "employment_types": []}), "Active staff in ICT")
        self.assertTrue(ba.is_bulk(ba.closure_description("HRB-1", "2026-12-24", "2027-01-01")))
        self.assertEqual(ba.reminder_key("X", "EMP-7", date(2026, 10, 16)), "bulkremind:X:EMP-7:2026-10-16")


class FlowTests(unittest.TestCase):
    def setUp(self):
        self.store = {
            "Employee": [
                {"name": "EMP-7", "employee_name": "Gcina Mavuso", "status": "Active", "department": "ICT", "user_id": "gcina@x",
                 "date_of_joining": "2020-01-06", "employment_type": "Permanent", "company": "ESWASA"},
                {"name": "EMP-8", "employee_name": "Lindiwe Dlamini", "status": "Active", "department": "ICT", "user_id": "lindiwe@x",
                 "date_of_joining": "2021-03-01", "employment_type": "Permanent", "company": "ESWASA"},
                {"name": "EMP-9", "employee_name": "Other Person", "status": "Active", "department": "Finance", "user_id": None,
                 "date_of_joining": "2021-03-01", "employment_type": "Permanent", "company": "ESWASA"},
                {"name": "EMP-3", "employee_name": "Hlobi Manager", "status": "Active", "department": "HR", "user_id": "hrm2@x",
                 "date_of_joining": "2019-03-01", "employment_type": "Permanent", "company": "ESWASA"},
            ],
            "Leave Type": [{"name": "Annual Leave", "allow_negative": 0}],
            "Leave Allocation": [{"name": "ALLOC-7", "employee": "EMP-7", "leave_type": "Annual Leave", "docstatus": 1, "from_date": "2026-01-01", "to_date": "2026-12-31"},
                                 {"name": "ALLOC-8", "employee": "EMP-8", "leave_type": "Annual Leave", "docstatus": 1, "from_date": "2026-01-01", "to_date": "2026-12-31"}],
            "Leave Application": [],
            "Has Role": [{"parent": "hrm@x", "role": "HR Manager", "parenttype": "User"}, {"parent": "hrm2@x", "role": "HR Manager", "parenttype": "User"},
                         {"parent": "hrm3@x", "role": "HR Manager", "parenttype": "User"}],
            "User": [{"name": "hrm@x", "enabled": 1}, {"name": "hrm2@x", "enabled": 1}, {"name": "hrm3@x", "enabled": 1}],
        }
        self.balances = {"EMP-7": 10.0, "EMP-8": 3.0}
        self.queued: list[dict] = []
        self.addCleanup(ff.uninstall)
        self.addCleanup(lambda: [sys.modules.pop(m, None) for m in ("hrms", "hrms.hr", "hrms.hr.doctype", "hrms.hr.doctype.leave_application",
                                                                    "hrms.hr.doctype.leave_application.leave_application")])

    def _as(self, user, roles):
        f = ff.install(self.store, user=user, roles=roles, today="2026-10-16",
                       doctypes=(ba.ACTION, ba.ROW, "HR Issued Item", "HR Notification", "Employee Document", "Required Document"))
        f.db.delete = lambda dt, flt: self.store.__setitem__(dt, [r for r in self.store.get(dt, []) if not ff.match(r, flt)])
        f.enqueue = lambda method, **kw: self.queued.append({"method": method, **kw})
        store = self.store

        class _New(ff.Doc):
            def insert(self, ignore_permissions=False):
                rows = store.setdefault(self["doctype"], [])
                self["name"] = self.get("name") or f"{self['doctype'][:4].upper()}-{len(rows) + 1}"
                self.setdefault("docstatus", 0)
                rows.append(self)
                return self

            def submit(self):
                if self["doctype"] == "Leave Application" and self.get("employee") == "EMP-BOOM":
                    raise RuntimeError("HRMS refused")
                self["docstatus"] = 1
                return self

        base = f.get_doc
        f.get_doc = lambda d, *a: _New(d) if isinstance(d, dict) else base(d, *a)
        # HRMS's ledger balance, stubbed per person
        mod = types.ModuleType("hrms.hr.doctype.leave_application.leave_application")
        mod.get_leave_balance_on = lambda emp, lt, day: self.balances.get(emp, 0)
        for m in ("hrms", "hrms.hr", "hrms.hr.doctype", "hrms.hr.doctype.leave_application"):
            sys.modules[m] = types.ModuleType(m)
        sys.modules["hrms.hr.doctype.leave_application.leave_application"] = mod
        return f

    def _closure(self, **kw):
        return {"leave_type": "Annual Leave", "from_date": "2026-12-24", "to_date": "2027-01-01", **kw}

    def test_preview_writes_nothing(self):
        self._as("hr@x", ("HR User",))
        before = {k: len(v) for k, v in self.store.items() if isinstance(v, list) and v}
        out = ba.preview_impl(ba.CLOSURE, self._closure(), {"departments": ["ICT"]})
        self.assertEqual([r["employee"] for r in out["rows"]], ["EMP-7", "EMP-8"])
        self.assertEqual(out["rows"][1]["problem"], "Not enough balance (3 left).")
        self.assertEqual(out["problems"], 1)
        self.assertEqual({k: len(v) for k, v in self.store.items() if isinstance(v, list) and v}, before)

    def test_only_hr(self):
        f = self._as("gcina@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            ba.preview_impl(ba.CLOSURE, self._closure(), {})

    def _waiting(self, exclude=()):
        self._as("hrm@x", ("HR Manager",))
        return ba.create_impl(ba.CLOSURE, self._closure(), {"departments": ["ICT"]}, list(exclude), submit=True)

    def test_create_submit_routes_to_named_managers_not_preparer(self):
        out = self._waiting()
        self.assertEqual(out["status"], "Waiting")
        self.assertEqual(out["deciders"], ["hrm2@x", "hrm3@x"])
        todo = self.store["ToDo"][0]
        self.assertEqual(todo["description"], "Approve bulk office closure leave: 2 people")
        f = self._as("hrm@x", ("HR Manager",))
        with self.assertRaisesRegex(f.PermissionError, "another HR Manager"):
            ba.decide(out["name"], "approve")

    def test_person_included_cant_decide(self):
        self._as("hrm@x", ("HR Manager",))
        out = ba.create_impl(ba.CLOSURE, self._closure(), {"employees": ["EMP-7", "EMP-3"]}, submit=True)
        self.assertEqual(out["deciders"], ["hrm3@x"])
        f = self._as("hrm2@x", ("HR Manager",))
        with self.assertRaisesRegex(f.PermissionError, "includes you"):
            ba.decide(out["name"], "approve")

    def test_untick_excludes(self):
        out = self._waiting(exclude=["EMP-8"])
        self.assertEqual([r["employee"] for r in out["rows"]], ["EMP-7"])

    def test_send_back_needs_note(self):
        name = self._waiting()["name"]
        f = self._as("hrm2@x", ("HR Manager",))
        with self.assertRaisesRegex(f.ValidationError, "what to change"):
            ba.decide(name, "return")
        ba.decide(name, "return", "Leave out Finance")
        self.assertEqual(self.store[ba.ACTION][0]["status"], "Sent back")
        self.assertEqual(self.store["ToDo"][0]["status"], "Closed")
        self.assertEqual(self.queued, [])

    def test_approve_applies_partial_and_rerun_never_duplicates(self):
        name = self._waiting()["name"]
        self._as("hrm2@x", ("HR Manager",))
        ba.decide(name, "approve")
        self.assertEqual(self.store[ba.ACTION][0]["status"], "Applying")
        self.assertEqual(self.queued[0]["method"], "eswasa_hr.bulk_actions.apply_job")
        self.assertEqual(self.queued[0]["queue"], "long")
        self._as("Administrator", ("System Manager",))
        out = ba.apply_job(name)
        self.assertEqual(out["status"], "Partly applied")  # EMP-8 hasn't the balance
        rows = {r["employee"]: r for r in self.store[ba.ROW]}
        self.assertEqual(rows["EMP-7"]["result"], "Done")
        self.assertEqual(rows["EMP-8"]["result"], "Skipped")
        la = self.store["Leave Application"]
        self.assertEqual(len(la), 1)
        self.assertEqual((la[0]["status"], la[0]["docstatus"], la[0]["leave_approver"]), ("Approved", 1, "hrm2@x"))
        self.assertIn(f"(bulk {name})", la[0]["description"])
        # retry after HR tops up EMP-8: EMP-7 isn't repeated
        self.balances["EMP-8"] = 10.0
        ba.apply_job(name)
        self.assertEqual(len(self.store["Leave Application"]), 2)
        self.assertEqual(self.store[ba.ACTION][0]["status"], "Applied")
        ba.apply_job(name)  # Applied: nothing more to do
        self.assertEqual(len(self.store["Leave Application"]), 2)

    def test_failure_is_recorded_per_person(self):
        self.store["Employee"].append({"name": "EMP-BOOM", "employee_name": "Boom", "status": "Active", "department": "ICT",
                                       "date_of_joining": "2020-01-01", "company": "ESWASA"})
        self.store["Leave Allocation"].append({"name": "ALLOC-B", "employee": "EMP-BOOM", "leave_type": "Annual Leave", "docstatus": 1,
                                               "from_date": "2026-01-01", "to_date": "2026-12-31"})
        self.balances["EMP-BOOM"] = 10.0
        self.balances["EMP-8"] = 10.0
        name = self._waiting()["name"]
        self._as("hrm2@x", ("HR Manager",))
        ba.decide(name, "approve")
        out = ba.apply_job(name)
        self.assertEqual(out["status"], "Partly applied")
        self.assertEqual(out["summary"], "2 done, 0 skipped, 1 failed")
        boom = next(r for r in self.store[ba.ROW] if r["employee"] == "EMP-BOOM")
        self.assertEqual((boom["result"], boom["error"]), ("Failed", "HRMS refused"))

    def test_allocation_skips_existing(self):
        self._as("hrm@x", ("HR Manager",))
        p = {"leave_type": "Annual Leave", "from_date": "2026-01-01", "to_date": "2026-12-31", "days": 21}
        out = ba.preview_impl(ba.ALLOCATION, p, {"departments": ["ICT", "Finance"]})
        problems = {r["employee"]: r["problem"] for r in out["rows"]}
        self.assertEqual(problems, {"EMP-7": "Already has an allocation in this period.", "EMP-8": "Already has an allocation in this period.", "EMP-9": None})
        name = ba.create_impl(ba.ALLOCATION, p, {"departments": ["ICT", "Finance"]}, ["EMP-7", "EMP-8"], submit=True)["name"]
        self._as("hrm2@x", ("HR Manager",))
        ba.decide(name, "approve")
        self._as("Administrator", ("System Manager",))
        self.assertEqual(ba.apply_job(name)["status"], "Applied")
        alloc = self.store["Leave Allocation"][-1]
        self.assertEqual((alloc["employee"], alloc["new_leaves_allocated"], alloc["docstatus"]), ("EMP-9", 21.0, 1))
        self.assertIn(f"(bulk {name})", alloc["description"])

    def test_reminder_once_a_day(self):
        self.store["HR Issued Item"] = [{"name": "HRI-1", "employee": "EMP-7", "status": "Issued", "item_type": "Laptop", "tag": "LT-9"},
                                        {"name": "HRI-2", "employee": "EMP-9", "status": "Issued", "item_type": "Phone", "tag": None}]
        self._as("hr@x", ("HR User",))
        self.assertEqual(ba.remind_impl(ba.REMIND_ITEMS, {}, dry_run=True)["count"], 2)
        out = ba.remind_impl(ba.REMIND_ITEMS, {})
        self.assertEqual((out["sent"], out["skipped"]), (1, 1))  # EMP-9 has no login
        again = ba.remind_impl(ba.REMIND_ITEMS, {})
        self.assertEqual((again["sent"], again["skipped"]), (0, 2))
        msgs = self.store["HR Notification"]
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0]["template"], "bulk_reminder")


if __name__ == "__main__":
    unittest.main()
