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


class ReminderTests(unittest.TestCase):
    """Interview feedback 1 working day late, offers unanswered after 5 working days; each once per key."""

    def setUp(self):
        from unittest import mock

        from tests import _fakefrappe as ff

        self.ff = ff
        self.store = {
            hi.INTERVIEW: [{"name": "INT-1", "job_applicant": "APP-1", "scheduled_on": "2026-10-14", "status": "Under Review", "docstatus": 0}],
            "Interview Detail": [{"parent": "INT-1", "parenttype": hi.INTERVIEW, "interviewer": u} for u in ("a@x", "b@x")],
            hi.FEEDBACK: [{"interview": "INT-1", "interviewer": "a@x", "docstatus": 1}],
            hi.APPLICANT: [{"name": "APP-1", "applicant_name": "Sipho Dube"}],
            hi.OFFER: [{"name": "OFF-1", "applicant_name": "Sipho Dube", "offer_date": "2026-10-08", "owner": "hr2@x", "docstatus": 1, "status": "Awaiting Response"}],
        }
        mock.patch("eswasa_hr.workdays.holidays", return_value=set()).start()
        self.addCleanup(mock.patch.stopall)
        self.addCleanup(ff.uninstall)

    def _run(self, today):
        self.ff.install(self.store, today=today, doctypes=("HR Alert",))
        return hi.remind_due()

    def _todos(self):
        return [(t["allocated_to"], t["description"]) for t in self.store.get("ToDo", [])]

    def test_feedback_on_the_next_working_day_offer_only_after_five(self):
        self.assertEqual(self._run("2026-10-14"), 0)
        self.assertEqual(self._run("2026-10-15"), 1)  # feedback is due today; the offer reaches 5 days today, not more
        self.assertEqual([t[0] for t in self._todos()], ["b@x"])

    def test_reminders_once_per_key(self):
        self.assertEqual(self._run("2026-10-16"), 2)
        self.assertEqual(self._run("2026-10-19"), 0)
        self.assertEqual(self._todos(), [
            ("b@x", "Interview feedback overdue: record yours for Sipho Dube (interviewed 2026-10-14)"),
            ("hr2@x", "No answer to the offer to Sipho Dube since 2026-10-08. Follow up with the candidate"),
        ])
        self.assertEqual([a["key"] for a in self.store["HR Alert"]], ["interview-feedback:INT-1:b@x:2026-10-15", "offer-waiting:OFF-1:2026-10-15"])

    def test_answered_offers_and_finished_interviews_are_left_alone(self):
        self.store[hi.OFFER][0]["status"] = "Accepted"
        self.store[hi.INTERVIEW][0]["status"] = "Cleared"
        self.assertEqual(self._run("2026-10-30"), 0)

    def test_missing_feedback(self):
        self.assertEqual(hi.missing_feedback(["a@x", "b@x", "a@x", None], ["a@x"]), ["b@x"])


if __name__ == "__main__":
    unittest.main()
