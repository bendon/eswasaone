"""Cases (J10) — stage rules, appeal routing, Board counts, and who can read a case."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import cases as cs

TODAY = date(2026, 10, 12)


class RuleTests(unittest.TestCase):
    def test_stages_move_one_step_with_side_exits(self):
        self.assertEqual(cs.next_stages("disciplinary", "Opened"), ["Investigation"])
        self.assertEqual(cs.next_stages("disciplinary", "Outcome issued"), ["Appeal", "Closed"])
        self.assertEqual(cs.next_stages("disciplinary", "Appeal"), ["Closed"])
        self.assertEqual(cs.next_stages("disciplinary", "Closed"), [])
        self.assertEqual(cs.next_stages("grievance", "Open"), ["Investigated", "Invalid"])
        self.assertEqual(cs.next_stages("grievance", "Resolved"), [])

    def test_move_needs_a_note_and_an_outcome(self):
        self.assertEqual(cs.move_errors("disciplinary", "Opened", "Investigation", "Statement taken", None, None, None), [])
        self.assertIn("can't move", cs.move_errors("disciplinary", "Opened", "Closed", "x", None, None, None)[0])
        self.assertEqual(cs.move_errors("disciplinary", "Opened", "Investigation", " ", None, None, None), ["Add a note on what happened at this step."])
        self.assertEqual(cs.move_errors("disciplinary", "Hearing scheduled", "Outcome issued", "Hearing held", "", None, None, sanction="No action"), ["Record the outcome."])
        self.assertEqual(cs.move_errors("grievance", "Investigated", "Resolved", "Met both", None, None, None), ["Record the outcome."])

    def test_appeal_never_goes_to_whoever_decided(self):
        self.assertEqual(cs.move_errors("disciplinary", "Outcome issued", "Appeal", "Appeal lodged", None, "ed@x", "hrm@x"), [])
        self.assertEqual(cs.move_errors("disciplinary", "Outcome issued", "Appeal", "Appeal lodged", None, "hrm@x", "hrm@x"),
                         ["The appeal can't go to whoever issued the outcome."])
        self.assertEqual(cs.move_errors("disciplinary", "Outcome issued", "Appeal", "Appeal lodged", None, None, "hrm@x"), ["Choose who hears the appeal."])

    def test_owner_is_never_involved(self):
        self.assertIsNone(cs.owner_error("hrm@x", ["thandi@x"]))
        self.assertEqual(cs.owner_error("thandi@x", ["thandi@x", None]), "The owner can't be one of the people involved.")
        self.assertEqual(cs.owner_error(None, []), "Choose the case owner.")

    def test_todo_titles_carry_no_names(self):
        self.assertEqual(cs.step_title("HRC-2026-00005", "Hearing", "2026-10-16"), "Case HRC-2026-00005: Hearing by 16 Oct 2026")
        self.assertEqual(cs.step_title("HR-GRV-0001", None, None), "Case HR-GRV-0001: next step")

    def test_board_counts_only(self):
        rows = [
            {"kind": "grievance", "opened_on": "2026-09-01", "closed_on": "2026-09-11"},
            {"kind": "grievance", "opened_on": "2026-09-18", "closed_on": None},
            {"kind": "disciplinary", "opened_on": "2025-11-01", "closed_on": "2026-01-10"},
            {"kind": "disciplinary", "opened_on": "2025-01-01", "closed_on": "2025-02-01"},
        ]
        self.assertEqual(cs.board_counts(rows, TODAY), [
            {"kind": "grievance", "open": 1, "closed_this_year": 1, "avg_days_to_close": 10.0},
            {"kind": "disciplinary", "open": 0, "closed_this_year": 1, "avg_days_to_close": 50.5},
        ])


class WarningRuleTests(unittest.TestCase):
    """Plan 01: offence, sanction and warning expiry."""

    def test_outcome_needs_sanction_and_text_and_offence_once_the_code_exists(self):
        self.assertEqual(cs.outcome_errors("disciplinary", None, None, "", False), ["Choose the sanction.", "Record the outcome."])
        self.assertEqual(cs.outcome_errors("disciplinary", None, "Written warning", "Late three times", False), [])  # empty catalogue: no offence needed
        self.assertEqual(cs.outcome_errors("disciplinary", None, "Written warning", "Late three times", True), ["Choose the offence from the disciplinary code."])
        self.assertEqual(cs.outcome_errors("disciplinary", "D01", "Written warning", "Late three times", True), [])
        self.assertEqual(cs.outcome_errors("disciplinary", "D01", "No action", " ", True), ["Record the outcome."])  # no action still says why
        self.assertEqual(cs.outcome_errors("disciplinary", "D01", "Fine", "x", True), ["Choose the sanction."])
        self.assertEqual(cs.outcome_errors("grievance", None, None, None, True), [])

    def test_move_errors_calls_outcome_errors(self):
        self.assertEqual(cs.move_errors("disciplinary", "Hearing scheduled", "Outcome issued", "Hearing held", "Final warning", None, None, None, None, True),
                         ["Choose the offence from the disciplinary code.", "Choose the sanction."])
        self.assertEqual(cs.move_errors("disciplinary", "Hearing scheduled", "Outcome issued", "Hearing held", "Final warning", None, None, "D01", "Final written warning", True), [])

    def test_closing_an_appeal_says_upheld_or_overturned(self):
        self.assertEqual(cs.move_errors("disciplinary", "Appeal", "Closed", "Appeal heard", None, None, "hrm@x"), ["Say whether the appeal upheld or overturned the outcome."])
        self.assertEqual(cs.move_errors("disciplinary", "Appeal", "Closed", "Appeal heard", None, None, "hrm@x", appeal_result="Upheld"), [])
        self.assertEqual(cs.move_errors("disciplinary", "Outcome issued", "Closed", "No appeal", None, None, "hrm@x"), [])  # no appeal: nothing to say

    def test_warning_expiry_with_and_without_months(self):
        months = {"Verbal warning": 3, "Written warning": 6, "Final written warning": 12}
        self.assertTrue(cs.is_warning("Final written warning"))
        self.assertFalse(cs.is_warning("Dismissal"))
        self.assertEqual(cs.warning_expiry("Written warning", "2026-10-13", months), date(2027, 4, 13))
        self.assertEqual(cs.warning_expiry("Verbal warning", "2026-11-30", months), date(2027, 2, 28))  # month end clamps
        self.assertEqual(cs.warning_expiry("Final written warning", date(2026, 10, 13), months), date(2027, 10, 13))
        self.assertIsNone(cs.warning_expiry("Written warning", "2026-10-13", {}))  # awaiting ESWASA (A1)
        self.assertIsNone(cs.warning_expiry("Written warning", "2026-10-13", {"Written warning": None}))
        self.assertIsNone(cs.warning_expiry("Suspension", "2026-10-13", months))
        self.assertIsNone(cs.warning_expiry("Written warning", None, months))

    def test_active_warnings_boundary_days(self):
        rows = [
            {"name": "A", "sanction": "Written warning", "warning_status": "Active", "warning_expires_on": "2026-10-12"},  # yesterday
            {"name": "B", "sanction": "Written warning", "warning_status": "Active", "warning_expires_on": "2026-10-13"},  # today: still counts
            {"name": "C", "sanction": "Verbal warning", "warning_status": "Active", "warning_expires_on": None},  # no expiry set
            {"name": "D", "sanction": "Final written warning", "warning_status": "Withdrawn", "warning_expires_on": "2027-01-01"},
            {"name": "E", "sanction": "Final written warning", "warning_status": "Expired", "warning_expires_on": "2026-01-01"},
        ]
        day = date(2026, 10, 13)
        self.assertEqual([r["name"] for r in cs.active_warnings(rows, day)], ["B", "C"])
        self.assertEqual([r["name"] for r in cs.lapsed_warnings(rows, day)], ["A"])

    def test_an_overturned_appeal_withdraws_the_warning(self):
        self.assertEqual(cs.appeal_warning_status("Active", "Overturned"), "Withdrawn")
        self.assertEqual(cs.appeal_warning_status("Active", "Upheld"), "Active")
        self.assertIsNone(cs.appeal_warning_status(None, "Overturned"))  # no warning to withdraw

    def test_outcome_comment_says_until_when(self):
        self.assertEqual(cs.outcome_comment("Written warning", "2027-04-13"), "Sanction: Written warning, active until 2027-04-13.")
        self.assertEqual(cs.outcome_comment("Written warning", None), "Sanction: Written warning. Expiry not set: awaiting ESWASA (A1).")
        self.assertEqual(cs.outcome_comment("Dismissal", None), "Sanction: Dismissal.")

    def test_offence_errors(self):
        self.assertEqual(cs.offence_errors("D01", "Late coming", "Minor", "Verbal warning"), [])
        self.assertEqual(cs.offence_errors("", "", "Petty", "Fine"),
                         ["Give the offence a code.", "Name the offence.", "Choose the level: Minor, Serious, Gross.", "Choose a sanction from the list."])
        self.assertEqual(cs.offence_errors("D01", "x", "Gross", None, ["D01"]), ["Code D01 is already in the disciplinary code."])

    def test_setup_step_waits_for_offences_and_validity(self):
        full = {"Verbal warning": 3, "Written warning": 6, "Final written warning": 12}
        self.assertEqual(cs.code_state(4, full), (True, "4 active offences; warning validity set."))
        done, detail = cs.code_state(0, {})
        self.assertFalse(done)
        self.assertIn("Awaiting ESWASA (A1)", detail)
        self.assertFalse(cs.code_state(4, {**full, "Verbal warning": None})[0])


def _fake(user, roles):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    f.get_roles = lambda u=None: list(roles)
    f.ValidationError = type("ValidationError", (Exception,), {})
    f.PermissionError = type("PermissionError", (Exception,), {})

    def throw(msg, exc=Exception):
        raise exc(msg)

    f.throw = throw
    f.db = SimpleNamespace(escape=lambda v: f"'{v}'")
    sys.modules["frappe"] = f
    return f


def _case(stage="Hearing scheduled", owner="hrm@x", appeal_owner=None):
    d = SimpleNamespace(doctype=cs.DISCIPLINARY, name="HRC-2026-00005", employee="EMP-7", owner_user=owner, opened_on="2026-09-29",
                        allegation="Alleged breach of the impartiality policy")
    vals = {"stage": stage, "appeal_owner": appeal_owner}
    d.get = lambda k: vals.get(k, getattr(d, k, None))
    return d


class AccessTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)

    def test_hr_user_cannot_read_but_owner_and_hr_manager_can(self):
        _fake("hro@x", ("HR User", "Employee"))
        self.assertFalse(cs.has_permission(_case()))
        self.assertEqual(cs.disciplinary_query("hro@x"), "(`tabDisciplinary Case`.`owner_user` = 'hro@x' or (`tabDisciplinary Case`.`stage` = 'Appeal' and `tabDisciplinary Case`.`appeal_owner` = 'hro@x'))")
        _fake("hrm@x", ("Employee",))
        self.assertTrue(cs.has_permission(_case(owner="hrm@x")))
        _fake("boss@x", ("HR Manager",))
        self.assertTrue(cs.has_permission(_case()))
        self.assertEqual(cs.grievance_query("boss@x"), "")

    def test_appeal_owner_reads_only_during_the_appeal(self):
        _fake("ed@x", ("Employee",))
        self.assertTrue(cs.has_permission(_case(stage="Appeal", appeal_owner="ed@x")))
        self.assertFalse(cs.has_permission(_case(stage="Closed", appeal_owner="ed@x")))

    def test_approvals_cannot_move_a_case(self):
        f = _fake("hrm@x", ("HR Manager",))
        with self.assertRaisesRegex(f.ValidationError, "Open the case"):
            cs.decide("HRC-2026-00005", "approve")


class GlueTests(unittest.TestCase):
    """Plan 01 glue against the in-memory stand-in: the expiry job and who may see warnings."""

    def _install(self, user, roles, today="2026-10-13"):
        from tests import _fakefrappe as ff

        self.addCleanup(ff.uninstall)
        if not hasattr(self, "store"):
            self.store = {
                "Employee": [{"name": "EMP-7", "employee_name": "Thandi", "user_id": "thandi@x"}],
                cs.DISCIPLINARY: [
                    {"name": "HRC-1", "employee": "EMP-7", "owner_user": "hrm@x", "stage": "Closed", "sanction": "Written warning", "outcome_on": "2026-04-01",
                     "warning_status": "Active", "warning_expires_on": "2026-10-12", "offence": "D01", "allegation": "secret"},
                    {"name": "HRC-2", "employee": "EMP-7", "owner_user": "hrm2@x", "stage": "Closed", "sanction": "Verbal warning", "outcome_on": "2026-09-01",
                     "warning_status": "Active", "warning_expires_on": "2026-12-01", "allegation": "secret"},
                ],
                cs.OFFENCE: [{"name": "D01", "title": "Late coming", "level": "Minor", "active": 1}],
            }
        f = ff.install(self.store, user=user, roles=roles, today=today, doctypes=(cs.DISCIPLINARY, cs.OFFENCE, "HR Alert"))
        f.get_doc = (lambda orig: lambda d, *a: _doc(orig(d, *a)) if a else orig(d, *a))(f.get_doc)
        return f

    def test_expire_job_marks_expired_and_raises_once_to_the_owner(self):
        self._install("Administrator", ("System Manager",))
        self.assertEqual(cs.expire_warnings(), 1)
        self.assertEqual(cs.expire_warnings(), 0)
        self.assertEqual([r["warning_status"] for r in self.store[cs.DISCIPLINARY]], ["Expired", "Active"])
        alert = self.store["HR Alert"][0]
        self.assertEqual((alert["key"], alert["rule"], alert["employee"]), ("warning:HRC-1:expired", "Warning expired", None))
        self.assertNotIn("Thandi", alert["message"])
        self.assertEqual([t["allocated_to"] for t in self.store["ToDo"]], ["hrm@x"])

    def test_warnings_hr_manager_sees_all_owner_sees_own_others_refused(self):
        self._install("boss@x", ("HR Manager",))
        out = cs.warnings_impl("EMP-7")
        self.assertEqual([i["case"] for i in out["items"]], ["HRC-1", "HRC-2"])
        self.assertEqual(out["items"][0]["offence_title"], "Late coming")
        self.assertEqual((out["active"], out["active_until"]), (1, "2026-12-01"))  # HRC-1 lapsed yesterday
        self.assertNotIn("secret", str(out))
        self._install("hrm2@x", ("Employee",))
        self.assertEqual([i["case"] for i in cs.warnings_impl("EMP-7")["items"]], ["HRC-2"])
        for user, roles in (("hro@x", ("HR User",)), ("lm@x", ("Employee",))):
            f = self._install(user, roles)
            with self.assertRaises(f.PermissionError):
                cs.warnings_impl("EMP-7")

    def test_only_hr_manager_edits_the_code(self):
        f = self._install("hro@x", ("HR User",))
        self.assertFalse(cs.offences_impl()["can_edit"])
        with self.assertRaises(f.PermissionError):
            cs.create_offence_impl("D02", "Insubordination", "Serious")
        self._install("boss@x", ("HR Manager",))
        out = cs.create_offence_impl("D02", "Insubordination", "Serious", suggested_sanction="Written warning")
        self.assertEqual([o["code"] for o in out["items"]], ["D01", "D02"])
        out = cs.update_offence_impl("D02", {"active": False})
        self.assertFalse(out["items"][1]["active"])
        f = self._install("lm@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            cs.offences_impl()


def _doc(d):
    """Stand-in rows carry no ``doctype``; ``_fields`` reads it to tell the two kinds of case apart."""
    d.setdefault("doctype", cs.DISCIPLINARY)
    return d


if __name__ == "__main__":
    unittest.main()
