"""Contract renew / make permanent — pure rules, plus four-eyes approval on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import contracts as cc

TODAY = date(2026, 10, 12)


class RuleTests(unittest.TestCase):
    def test_renew_needs_a_later_end_date_and_a_reason(self):
        self.assertEqual(cc.change_errors("Renew", "2026-11-30", "2027-11-30", "Fixed-term", None, "Post still funded", TODAY), [])
        self.assertIn("after the current one", cc.change_errors("Renew", "2026-11-30", "2026-11-30", "Fixed-term", None, "x", TODAY)[0])
        self.assertIn("new end date", cc.change_errors("Renew", "2026-11-30", None, "Fixed-term", None, "x", TODAY)[0])
        self.assertEqual(cc.change_errors("Renew", "2026-11-30", "2027-11-30", "Fixed-term", None, " ", TODAY), ["Say why."])

    def test_make_permanent_needs_a_different_type(self):
        self.assertEqual(cc.change_errors("Make permanent", "2026-11-30", None, "Fixed-term", "Permanent", "Funded post", TODAY), [])
        self.assertIn("already has", cc.change_errors("Make permanent", None, None, "Permanent", "Permanent", "x", TODAY)[0])
        self.assertIn("Choose renew", cc.change_errors("Extend", None, None, None, None, "x", TODAY)[0])

    def test_employee_update(self):
        self.assertEqual(cc.employee_update("Renew", "2027-11-30", None), {"contract_end_date": "2027-11-30"})
        self.assertEqual(cc.employee_update("Make permanent", None, "Permanent"), {"employment_type": "Permanent", "contract_end_date": None})

    def test_titles(self):
        self.assertEqual(cc.change_title("Renew", "Gcina Mavuso", "2027-11-30"), "Approve contract renewal: Gcina Mavuso, to 30 Nov 2027")
        self.assertEqual(cc.change_title("Make permanent", "Gcina Mavuso", None), "Approve permanent contract: Gcina Mavuso")


class _Err(Exception):
    pass


def _fake(user, roles, doc, staff, todos):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)

    def set_value(dt, name, field, val=None, **k):
        target = {"ToDo": {t["name"]: t for t in todos}, "Employee": staff}[dt][name]
        target.update(field if isinstance(field, dict) else {field: val})

    f.db = SimpleNamespace(set_value=set_value, get_value=lambda dt, name, field, *a, **k: staff.get(name, {}).get(field))

    def get_doc(dt, name):
        if dt == "Employee":
            e = staff[name]
            return SimpleNamespace(add_comment=lambda kind, text: e.setdefault("comments", []).append(text))
        return doc

    f.get_doc = get_doc

    def get_all(dt, filters=None, **k):
        if dt == "ToDo":
            return [{"name": t["name"]} for t in todos if t.get("reference_name") == filters.get("reference_name") and t["status"] == "Open"]
        return []  # no HR Alerts in these tests

    f.get_all = get_all
    sys.modules["frappe"] = f
    return f


def _change(kind="Renew", owner="hr1@x"):
    d = SimpleNamespace(name="CC-1", owner=owner, employee="EMP-7", kind=kind, state=cc.WAITING, reason="Post still funded",
                        new_end_date="2027-11-30", new_employment_type="Permanent" if kind != "Renew" else None)
    d.db_set = lambda vals: d.__dict__.update(vals)
    return d


class DecideTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)

    def _setup(self, user, kind="Renew", roles=("HR Manager",)):
        staff = {"EMP-7": {"name": "EMP-7", "user_id": "gcina@x", "contract_end_date": "2026-11-30", "employment_type": "Fixed-term"}}
        todos = [{"name": "TD-1", "reference_name": "CC-1", "status": "Open"}]
        doc = _change(kind)
        return _fake(user, roles, doc, staff, todos), doc, staff, todos

    def test_preparer_and_subject_cannot_approve(self):
        f, doc, *_ = self._setup("hr1@x")
        with self.assertRaisesRegex(f.PermissionError, "another HR Manager"):
            cc.decide("CC-1", "approve")
        f, doc, *_ = self._setup("gcina@x")
        with self.assertRaisesRegex(f.PermissionError, "your own contract"):
            cc.decide("CC-1", "approve")

    def test_renew_updates_the_end_date(self):
        f, doc, staff, todos = self._setup("hr2@x")
        self.assertEqual(cc.decide("CC-1", "approve")["status"], cc.DONE)
        self.assertEqual(staff["EMP-7"]["contract_end_date"], "2027-11-30")
        self.assertEqual((doc.state, doc.approved_by, todos[0]["status"]), (cc.DONE, "hr2@x", "Closed"))
        with self.assertRaisesRegex(f.ValidationError, "already decided"):
            cc.decide("CC-1", "approve")

    def test_make_permanent_clears_the_end_date(self):
        f, doc, staff, _ = self._setup("hr2@x", "Make permanent")
        cc.decide("CC-1", "approve")
        self.assertEqual((staff["EMP-7"]["employment_type"], staff["EMP-7"]["contract_end_date"]), ("Permanent", None))

    def test_send_back_needs_a_note_and_keeps_the_record(self):
        f, doc, staff, _ = self._setup("hr2@x")
        with self.assertRaises(f.ValidationError):
            cc.decide("CC-1", "reject")
        cc.decide("CC-1", "return", "Council hasn't approved the post beyond March.")
        self.assertEqual((doc.state, staff["EMP-7"]["contract_end_date"]), (cc.SENT_BACK, "2026-11-30"))
        self.assertIn("beyond March", staff["EMP-7"]["comments"][0])


if __name__ == "__main__":
    unittest.main()
