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
        self.assertEqual(sv.levels_for(["HR Manager"]), [sv.PERSONAL, sv.PAY, sv.FAMILY])
        self.assertEqual(sv.levels_for(["Employee"]), [])

    def test_view_errors(self):
        why = "Updating next of kin after a call"
        self.assertIsNone(sv.view_error(1, ["HR User"], why, False))
        self.assertIn("Only HR Managers", sv.view_error(2, ["HR User"], why, False))
        self.assertIn("can't open personal", sv.view_error(1, ["Employee"], why, False))
        self.assertIn("own record", sv.view_error(2, ["HR Manager"], why, True))
        self.assertIsNone(sv.view_error(1, ["HR Manager"], why, True))
        self.assertIn("at least 10", sv.view_error(1, ["HR User"], "  check   ", False))
        self.assertIn("Choose", sv.view_error(sv.level_of("4"), ["HR Manager"], why, False))
        # Plan 04: family and medical is HR Manager only (provisional, A5); the person's own is allowed.
        self.assertIn("Only HR Managers", sv.view_error(3, ["HR User"], why, False))
        self.assertIsNone(sv.view_error(3, ["HR Manager"], why, True))

    def test_property_setters_cover_every_field_once(self):
        ps = sv.property_setters()
        names = [p["name"] for p in ps]
        self.assertEqual(len(names), len(set(names)))
        self.assertIn({"name": "Employee-bank_ac_no-permlevel", "value": "2"}, [{"name": p["name"], "value": p["value"]} for p in ps])
        self.assertTrue(all(p["property"] == "permlevel" and p["doc_type"] == "Employee" for p in ps))
        self.assertFalse([p for p in ps if p["field_name"].startswith("custom_")], "custom fields carry permlevel in the fixture")

    def test_level_3_custom_fields_are_permlevel_3_in_the_fixture(self):
        import json
        from pathlib import Path

        rows = json.loads((Path(sv.__file__).parent / "fixtures" / "custom_field.json").read_text())
        by_name = {r["name"]: r for r in rows}
        for field in [f for f, _ in sv.LEVELS[sv.FAMILY]["fields"]] + [f for f, _l, _c in sv.LEVELS[sv.FAMILY]["tables"]]:
            self.assertEqual(by_name[f"Employee-{field}"].get("permlevel"), 3, field)
        self.assertIn("custom_dependants", sv.protected_labels())


class FamilyRuleTests(unittest.TestCase):
    def test_shares_empty_or_100(self):
        self.assertIsNone(sv.shares_error([{"beneficiary_share": None}, {}]))
        self.assertIsNone(sv.shares_error([{"beneficiary_share": 60}, {"beneficiary_share": "40"}]))
        self.assertIn("add up to 90", sv.shares_error([{"beneficiary_share": 60}, {"beneficiary_share": 30}]))
        self.assertIn("add up to 100", sv.shares_error([{"beneficiary_share": 120}]))

    def test_dependant_errors(self):
        today = "2026-10-13"
        self.assertEqual(sv.dependant_errors({"full_name": "Lwazi Nxumalo", "relationship": "Child", "date_of_birth": "2019-03-01"}, today), [])
        errs = sv.dependant_errors({"full_name": " ", "relationship": "Cousin", "date_of_birth": "2027-01-01"}, today)
        self.assertEqual(len(errs), 3)
        self.assertIn("future", errs[2])

    def test_tables_shown_by_column_label(self):
        out = sv.shown_tables({"custom_dependants": [{"full_name": "Lwazi", "relationship": "Child", "on_medical_aid": 1, "beneficiary_share": None}]}, sv.FAMILY)
        self.assertEqual(out[0]["label"], "Dependants")
        self.assertIn("Relationship", out[0]["columns"])
        self.assertEqual((out[0]["rows"][0]["Name"], out[0]["rows"][0]["On medical aid"], out[0]["rows"][0]["Beneficiary share (%)"]), ("Lwazi", "Yes", None))


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

    def get_value_any(dt, name, fields, as_dict=False):
        if isinstance(name, dict):  # Employee by user_id (own view)
            return {k: employee[k] for k in fields} if name.get("user_id") == employee["user_id"] else None
        return get_value(dt, name, fields, as_dict)

    f.db = SimpleNamespace(get_value=get_value_any, exists=lambda *a, **k: True)

    def get_all(dt, filters=None, fields=None, **k):
        events.append("read")
        return [{f2: r.get(f2) for f2 in fields} for r in employee.get(filters["parentfield"], [])]

    f.get_all = get_all
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


EMP = {"name": "EMP-9", "employee_name": "Thandi Nxumalo", "user_id": "thandi@x", "date_of_birth": "1990-04-02", "bank_ac_no": "6200112233", "ctc": 0,
       "custom_medical_aid_scheme": "Swazi Med", "custom_medical_aid_main_member": 1,
       "custom_dependants": [{"full_name": "Lwazi Nxumalo", "relationship": "Child", "date_of_birth": "2019-03-01", "on_medical_aid": 1}]}


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


    def test_level_3_logs_first_and_returns_the_table(self):
        f, events, logs = _fake("hrm@x", ["HR Manager"], EMP)
        out = sv.view_impl("EMP-9", 3, "Medical aid claim query from the scheme")
        self.assertEqual(events, ["log", "read", "read"])
        self.assertEqual(logs[0]["level"], "Family and medical")
        self.assertIn("custom_dependants", logs[0]["fields"])
        vals = {x["field"]: x["value"] for x in out["fields"]}
        self.assertEqual((vals["custom_medical_aid_scheme"], vals["custom_medical_aid_main_member"]), ("Swazi Med", "Yes"))
        self.assertEqual(out["tables"][0]["rows"][0]["Name"], "Lwazi Nxumalo")

    def test_level_3_refused_to_hr_user_without_a_log(self):
        f, events, _ = _fake("hru@x", ["HR User"], EMP)
        with self.assertRaisesRegex(f.PermissionError, "Only HR Managers"):
            sv.view_impl("EMP-9", 3, "Medical aid claim query from the scheme")
        self.assertEqual(events, [])

    def test_own_family_view_is_logged_without_a_reason(self):
        f, events, logs = _fake("thandi@x", ["Employee"], EMP)
        out = sv.my_view_impl(3)
        self.assertEqual(events[0], "log")
        self.assertEqual((logs[0]["viewer"], logs[0]["reason"]), ("thandi@x", sv.OWN_REASON))
        self.assertEqual(out["tables"][0]["rows"][0]["Relationship"], "Child")
        with self.assertRaises(f.PermissionError):
            sv.my_view_impl(2)


if __name__ == "__main__":
    unittest.main()
