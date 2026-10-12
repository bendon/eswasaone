"""Establishment change (J11) — counts, change limits, plan rows, and ED → Council decisions on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from types import SimpleNamespace

from eswasa_hr import establishment as es


class CountTests(unittest.TestCase):
    def test_vacant_takes_off_frozen_filled_and_recruiting(self):
        self.assertEqual(es.post_counts(6, 1, 3, 1)["vacant"], 1)
        self.assertEqual(es.post_counts(2, 0, 4, 0)["vacant"], 0)
        self.assertEqual(es.post_counts(2, 5, 0, 0)["frozen"], 2)

    def test_council_only_for_new_posts_and_grades(self):
        self.assertTrue(es.needs_council("Add"))
        self.assertTrue(es.needs_council("Regrade"))
        self.assertFalse(es.needs_council("Freeze"))
        self.assertFalse(es.needs_council("Remove"))


class ErrorTests(unittest.TestCase):
    POST = es.post_counts(6, 1, 3, 1)  # 1 vacant, 1 frozen, 2 empty but not recruiting

    def test_reason_and_count_needed(self):
        self.assertEqual(es.change_errors("Add", 2, self.POST, None, None, "Lab expansion"), [])
        self.assertIn("Say why.", es.change_errors("Add", 2, self.POST, None, None, " "))
        self.assertIn("Say how many posts.", es.change_errors("Add", 0, self.POST, None, None, "x"))
        self.assertIn("Choose add", es.change_errors("Merge", 1, self.POST, None, None, "x")[0])

    def test_only_empty_posts_can_be_removed(self):
        self.assertEqual(es.change_errors("Remove", 2, self.POST, None, None, "x"), [])
        self.assertIn("Only 2 of these posts are empty", es.change_errors("Remove", 3, self.POST, None, None, "x")[0])

    def test_freeze_vacant_and_unfreeze_frozen(self):
        self.assertEqual(es.change_errors("Freeze", 1, self.POST, None, None, "x"), [])
        self.assertIn("Only 1 of these posts are vacant", es.change_errors("Freeze", 2, self.POST, None, None, "x")[0])
        self.assertIn("Only 1 of these posts are frozen", es.change_errors("Unfreeze", 2, self.POST, None, None, "x")[0])

    def test_regrade_needs_a_new_grade(self):
        self.assertEqual(es.change_errors("Regrade", None, self.POST, "D2", "C1", "x"), [])
        self.assertIn("already on that grade", es.change_errors("Regrade", None, self.POST, "C1", "C1", "x")[0])
        self.assertIn("no approved posts", es.change_errors("Regrade", None, None, "D2", None, "x")[0])


class PlanRowTests(unittest.TestCase):
    ROWS = [{"designation": "Auditor", "number_of_positions": 4, "frozen": 1}]

    def test_add_creates_or_grows_a_row(self):
        self.assertEqual(es.apply_change(self.ROWS, "Add", "Auditor", 2)[0]["number_of_positions"], 6)
        rows = es.apply_change(self.ROWS, "Add", "Metrologist", 1)
        self.assertEqual(rows[1], {"designation": "Metrologist", "number_of_positions": 1, "frozen": 0})
        self.assertEqual(self.ROWS[0]["number_of_positions"], 4)  # input untouched

    def test_remove_keeps_frozen_within_the_posts_and_drops_empty_rows(self):
        self.assertEqual(es.apply_change(self.ROWS, "Remove", "Auditor", 4), [])
        self.assertEqual(es.apply_change([{"designation": "A", "number_of_positions": 2, "frozen": 2}], "Remove", "A", 1)[0]["frozen"], 1)

    def test_freeze_and_unfreeze(self):
        self.assertEqual(es.apply_change(self.ROWS, "Freeze", "Auditor", 9)[0]["frozen"], 4)
        self.assertEqual(es.apply_change(self.ROWS, "Unfreeze", "Auditor", 1)[0]["frozen"], 0)
        self.assertEqual(es.apply_change(self.ROWS, "Regrade", "Auditor", 0), self.ROWS)

    def test_summary_and_titles(self):
        self.assertEqual(es.change_summary("Add", 1, "Auditor"), "Add 1 Auditor post")
        self.assertEqual(es.change_summary("Freeze", 2, "Auditor"), "Freeze 2 Auditor posts")
        self.assertEqual(es.change_summary("Regrade", 0, "Auditor", "D2"), "Regrade Auditor to D2")
        self.assertTrue(es.change_title(es.WAIT_COUNCIL, "Add 1 Auditor post", "Certification").startswith("Record Council decision"))

    def test_track(self):
        self.assertEqual([s.get("state") for s in es.track(es.WAIT_COUNCIL, True)], ["done", "done", "now", None])
        self.assertEqual(len(es.track(es.WAIT_ED, False)), 3)
        self.assertTrue(all(s["state"] == "done" for s in es.track(es.APPROVED, True)))


class _Err(Exception):
    pass


def _fake(user, roles, doc, todos):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)
    comments: list[str] = []
    dept = SimpleNamespace(add_comment=lambda kind, text: comments.append(text))

    def get_doc(arg, name=None):
        if isinstance(arg, dict):  # a new ToDo
            return SimpleNamespace(insert=lambda **k: todos.append({**arg, "name": f"TD-{len(todos) + 1}"}))
        return doc if arg == es.DOCTYPE else dept

    f.get_doc = get_doc

    def set_value(dt, name, field, val=None, **k):
        next(t for t in todos if t["name"] == name).update({field: val})

    f.db = SimpleNamespace(set_value=set_value, exists=lambda *a, **k: False)

    def get_all(dt, filters=None, **k):
        if dt == "ToDo":
            return [{"name": t["name"]} for t in todos if t.get("reference_name") == filters.get("reference_name") and t["status"] == "Open"]
        return []

    f.get_all = get_all
    sys.modules["frappe"] = f
    return f, comments


def _change(change="Add", owner="hr1@x"):
    d = SimpleNamespace(name="EC-1", owner=owner, department="Certification", designation="Auditor", change=change, count=1, new_grade=None,
                        state=es.WAIT_ED, council_required=int(es.needs_council(change)), ed_decided_by=None)
    d.db_set = lambda vals: d.__dict__.update(vals)
    return d


class DecideTests(unittest.TestCase):
    def setUp(self):
        self.applied: list[str] = []
        self._orig = (es._apply, es._users_with)
        es._apply = lambda doc: self.applied.append(doc.name) or "SP-2"
        es._users_with = lambda role, exclude: [u for u in ["sec@x", "ed@x"] if u not in exclude]

    def tearDown(self):
        es._apply, es._users_with = self._orig
        sys.modules.pop("frappe", None)

    def _setup(self, user, roles, change="Add"):
        doc = _change(change)
        todos = [{"name": "TD-1", "reference_name": "EC-1", "status": "Open"}]
        f, comments = _fake(user, roles, doc, todos)
        return f, doc, todos, comments

    def test_preparer_and_non_ed_cannot_decide(self):
        f, *_ = self._setup("hr1@x", ["Eswasa Executive Director"])
        with self.assertRaisesRegex(f.PermissionError, "someone else"):
            es.decide("EC-1", "approve")
        f, *_ = self._setup("hr2@x", ["HR Manager"])
        with self.assertRaisesRegex(f.PermissionError, "Executive Director"):
            es.decide("EC-1", "approve")

    def test_ed_approval_of_new_posts_goes_to_council_not_the_plan(self):
        f, doc, todos, _ = self._setup("ed@x", ["Eswasa Executive Director"])
        self.assertEqual(es.decide("EC-1", "approve")["status"], es.WAIT_COUNCIL)
        self.assertEqual(self.applied, [])
        self.assertEqual(todos[0]["status"], "Closed")
        new = [t for t in todos if t["status"] == "Open"]
        self.assertEqual([t["allocated_to"] for t in new], ["sec@x"])  # never the ED or the preparer
        self.assertTrue(new[0]["description"].startswith("Record Council decision"))

    def test_council_needs_a_minute_reference_and_another_person(self):
        f, doc, todos, _ = self._setup("ed@x", ["Eswasa Executive Director", "Eswasa Board Secretary"])
        es.decide("EC-1", "approve")
        with self.assertRaisesRegex(f.PermissionError, "as Executive Director"):
            es.decide("EC-1", "approve", "CHR/2026/14")
        f.session.user = "sec@x"
        f.get_roles = lambda: ["Eswasa Board Secretary"]
        with self.assertRaisesRegex(f.ValidationError, "minute reference"):
            es.decide("EC-1", "approve")
        self.assertEqual(es.decide("EC-1", "approve", "CHR/2026/14")["status"], es.APPROVED)
        self.assertEqual((self.applied, doc.council_reference, doc.staffing_plan), (["EC-1"], "CHR/2026/14", "SP-2"))

    def test_freeze_needs_only_the_ed(self):
        f, doc, *_ = self._setup("ed@x", ["Eswasa Executive Director"], "Freeze")
        self.assertEqual(es.decide("EC-1", "approve")["status"], es.APPROVED)
        self.assertEqual(self.applied, ["EC-1"])

    def test_send_back_and_council_refusal_need_a_note(self):
        f, doc, _, comments = self._setup("ed@x", ["Eswasa Executive Director"], "Remove")
        with self.assertRaises(f.ValidationError):
            es.decide("EC-1", "reject")
        es.decide("EC-1", "return", "Wait for the budget review.")
        self.assertEqual((doc.state, self.applied), (es.SENT_BACK, []))
        self.assertIn("budget review", comments[-1])
        with self.assertRaisesRegex(f.ValidationError, "already decided"):
            es.decide("EC-1", "approve")


if __name__ == "__main__":
    unittest.main()
