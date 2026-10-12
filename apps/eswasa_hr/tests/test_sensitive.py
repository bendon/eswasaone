"""Sensitive data (J12) — levels by role, reason required, own pay refused, log written before data."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import datetime
from types import SimpleNamespace

from eswasa_hr import sensitive as sv


class RuleTests(unittest.TestCase):
    def test_levels_by_role(self):
        self.assertEqual(sv.levels_for(["HR User"]), [sv.PERSONAL])
        self.assertEqual(sv.levels_for(["HR Manager"]), [sv.PERSONAL, sv.PAY])
        self.assertEqual(sv.levels_for(["Employee"]), [])

    def test_view_errors(self):
        why = "Updating next of kin after a call"
        self.assertIsNone(sv.view_error(1, ["HR User"], why, False))
        self.assertIn("Only HR Managers", sv.view_error(2, ["HR User"], why, False))
        self.assertIn("can't open personal", sv.view_error(1, ["Employee"], why, False))
        self.assertIn("own record", sv.view_error(2, ["HR Manager"], why, True))
        self.assertIsNone(sv.view_error(1, ["HR Manager"], why, True))
        self.assertIn("at least 10", sv.view_error(1, ["HR User"], "  check   ", False))
        self.assertIn("Choose", sv.view_error(sv.level_of("3"), ["HR Manager"], why, False))

    def test_property_setters_cover_every_field_once(self):
        ps = sv.property_setters()
        names = [p["name"] for p in ps]
        self.assertEqual(len(names), len(set(names)))
        self.assertIn({"name": "Employee-bank_ac_no-permlevel", "value": "2"}, [{"name": p["name"], "value": p["value"]} for p in ps])
        self.assertTrue(all(p["property"] == "permlevel" and p["doc_type"] == "Employee" for p in ps))


class _Err(Exception):
    pass


def _fake(user, roles, employee):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    f.local = SimpleNamespace(request_ip="10.0.0.5")
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)
    events: list[str] = []
    logs: list[dict] = []

    def get_value(dt, name, fields, as_dict=False):
        if fields == ["name", "employee_name", "user_id"]:
            return {k: employee[k] for k in fields}
        events.append("read")
        return {k: employee.get(k) for k in fields}

    f.db = SimpleNamespace(get_value=get_value, exists=lambda *a, **k: True)
    f.get_meta = lambda dt: SimpleNamespace(has_field=lambda fn: fn != "iban")

    def get_doc(d):
        def insert(**k):
            events.append("log")
            logs.append(d)
        return SimpleNamespace(insert=insert, name="LOG-1", **{k: v for k, v in d.items() if k != "doctype"})

    f.get_doc = get_doc
    utils = types.ModuleType("frappe.utils")
    utils.now_datetime = lambda: datetime(2026, 10, 12, 9, 30)
    f.utils = utils
    sys.modules["frappe"] = f
    sys.modules["frappe.utils"] = utils
    return f, events, logs


EMP = {"name": "EMP-9", "employee_name": "Thandi Nxumalo", "user_id": "thandi@x", "date_of_birth": "1990-04-02", "bank_ac_no": "6200112233", "ctc": 0}


class ViewTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def test_log_is_written_before_anything_is_read(self):
        f, events, logs = _fake("hrm@x", ["HR Manager"], EMP)
        out = sv.view_impl("EMP-9", "2", "Bank change form received")
        self.assertEqual(events, ["log", "read"])
        self.assertEqual(logs[0]["viewer"], "hrm@x")
        self.assertEqual((logs[0]["level"], logs[0]["reason"], logs[0]["ip_address"]), ("Pay and bank", "Bank change form received", "10.0.0.5"))
        self.assertNotIn("iban", logs[0]["fields"])  # only fields that exist on this site
        vals = {x["field"]: x["value"] for x in out["fields"]}
        self.assertEqual((vals["bank_ac_no"], out["log"]), ("6200112233", "LOG-1"))
        self.assertNotIn("date_of_birth", vals)

    def test_refusals_write_no_log(self):
        f, events, _ = _fake("hru@x", ["HR User"], EMP)
        with self.assertRaises(f.PermissionError):
            sv.view_impl("EMP-9", 2, "Bank change form received")
        with self.assertRaises(f.ValidationError):
            sv.view_impl("EMP-9", 1, "check")
        f, events2, _ = _fake("thandi@x", ["HR Manager"], EMP)
        with self.assertRaisesRegex(f.PermissionError, "own record"):
            sv.view_impl("EMP-9", 2, "Checking my own account")
        self.assertEqual(events + events2, [])


if __name__ == "__main__":
    unittest.main()
