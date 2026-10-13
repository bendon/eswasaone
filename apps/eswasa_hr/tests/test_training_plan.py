"""Training plan, needs, nominations, attendance and cost (additions plan 05) — pure rules, plus flows on a fake frappe."""

from __future__ import annotations

import unittest

from eswasa_hr import training_plan as tp
from tests import _fakefrappe as ff

LINE = {"topic": "ISO/IEC 17025 internal audit", "quarter": "Q2", "reason": "Accreditation", "people": 3, "estimated_direct": 4500, "estimated_indirect": 800}


class RuleTests(unittest.TestCase):
    def test_plan_errors(self):
        self.assertEqual(tp.plan_errors([LINE]), [])
        self.assertIn("at least one line", tp.plan_errors([])[0])
        errs = tp.plan_errors([{"topic": " ", "quarter": "Q5", "estimated_direct": -1}])
        self.assertEqual(len(errs), 3)
        self.assertIn("Line 1", errs[0])
        self.assertIn("negative", tp.plan_errors([{**LINE, "people": -2}])[0])

    def test_plan_totals(self):
        lines = [{**LINE, "event": "EV-1"}, {**LINE, "people": 2, "estimated_direct": 1000, "estimated_indirect": 0}]
        t = tp.plan_totals(lines, {"EV-1": {"custom_direct_cost": 4000, "custom_indirect_cost": 650}})
        self.assertEqual((t["lines"], t["people"], t["scheduled"]), (2, 5, 1))
        self.assertEqual((t["estimated_direct"], t["estimated_indirect"], t["estimated"]), (5500, 800, 6300))
        self.assertEqual((t["actual_direct"], t["actual_indirect"], t["actual"]), (4000, 650, 4650))

    def test_four_eyes(self):
        self.assertIsNone(tp.decider_error("hrm2@x", ["HR Manager"], "hrm@x", "Waiting"))
        self.assertIn("another HR Manager", tp.decider_error("hrm@x", ["HR Manager"], "hrm@x", "Waiting"))
        self.assertIn("Only an HR Manager", tp.decider_error("hr@x", ["HR User"], "hrm@x", "Waiting"))
        self.assertIn("isn't waiting", tp.decider_error("hrm2@x", ["HR Manager"], "hrm@x", "Approved"))

    def test_schedule_only_from_an_approved_plan(self):
        self.assertIsNone(tp.schedule_error("Approved", None))
        self.assertIn("approved plan", tp.schedule_error("Waiting", None))
        self.assertIn("already scheduled", tp.schedule_error("Approved", "EV-1"))

    def test_nominee_outside_scope(self):
        self.assertEqual(tp.nominate_errors(["EMP-7"], None), [])
        self.assertEqual(tp.nominate_errors(["EMP-7"], ["EMP-7"]), [])
        self.assertIn("EMP-9", tp.nominate_errors(["EMP-7", "EMP-9"], ["EMP-7"])[0])
        self.assertIn("Choose", tp.nominate_errors([], None)[0])

    def test_needs_met_and_misc(self):
        needs = [{"name": "N1", "employee": "EMP-7", "status": "Planned"}, {"name": "N2", "employee": "EMP-8", "status": "Planned"},
                 {"name": "N3", "employee": "EMP-7", "status": "Dropped"}]
        present = tp.present_of([{"employee": "EMP-7", "present": True}, {"employee": "EMP-8", "present": False}])
        self.assertEqual(tp.needs_met(needs, present), ["N1"])
        self.assertEqual(tp.split_names("N1\n N2, N1\n"), ["N1", "N2"])
        self.assertEqual(tp.need_key("AUTH-1"), "need:auth:AUTH-1")
        self.assertTrue(tp.plan_title("ICT", "2026").startswith("Approve "))  # an approve card in Approvals
        self.assertEqual(tp.setup_state(["A", "B"], ["A"]), "partial")
        self.assertEqual(tp.setup_state(["A"], ["A"]), "done")
        self.assertEqual(tp.cost_errors(10, -1), ["Costs can't be negative."])


class FlowTests(unittest.TestCase):
    def setUp(self):
        self.store = {
            "Employee": [
                {"name": "EMP-7", "employee_name": "Gcina Mavuso", "status": "Active", "department": "ICT", "user_id": "gcina@x", "reports_to": "EMP-2"},
                {"name": "EMP-2", "employee_name": "Busi Fakudze", "status": "Active", "department": "ICT", "user_id": "busi@x"},
                {"name": "EMP-9", "employee_name": "Other Person", "status": "Active", "department": "Finance", "user_id": "other@x"},
            ],
            "Department": [{"name": "ICT", "is_group": 0, "disabled": 0, "custom_head": "EMP-2", "company": "ESWASA"},
                           {"name": "Finance", "is_group": 0, "disabled": 0}],
            "Fiscal Year": [{"name": "2026", "year_start_date": "2026-04-01", "year_end_date": "2027-03-31"}],
            "Has Role": [{"parent": "hrm@x", "role": "HR Manager", "parenttype": "User"}, {"parent": "hrm2@x", "role": "HR Manager", "parenttype": "User"}],
            "User": [{"name": "hrm@x", "enabled": 1}, {"name": "hrm2@x", "enabled": 1}],
            "Skill": [{"name": "Mass"}],
        }
        self.addCleanup(ff.uninstall)

    def _as(self, user, roles):
        f = ff.install(self.store, user=user, roles=roles, today="2026-10-16",
                       doctypes=(tp.NEED, tp.PLAN, tp.EVENT, "HR Alert", "Fiscal Year", "Staff Authorisation"),
                       meta_fields={tp.EVENT: ("custom_plan_line", "custom_skill", "custom_direct_cost", "custom_indirect_cost"),
                                    tp.EVENT_ROW: ("status", "attendance")})
        f.db.delete = lambda dt, flt: self.store.__setitem__(dt, [r for r in self.store.get(dt, []) if not ff.match(r, flt)])
        return f

    def _need(self, employee="EMP-7"):
        self._as("hr@x", ("HR User",))
        tp.raise_need_impl(employee, "Mass calibration refresher", "Mass")
        return self.store[tp.NEED][-1]["name"]

    def _approved_plan(self):
        need = self._need()
        self._as("hrm@x", ("HR Manager",))
        out = tp.save_plan_impl("ICT", "2026", [{**LINE, "needs": need}], submit=True)
        self._as("hrm2@x", ("HR Manager",))
        tp.decide(out["name"], "approve")
        return out["name"], self.store[tp.LINE][0]["name"], need

    def test_needs_scope(self):
        self._need()
        f = self._as("other@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            tp.raise_need_impl("EMP-7", "Anything")
        self.assertEqual(tp.needs_impl()["needs"], [])
        self._as("busi@x", ("Employee",))
        self.assertEqual(len(tp.needs_impl()["needs"]), 1)
        self._as("gcina@x", ("Employee",))
        tp.raise_need_impl("EMP-7", "Excel for reports")
        self.assertEqual(self.store[tp.NEED][-1]["source"], "Self")

    def test_plan_flow_four_eyes_and_one_per_department_year(self):
        need = self._need()
        self._as("hrm@x", ("HR Manager",))
        out = tp.save_plan_impl("ICT", "2026", [{**LINE, "needs": need}], submit=True)
        self.assertEqual(out["status"], "Waiting")
        self.assertEqual(out["deciders"], ["hrm2@x"])
        todo = self.store["ToDo"][0]
        self.assertEqual((todo["allocated_to"], todo["description"]), ("hrm2@x", "Approve training plan ICT 2026"))
        self.assertEqual(self.store[tp.NEED][0]["plan"], out["name"])
        f = self._as("hrm@x", ("HR Manager",))
        with self.assertRaisesRegex(f.PermissionError, "another HR Manager"):
            tp.decide(out["name"], "approve")
        with self.assertRaisesRegex(f.ValidationError, "already has a training plan"):
            tp.save_plan_impl("ICT", "2026", [LINE])
        f = self._as("hrm2@x", ("HR Manager",))
        with self.assertRaisesRegex(f.ValidationError, "what to change"):
            tp.decide(out["name"], "reject")
        tp.decide(out["name"], "reject", "Add the cost of travel")
        self.assertEqual(self.store[tp.PLAN][0]["status"], "Sent back")
        self.assertEqual(self.store["HR Alert"][0]["rule"], "Training plan")
        self.assertEqual(todo["status"], "Closed")

    def test_head_prepares_own_department_only(self):
        f = self._as("busi@x", ("Employee",))
        out = tp.save_plan_impl("ICT", "2026", [LINE])
        self.assertEqual(out["status"], "Draft")
        with self.assertRaises(f.PermissionError):
            tp.save_plan_impl("Finance", "2026", [LINE])
        with self.assertRaisesRegex(f.ValidationError, "Line 1"):
            tp.save_plan_impl("ICT", "2026", [{"topic": "", "quarter": "Q1"}], name=out["name"])

    def test_schedule_only_from_an_approved_plan(self):
        need = self._need()
        f = self._as("hrm@x", ("HR Manager",))
        out = tp.save_plan_impl("ICT", "2026", [{**LINE, "needs": need}])
        line = self.store[tp.LINE][0]["name"]
        with self.assertRaisesRegex(f.ValidationError, "approved plan"):
            tp.schedule_line_impl(out["name"], line, "2026-11-02", "2026-11-03")

    def test_schedule_nominate_attend_cost(self):
        plan, line, need = self._approved_plan()
        self._as("hr@x", ("HR User",))
        out = tp.schedule_line_impl(plan, line, "2026-11-02", "2026-11-03", "Mbabane", "SADCAS")
        ev = self.store[tp.EVENT][0]
        self.assertEqual((ev["event_name"], ev["custom_plan_line"], ev["start_time"], ev["company"]), (LINE["topic"], line, "2026-11-02 09:00:00", "ESWASA"))
        self.assertEqual(out["lines"][0]["event"], ev["name"])
        self.assertEqual(self.store[tp.NEED][0]["status"], "Planned")
        f = self._as("hr@x", ("HR User",))
        with self.assertRaisesRegex(f.ValidationError, "already scheduled"):
            tp.schedule_line_impl(plan, line, "2026-11-02", "2026-11-03")

        # the line manager nominates only their team
        f = self._as("busi@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            tp.nominate_impl(ev["name"], ["EMP-9"])
        res = tp.nominate_impl(ev["name"], ["EMP-7"])
        self.assertEqual([n["employee"] for n in res["nominees"]], ["EMP-7"])
        self.assertEqual(self.store[tp.EVENT_ROW][0]["status"], "Invited")
        self.assertEqual(self.store.get("HR Notification", []), [])  # outbox not installed in this fake: nothing queued

        f = self._as("busi@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            tp.attendance_impl(ev["name"], [{"employee": "EMP-7", "present": True}])
        self._as("hr@x", ("HR User",))
        tp.attendance_impl(ev["name"], [{"employee": "EMP-7", "present": True}])
        self.assertEqual(self.store[tp.EVENT_ROW][0]["attendance"], "Present")
        self.assertEqual(self.store[tp.NEED][0]["status"], "Met")

        f = self._as("hr@x", ("HR User",))
        with self.assertRaises(f.ValidationError):
            tp.cost_impl(ev["name"], -5, 0)
        res = tp.cost_impl(ev["name"], 4000, 650)
        self.assertEqual((res["direct_cost"], res["indirect_cost"]), (4000, 650))
        self.assertEqual(tp.plan_impl(plan)["totals"]["actual"], 4650)

        self._as("gcina@x", ("Employee",))
        mine = tp.my_training_impl()
        self.assertEqual(len(mine["upcoming"]), 1)
        self.assertEqual(mine["needs"][0]["status"], "Met")

    def test_expiring_authorisation_raises_one_need(self):
        self.store["Staff Authorisation"] = [{"name": "AUTH-1", "docstatus": 1, "status": "Expiring", "employee": "EMP-7", "skill": "Mass", "valid_to": "2026-11-30"}]
        self._as("Administrator", ("System Manager",))
        self.assertEqual(tp.training_needs(), 1)
        self.assertEqual(tp.training_needs(), 0)
        n = self.store[tp.NEED][0]
        self.assertEqual((n["source"], n["source_name"], n["key"], n["priority"]), ("Authorisation expiry", "AUTH-1", "need:auth:AUTH-1", "High"))

    def test_review_needs(self):
        self._as("busi@x", ("Employee",))
        self.assertEqual(tp.review_need_errors([{"topic": ""}]), ["Training need 1: say what training is needed."])
        self.assertEqual(tp.needs_from_review("EMP-7", [{"topic": "Report writing"}, {"topic": " "}], "APR-1"), 1)
        self.assertEqual((self.store[tp.NEED][0]["source"], self.store[tp.NEED][0]["source_name"]), ("Appraisal", "APR-1"))

    def test_setup_step_and_board(self):
        self._approved_plan()
        self._as("hrm@x", ("HR Manager",))
        s = tp.setup_step()
        self.assertEqual((s["state"], s["title"]), ("partial", "Training plans for 2026"))
        b = tp.board_block()
        self.assertEqual((b["plans"], b["planned_people"], b["estimated_cost"], b["attended"]), (1, 3, 5300, 0))
        self.assertEqual(tp.waiting_count(), 0)


if __name__ == "__main__":
    unittest.main()
