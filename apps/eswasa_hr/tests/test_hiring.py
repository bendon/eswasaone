"""Recruitment part 2 (journey J2) — pure rules, plus status, offer approval and answer on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from types import SimpleNamespace

from eswasa_hr import hiring as hi


class RuleTests(unittest.TestCase):
    def test_stage(self):
        self.assertEqual(hi.stage("Open", False, None, False), "Applied")
        self.assertEqual(hi.stage("Shortlisted", False, None, False), "Shortlist")
        self.assertEqual(hi.stage("Shortlisted", True, None, False), "Interview")
        self.assertEqual(hi.stage("Shortlisted", True, "Awaiting Response", False), "Offer")
        self.assertEqual(hi.stage("Rejected", True, "Rejected", False), "Not taken forward")
        self.assertEqual(hi.stage("Accepted", True, "Accepted", True), "Hired")

    def test_status_change_rules(self):
        self.assertIsNone(hi.status_change_error("Open", "Shortlisted", None))
        self.assertIn("Note why", hi.status_change_error("Open", "Rejected", " "))
        self.assertIsNone(hi.status_change_error("Open", "Rejected", "Missing ISO 9001 course"))
        self.assertIn("final", hi.status_change_error("Accepted", "Rejected", "x"))
        self.assertIn("Choose", hi.status_change_error("Open", "Accepted", None))

    def test_ratings_round_trip(self):
        self.assertEqual(hi.rating_to_frappe(4), 0.8)
        self.assertEqual(hi.rating_to_stars(0.8), 4.0)
        self.assertIsNone(hi.rating_to_stars(None))
        with self.assertRaises(ValueError):
            hi.rating_to_frappe(6)

    def test_titles(self):
        self.assertEqual(hi.offer_title("Ayanda Mthethwa", "Certification Officer"), "Approve offer: Ayanda Mthethwa, Certification Officer")
        self.assertEqual(hi.interview_todo_title("Ayanda Mthethwa", "2026-11-03", "10:00:00"),
                         "Interview Ayanda Mthethwa on 2026-11-03 at 10:00, then record your feedback")


class _Err(Exception):
    pass


def _fake(user, roles, docs, todos=None):
    todos = todos if todos is not None else []
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)
    f.get_doc = lambda dt, name=None: docs[name]
    f.get_all = lambda dt, filters=None, fields=None, **kw: [
        {"name": t["name"]} for t in todos if t["reference_name"] == filters.get("reference_name") and t["status"] == "Open"
    ]
    f.db = SimpleNamespace(set_value=lambda dt, name, field, val: next(t for t in todos if t["name"] == name).__setitem__(field, val))
    sys.modules["frappe"] = f
    return f


def _doc(**kw):
    d = SimpleNamespace(comments=[], **kw)
    d.add_comment = lambda kind, text: d.comments.append(text)
    d.save = lambda: None

    def submit():
        d.docstatus = 1

    d.submit = submit
    d.db_set = lambda k, v: setattr(d, k, v)
    d.run_method = lambda m: None
    return d


class FlowTests(unittest.TestCase):
    def setUp(self):
        self._applicant = hi.applicant_impl
        hi.applicant_impl = lambda name: {"id": name}  # detail reads many DocTypes

    def tearDown(self):
        hi.applicant_impl = self._applicant
        sys.modules.pop("frappe", None)

    def test_hr_shortlists_and_must_note_a_rejection(self):
        a = _doc(name="HR-APP-1", status="Open")
        f = _fake("hr@x", ("HR User",), {"HR-APP-1": a})
        hi.set_status_impl("HR-APP-1", "Shortlisted", None)
        self.assertEqual(a.status, "Shortlisted")
        with self.assertRaises(f.ValidationError):
            hi.set_status_impl("HR-APP-1", "Rejected", "")
        f = _fake("lm@x", ("Employee",), {"HR-APP-1": a})
        with self.assertRaises(f.PermissionError):
            hi.set_status_impl("HR-APP-1", "Shortlisted", None)

    def test_offer_needs_a_second_hr_manager(self):
        o = _doc(name="HR-OFF-1", owner="hr1@x", docstatus=0, applicant_name="Ayanda Mthethwa")
        todos = [{"name": "TD-1", "reference_name": "HR-OFF-1", "status": "Open"}]
        f = _fake("hr1@x", ("HR Manager",), {"HR-OFF-1": o}, todos)
        with self.assertRaisesRegex(f.PermissionError, "someone else"):
            hi.decide_offer("HR-OFF-1", "approve")
        f = _fake("hr2@x", ("HR Manager",), {"HR-OFF-1": o}, todos)
        with self.assertRaises(f.ValidationError):
            hi.decide_offer("HR-OFF-1", "return")
        res = hi.decide_offer("HR-OFF-1", "approve")
        self.assertEqual((res["status"], o.docstatus, todos[0]["status"]), ("Approved", 1, "Closed"))

    def test_answer_only_after_approval_and_once(self):
        o = _doc(name="HR-OFF-1", docstatus=0, status="Awaiting Response", job_applicant="HR-APP-1")
        f = _fake("hr@x", ("HR Manager",), {"HR-OFF-1": o})
        with self.assertRaisesRegex(f.ValidationError, "approved before"):
            hi.answer_impl("HR-OFF-1", "Accepted")
        o.docstatus = 1
        hi.answer_impl("HR-OFF-1", "Accepted")
        self.assertEqual(o.status, "Accepted")
        with self.assertRaisesRegex(f.ValidationError, "already answered"):
            hi.answer_impl("HR-OFF-1", "Rejected")


if __name__ == "__main__":
    unittest.main()
