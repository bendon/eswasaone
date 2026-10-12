"""Alerts (R-H2, R-H3, R-H4) — pure rules, plus raise-once and acknowledge-only-mine on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import alerts as al

TODAY = date(2026, 10, 12)


class RuleTests(unittest.TestCase):
    def test_contract_window(self):
        self.assertTrue(al.contract_due("2026-12-11", TODAY))  # 60 days
        self.assertTrue(al.contract_due("2026-10-12", TODAY))  # ends today
        self.assertFalse(al.contract_due("2026-12-12", TODAY))  # 61 days
        self.assertFalse(al.contract_due("2026-10-11", TODAY))  # already ended
        self.assertFalse(al.contract_due(None, TODAY))

    def test_expiry_threshold_is_the_smallest_reached(self):
        self.assertEqual(al.expiry_threshold("2026-12-11", TODAY), 60)
        self.assertEqual(al.expiry_threshold("2026-11-11", TODAY), 30)
        self.assertEqual(al.expiry_threshold("2026-10-19", TODAY), 7)
        self.assertEqual(al.expiry_threshold("2026-10-12", TODAY), 7)
        self.assertIsNone(al.expiry_threshold("2026-12-12", TODAY))
        self.assertIsNone(al.expiry_threshold("2026-10-01", TODAY))

    def test_thin_cover_includes_skills_nobody_holds(self):
        cov = {"ISO 17025 assessor": {"holders": 1, "expiring": 0}, "Lead auditor QMS": {"holders": 3, "expiring": 1}}
        self.assertEqual(al.thin_cover(["ISO 17025 assessor", "Lead auditor QMS", "Mass calibration"], cov),
                         [("ISO 17025 assessor", 1), ("Mass calibration", 0)])

    def test_recipients_are_named_and_unique(self):
        self.assertEqual(al.recipients("a@x", None, ["hr1@x", "a@x"], "Administrator", ""), ["a@x", "hr1@x"])

    def test_titles(self):
        self.assertEqual(al.contract_title("Gcina Mavuso", date(2026, 11, 30)),
                         "Fixed-term contract ends 30 Nov 2026: Gcina Mavuso. Renew, make permanent or let it end")
        self.assertEqual(al.cover_title("Mass calibration", 0), "Competence cover alert: nobody holds Mass calibration")


class _Err(Exception):
    pass


def _fake(user, alerts, todos):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw

    def exists(dt, key=None):
        return dt == al.DOCTYPE and any(a["key"] == key.get("key") for a in alerts)

    def set_value(dt, name, field, val=None, **k):
        next(t for t in todos if t["name"] == name)[field] = val

    f.db = SimpleNamespace(exists=exists, set_value=set_value)

    def get_doc(d):
        def insert(**k):
            if d["doctype"] == al.DOCTYPE:
                d["name"] = f"ALERT-{len(alerts) + 1}"
                alerts.append(d)
            else:
                d["name"] = f"TD-{len(todos) + 1}"
                todos.append(d)

        return _Doc(d, insert)

    f.get_doc = get_doc

    def get_all(dt, filters=None, **k):
        return [{"name": t["name"]} for t in todos if all(t.get(key) == v for key, v in filters.items())]

    f.get_all = get_all
    sys.modules["frappe"] = f
    return f


class _Doc:
    def __init__(self, d, insert):
        self._d, self._insert = d, insert

    def insert(self, **k):
        self._insert(**k)

    @property
    def name(self):
        return self._d["name"]


class RaiseTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)

    def test_raised_once_per_key_with_low_priority_todo_per_person(self):
        alerts, todos = [], []
        _fake("Administrator", alerts, todos)
        args = ("R-H2:EMP-7:2026-11-30", "R-H2", "Fixed-term contract ends 30 Nov 2026: Gcina Mavuso", ["hr1@x", "boss@x"], "2026-11-30", "EMP-7", ("Employee", "EMP-7"))
        self.assertEqual(al.raise_alert(*args), 1)
        self.assertEqual(al.raise_alert(*args), 0)
        self.assertEqual(len(alerts), 1)
        self.assertEqual([(t["allocated_to"], t["priority"], t["reference_type"]) for t in todos],
                         [("hr1@x", "Low", al.DOCTYPE), ("boss@x", "Low", al.DOCTYPE)])

    def test_nobody_to_tell_raises_nothing(self):
        alerts, todos = [], []
        _fake("Administrator", alerts, todos)
        self.assertEqual(al.raise_alert("R-H4:X:2026-10", "R-H4", "t", [], "2026-10-12"), 0)
        self.assertEqual(alerts, [])

    def test_acknowledge_closes_only_my_todo(self):
        todos = [
            {"name": "TD-1", "reference_type": al.DOCTYPE, "reference_name": "ALERT-1", "allocated_to": "hr1@x", "status": "Open"},
            {"name": "TD-2", "reference_type": al.DOCTYPE, "reference_name": "ALERT-1", "allocated_to": "boss@x", "status": "Open"},
        ]
        f = _fake("hr1@x", [], todos)
        with self.assertRaises(f.ValidationError):
            al.decide("ALERT-1", "reject", "no")
        self.assertEqual(al.decide("ALERT-1", "approve")["status"], "Acknowledged")
        self.assertEqual([t["status"] for t in todos], ["Closed", "Open"])
        with self.assertRaisesRegex(f.ValidationError, "isn't open for you"):
            al.decide("ALERT-1", "approve")


if __name__ == "__main__":
    unittest.main()
