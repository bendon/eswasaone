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
        self.assertEqual(cs.move_errors("disciplinary", "Hearing scheduled", "Outcome issued", "Hearing held", "", None, None), ["Record the outcome."])
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


if __name__ == "__main__":
    unittest.main()
