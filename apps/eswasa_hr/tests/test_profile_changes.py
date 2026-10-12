"""Profile change requests (plan 06, E5) — job and pay fields refused, evidence for a name, four-eyes, access log on apply."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from eswasa_hr import profile_changes as pc
from eswasa_hr.sensitive import LEVELS, PAY, PERSONAL


class RuleTests(unittest.TestCase):
    def test_job_and_pay_fields_are_refused(self):
        for field, _label in LEVELS[PAY]["fields"]:
            self.assertIn("HR Manager", pc.field_error(field))
        for field in ("department", "designation", "grade", "reports_to", "employment_type", "employee_name"):
            self.assertIn("promotion", pc.field_error(field))
        self.assertIn("can't be changed", pc.field_error("user_id_x"))
        self.assertFalse(set(pc.ALLOWED) & {f for f, _ in LEVELS[PAY]["fields"]})
        self.assertFalse(set(pc.ALLOWED) & set(pc.JOB))

    def test_personal_fields_are_level_one(self):
        level1 = {f for f, _ in LEVELS[PERSONAL]["fields"]}
        self.assertLessEqual(set(pc.PERSONAL), level1)

    def test_request_rules(self):
        self.assertEqual(pc.request_errors("cell_number", "7600 0000", "New number", None, "7612 3456"), [])
        self.assertIn("Say what it should be.", pc.request_errors("cell_number", " ", "x", None, None))
        self.assertIn("That's what your record already says.", pc.request_errors("cell_number", "7612 3456", "x", None, "7612 3456"))
        self.assertIn("Say why it needs changing.", pc.request_errors("cell_number", "1", "", None, None))

    def test_a_name_change_needs_evidence(self):
        self.assertTrue(any("evidence" in e for e in pc.request_errors("last_name", "Dlamini", "Married", None, "Mamba")))
        self.assertEqual(pc.request_errors("last_name", "Dlamini", "Married", "hr/evidence/cert.pdf", "Mamba"), [])

    def test_four_eyes(self):
        self.assertIsNone(pc.decider_error("hr2@x", ["HR User"], "thandi@x", "thandi@x"))
        self.assertIn("your own", pc.decider_error("hr1@x", ["HR Manager"], "hr1@x", "hr1@x"))
        self.assertIn("your own", pc.decider_error("hr1@x", ["HR Manager"], "someone@x", "hr1@x"))
        self.assertIn("Only HR", pc.decider_error("sipho@x", ["Employee"], "thandi@x", "thandi@x"))

    def test_titles(self):
        self.assertEqual(pc.todo_title("Thandi Mamba", "Mobile"), "Review profile change for Thandi Mamba: mobile")
        self.assertEqual(pc.log_reason("PCR-00001"), "Profile change PCR-00001")


def _store():
    return {
        "Employee": [{"name": "E1", "employee_name": "Thandi Mamba", "user_id": "thandi@x", "status": "Active", "cell_number": "7612 3456",
                      "last_name": "Mamba"},
                     {"name": "E5", "employee_name": "Hlobi HR", "user_id": "hr1@x", "status": "Active"}],
        "Has Role": [{"parent": "hr1@x", "role": "HR Manager", "parenttype": "User"}, {"parent": "hr2@x", "role": "HR User", "parenttype": "User"},
                     {"parent": "thandi@x", "role": "HR User", "parenttype": "User"}],
        "User": [{"name": "hr1@x", "enabled": 1}, {"name": "hr2@x", "enabled": 1}, {"name": "thandi@x", "enabled": 1}],
        "Profile Change Request": [],
        "HR Access Log": [],
        "ToDo": [],
    }


class GlueTests(unittest.TestCase):
    def setUp(self):
        self.store = _store()

    def _install(self, user, roles):
        from tests import _fakefrappe as ff

        self.addCleanup(ff.uninstall)
        f = ff.install(self.store, user=user, roles=roles, doctypes=("Profile Change Request", "HR Access Log"))
        base = f.get_doc
        store = self.store

        def get_doc(d, *a):
            if d == "Employee" and a:
                row = next(r for r in store["Employee"] if r["name"] == a[0])
                emp = SimpleNamespace(**row, flags=SimpleNamespace())
                emp.save = lambda: row.update({k: v for k, v in vars(emp).items() if k not in ("flags", "save")})
                return emp
            return base(d, *a)

        f.get_doc = get_doc
        return f

    def _submit(self, field="cell_number", value="7600 0000", evidence=None):
        self._install("thandi@x", ("Employee", "HR User"))
        out = pc.submit(field, value, "I changed my number", evidence, confirm=1)
        self.store["Profile Change Request"][-1]["owner"] = "thandi@x"
        return out

    def test_submit_routes_to_named_hr_except_the_person(self):
        out = self._submit()
        self.assertEqual((out["status"], out["current_value"], out["field_label"]), ("Pending", "7612 3456", "Mobile"))
        self.assertEqual(sorted(t["allocated_to"] for t in self.store["ToDo"]), ["hr1@x", "hr2@x"])
        self.assertEqual(self.store["ToDo"][0]["description"], "Review profile change for Thandi Mamba: mobile")
        f = self._install("thandi@x", ("Employee",))
        with self.assertRaisesRegex(f.ValidationError, "already asked"):
            pc.submit("cell_number", "7600 1111", "again", confirm=1)

    def test_job_field_refused_at_submit(self):
        f = self._install("thandi@x", ("Employee",))
        with self.assertRaisesRegex(f.ValidationError, "promotion"):
            pc.submit("designation", "Manager", "I deserve it", confirm=1)
        with self.assertRaisesRegex(f.ValidationError, "HR Manager"):
            pc.submit("bank_ac_no", "999", "New bank", confirm=1)

    def test_the_requester_cannot_decide_their_own(self):
        out = self._submit()
        f = self._install("thandi@x", ("HR User",))
        with self.assertRaises(f.PermissionError):
            pc.decide(out["id"], "approve")

    def test_approve_writes_the_field_and_logs_it(self):
        out = self._submit()
        self._install("hr2@x", ("HR User",))
        res = pc.decide(out["id"], "approve")
        self.assertEqual(res["status"], "Approved")
        self.assertEqual(self.store["Employee"][0]["cell_number"], "7600 0000")
        log = self.store["HR Access Log"][0]
        self.assertEqual((log["employee"], log["viewer"], log["reason"], log["fields"], log["level"]),
                         ("E1", "hr2@x", f"Profile change {out['id']}", "cell_number", "Personal"))
        self.assertTrue(all(t["status"] == "Closed" for t in self.store["ToDo"]))
        f = self._install("hr1@x", ("HR Manager",))
        with self.assertRaisesRegex(f.ValidationError, "already decided"):
            pc.decide(out["id"], "reject", "late")

    def test_reject_needs_a_reason_and_writes_nothing(self):
        out = self._submit()
        f = self._install("hr1@x", ("HR Manager",))
        with self.assertRaises(f.ValidationError):
            pc.decide(out["id"], "reject")
        self.assertEqual(pc.decide(out["id"], "reject", "Send the new number from your work email.")["status"], "Rejected")
        self.assertEqual(self.store["Employee"][0]["cell_number"], "7612 3456")
        self.assertEqual(self.store["HR Access Log"], [])

    def test_name_change_without_evidence_is_refused(self):
        f = self._install("thandi@x", ("Employee",))
        with self.assertRaisesRegex(f.ValidationError, "evidence"):
            pc.submit("last_name", "Dlamini", "Married", confirm=1)


if __name__ == "__main__":
    unittest.main()
