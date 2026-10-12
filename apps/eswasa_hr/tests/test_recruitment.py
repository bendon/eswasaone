"""Recruitment part 1 (journey J2) — pure rules, plus apply and requisition decisions on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import recruitment as rc

TODAY = date(2026, 10, 12)


class RuleTests(unittest.TestCase):
    def test_vacancy_counts_open_requisitions(self):
        self.assertEqual(rc.vacant(5, 4, 0), 1)
        self.assertEqual(rc.vacant(5, 4, 1), 0)
        self.assertEqual(rc.vacant(2, 3, 0), 0)

    def test_live_openings(self):
        self.assertTrue(rc.opening_is_live("Open", 1, "2026-10-30", TODAY))
        self.assertTrue(rc.opening_is_live("Open", 1, None, TODAY))
        self.assertTrue(rc.opening_is_live("Open", 1, "2026-10-12", TODAY))  # closes at end of day
        self.assertFalse(rc.opening_is_live("Open", 1, "2026-10-11", TODAY))
        self.assertFalse(rc.opening_is_live("Open", 0, "2026-10-30", TODAY))
        self.assertFalse(rc.opening_is_live("Closed", 1, "2026-10-30", TODAY))

    def test_application_checks(self):
        self.assertEqual(rc.application_errors("Ayanda Mthethwa", "ayanda@example.com", True, True), [])
        errs = rc.application_errors("A", "not-an-email", False, False)
        self.assertEqual(len(errs), 4)
        self.assertIn("Attach your CV.", errs)

    def test_public_shape_hides_pay_unless_published(self):
        row = {"name": "HR-OPN-1", "job_title": "Certification Officer", "posted_on": "2026-10-12 09:00:00",
               "closes_on": "2026-10-30", "publish_salary_range": 0, "lower_range": 20000, "upper_range": 26000}
        self.assertNotIn("salary", rc.public_opening(row))
        self.assertEqual(rc.public_opening(row)["posted_on"], "2026-10-12")
        self.assertEqual(rc.public_opening({**row, "publish_salary_range": 1, "currency": "SZL"})["salary"]["upper"], 26000)


class _Err(Exception):
    pass


def _fake(user="guest", roles=("Guest",), applicants=None, reqs=None, todos=None):
    applicants = applicants if applicants is not None else []
    reqs = reqs if reqs is not None else {}
    todos = todos if todos is not None else []
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)
    openings = [{"name": "HR-OPN-1", "job_title": "Certification Officer", "designation": "Certification Officer",
                 "department": "Certification", "status": "Open", "closes_on": "2026-10-30", "posted_on": "2026-10-12"}]

    def get_all(dt, filters=None, fields=None, **kw):
        if dt == rc.OPENING:
            return openings
        if dt == "ToDo":
            return [{"name": t["name"]} for t in todos if t["reference_name"] == filters["reference_name"] and t["status"] == "Open"]
        return []

    f.get_all = get_all

    def exists(dt, key=None):
        if dt == rc.APPLICANT:
            return any(a["job_title"] == key["job_title"] and a["email_id"] == key["email_id"] for a in applicants)
        return False

    f.db = SimpleNamespace(
        exists=exists,
        get_value=lambda dt, name, field, *a, **k: "hsm@x" if (dt, field) == ("Employee", "user_id") else None,
        set_value=lambda dt, name, field, val: next(t for t in todos if t["name"] == name).__setitem__(field, val),
    )

    class Doc(SimpleNamespace):
        def insert(self, ignore_permissions=False):
            self.name = f"HR-APP-{len(applicants) + 1}"
            applicants.append(dict(self.__dict__))
            return self

        def save(self):
            return self

        def add_comment(self, kind, text):
            self.__dict__.setdefault("comments", []).append(text)

    f.get_doc = lambda d, *a: Doc(**d) if isinstance(d, dict) else reqs[a[0]]
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda v: date.fromisoformat(str(v))
    utils.nowdate = lambda: TODAY.isoformat()
    sys.modules["frappe"], sys.modules["frappe.utils"] = f, utils
    return f, applicants, todos


class FlowTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def test_apply_creates_an_open_applicant_once(self):
        f, applicants, _ = _fake()
        res = rc.apply_impl("HR-OPN-1", "Ayanda Mthethwa", " Ayanda@Example.com ", "+268 7600 0000", "I'd like to…", "media/careers/cv/abc.pdf", True)
        self.assertEqual(res["job_title"], "Certification Officer")
        a = applicants[0]
        self.assertEqual((a["status"], a["email_id"], a["resume_link"], a["job_title"]), ("Open", "ayanda@example.com", "media/careers/cv/abc.pdf", "HR-OPN-1"))
        with self.assertRaisesRegex(f.ValidationError, "already have an application"):
            rc.apply_impl("HR-OPN-1", "Ayanda Mthethwa", "ayanda@example.com", None, None, "x.pdf", True)

    def test_apply_refuses_closed_or_incomplete(self):
        f, _, _ = _fake()
        with self.assertRaises(f.DoesNotExistError):
            rc.apply_impl("HR-OPN-9", "Ayanda Mthethwa", "a@b.co", None, None, "x.pdf", True)
        with self.assertRaisesRegex(f.ValidationError, "Agree to ESWASA"):
            rc.apply_impl("HR-OPN-1", "Ayanda Mthethwa", "a@b.co", None, None, "x.pdf", False)

    def test_requisition_decisions(self):
        req = SimpleNamespace(name="HR-HIREQ-1", designation="Certification Officer", requested_by="EMP-09", status="Pending", comments=[])
        req.save = lambda: None
        req.add_comment = lambda k, t: req.comments.append(t)
        todos = [{"name": "TD-1", "reference_name": "HR-HIREQ-1", "status": "Open"}]

        f, _, _ = _fake(user="hsm@x", roles=("HR Manager",), reqs={"HR-HIREQ-1": req}, todos=todos)
        with self.assertRaisesRegex(f.PermissionError, "you raised"):
            rc.decide("HR-HIREQ-1", "approve")

        f, _, _ = _fake(user="hrm@x", roles=("Employee",), reqs={"HR-HIREQ-1": req}, todos=todos)
        with self.assertRaises(f.PermissionError):
            rc.decide("HR-HIREQ-1", "approve")

        f, _, _ = _fake(user="hrm@x", roles=("HR Manager",), reqs={"HR-HIREQ-1": req}, todos=todos)
        with self.assertRaisesRegex(f.ValidationError, "Say why"):
            rc.decide("HR-HIREQ-1", "reject")
        res = rc.decide("HR-HIREQ-1", "approve")
        self.assertEqual((res["status"], req.status, todos[0]["status"]), ("Open & Approved", "Open & Approved", "Closed"))
        with self.assertRaisesRegex(f.ValidationError, "already decided"):
            rc.decide("HR-HIREQ-1", "approve")


class StageRuleTests(unittest.TestCase):
    def test_requester_who_heads_the_department_skips_the_head_stage(self):
        self.assertEqual(rc.next_stage(None, requester_is_head=False), rc.STAGE_HEAD)
        self.assertEqual(rc.next_stage(None, requester_is_head=True), rc.STAGE_HR)
        self.assertEqual(rc.next_stage(rc.STAGE_HEAD), rc.STAGE_HR)
        self.assertEqual(rc.next_stage(rc.STAGE_HR), rc.STAGE_DONE)

    def test_four_eyes_across_stages(self):
        err = rc.stage_decider_error
        self.assertIsNone(err(rc.STAGE_HEAD, "head@x", ["Employee"], "hr@x", "head@x"))
        self.assertIn("head of the department", err(rc.STAGE_HEAD, "hrm@x", ["HR Manager"], "hr@x", "head@x"))
        self.assertIn("another HR Manager", err(rc.STAGE_HR, "head@x", ["HR Manager"], "hr@x", "head@x"))
        self.assertIsNone(err(rc.STAGE_HR, "hrm@x", ["HR Manager"], "head@x", "head@x"))
        self.assertIn("you raised", err(rc.STAGE_HR, "hrm@x", ["HR Manager"], "hrm@x", None))
        self.assertIn("HR Manager", err(rc.STAGE_HR, "hru@x", ["HR User"], "head@x", "head@x"))

    def test_patch_puts_legacy_rows_at_hr_or_done(self):
        from eswasa_hr.patches.v1 import requisition_stage

        rows = [{"name": "R-1", "status": "Pending"}, {"name": "R-2", "status": "Open & Approved"}, {"name": "R-3", "status": "Pending", "custom_stage": "Head"}]
        self.assertEqual(requisition_stage.updates(rows), [("R-1", "HR"), ("R-2", "Done")])


class StageFlowTests(unittest.TestCase):
    """Head → HR routing against the leave tests' fake frappe."""

    def setUp(self):
        from tests.test_leave import _Store, _fake_frappe

        self._hr = rc._hr_manager_users
        rc._hr_manager_users = lambda exclude=None: [u for u in ("head@x", "hrm1@x", "hrm2@x") if u != exclude]
        self.store = _Store()
        self.store["DocType"] = ["HR Alert"]
        self.store["Employee"] = [{"name": "E-HEAD", "user_id": "head@x"}, {"name": "E-REQ", "user_id": "req@x"}]
        self.store["Department"] = [{"name": "Certification", "custom_head": "E-HEAD"}, {"name": "Metrology", "custom_head": None}]
        self.f = _fake_frappe(self.store, user="head@x", roles=("Employee", "HR Manager"))
        sys.modules["frappe.utils"].add_days = lambda d, n: date.fromordinal(d.toordinal() + n)

    def tearDown(self):
        rc._hr_manager_users = self._hr
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def _req(self, dept="Certification", stage=rc.STAGE_HEAD, requester="E-REQ"):
        doc = SimpleNamespace(name="HR-HIREQ-1", designation="Certification Officer", department=dept, requested_by=requester,
                              status="Pending", custom_stage=stage, comments=[])
        doc.save = lambda: None
        doc.add_comment = lambda k, t: doc.comments.append(t)
        self.f.docs[doc.name] = doc
        return doc

    def _open(self):
        return sorted(t["allocated_to"] for t in self.store.rows("ToDo") if t["status"] == "Open" and t["reference_type"] == rc.REQ)

    def test_first_stage(self):
        self.assertEqual(rc._first_stage("Certification", "req@x"), (rc.STAGE_HEAD, False))
        self.assertEqual(rc._first_stage("Certification", "head@x"), (rc.STAGE_HR, False))
        self.assertEqual(rc._first_stage("Metrology", "req@x"), (rc.STAGE_HR, True))

    def test_no_head_raises_an_alert_and_goes_to_hr(self):
        doc = self._req(dept="Metrology", stage=rc.STAGE_HR)
        rc._no_head_alert(doc)
        rc._route_requisition(doc)
        self.assertEqual(self.store.rows("HR Alert")[0]["rule"], rc.RULE_NO_HEAD)
        self.assertIn("No head is set for Metrology", doc.comments[0])
        self.assertEqual(self._open(), ["head@x", "hrm1@x", "hrm2@x"])

    def test_head_then_another_hr_manager(self):
        doc = self._req()
        rc._route_requisition(doc)
        self.assertEqual(self._open(), ["head@x"])
        res = rc.decide(doc.name, "approve")
        self.assertEqual((doc.status, doc.custom_stage), ("Pending", rc.STAGE_HR))
        self.assertIn("sent to HR", res["message"])
        self.assertEqual(self._open(), ["hrm1@x", "hrm2@x"])  # never the head who approved
        with self.assertRaisesRegex(self.f.PermissionError, "another HR Manager"):
            rc.decide(doc.name, "approve")
        self.f.session.user = "hrm1@x"
        rc.decide(doc.name, "approve")
        self.assertEqual((doc.status, doc.custom_stage, self._open()), ("Open & Approved", rc.STAGE_DONE, []))

    def test_head_must_give_a_reason_to_reject(self):
        doc = self._req()
        with self.assertRaises(self.f.ValidationError):
            rc.decide(doc.name, "reject", " ")
        rc.decide(doc.name, "reject", "Not this year")
        self.assertEqual((doc.status, doc.custom_stage), ("Rejected", rc.STAGE_DONE))


if __name__ == "__main__":
    unittest.main()
