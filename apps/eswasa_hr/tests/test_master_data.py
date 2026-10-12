"""Structure master data — pure rules, plus create/disable on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from types import SimpleNamespace

from eswasa_hr import master_data as md

GROUP = {"is_group": 1, "disabled": 0, "company": "ESWASA"}


class RuleTests(unittest.TestCase):
    def test_parent_must_be_an_enabled_group_in_the_company(self):
        self.assertIsNone(md.parent_error(GROUP, "ESWASA", "department"))
        self.assertIsNone(md.parent_error({"is_group": 1, "disabled": 0, "company": None}, "ESWASA", "department"))  # tree root
        self.assertEqual(md.parent_error({**GROUP, "disabled": 1}, "ESWASA", "department"), "The parent department is disabled.")
        self.assertIn("not a single department", md.parent_error({**GROUP, "is_group": 0}, "ESWASA", "department"))
        self.assertIn("another company", md.parent_error({**GROUP, "company": "Other"}, "ESWASA", "department"))
        self.assertIn("doesn't exist", md.parent_error(None, "ESWASA", "department"))

    def test_create_errors(self):
        self.assertEqual(md.create_errors("department", "Standards", "ESWASA", GROUP, True), [])
        self.assertEqual(md.create_errors("department", "Standards", "ESWASA", {**GROUP, "disabled": 1}, True), ["The parent department is disabled."])
        self.assertIn("Set up the organisation first", md.create_errors("cost_centre", "Lab", None)[0])
        self.assertEqual(md.create_errors("location", "Matsapha", None, duplicate=True), ["A location called Matsapha already exists."])
        self.assertEqual(md.create_errors("designation", " ", None), ["Give the designation a name."])

    def test_disable_blocker_text(self):
        self.assertEqual(
            md.disable_blockers({"people": 3, "staffing_plans": 1, "sub_departments": 0}, "department"),
            "3 active people and 1 submitted Staffing Plan still use this department.",
        )
        self.assertEqual(md.disable_blockers({"people": 1}, "department"), "1 active person still uses this department.")
        self.assertEqual(
            md.disable_blockers({"people": 0, "staffing_plans": 2, "sub_departments": 1}, "department"),
            "2 submitted Staffing Plans and 1 enabled sub-department still use this department.",
        )
        self.assertIsNone(md.disable_blockers({"people": 0, "departments": 0}, "cost centre"))

    def test_head_not_settable_here(self):
        self.assertEqual(md.update_errors("department", "Metrology - ESW", {"custom_head": "EMP-1"}), ["Set the head with Assign head, so the change is recorded."])
        self.assertIn("under itself", md.update_errors("department", "Metrology - ESW", {"parent_department": "Metrology - ESW"})[0])
        self.assertEqual(md.update_errors("designation", "Officer", {"description": "x"}), [])


class _Err(Exception):
    pass


def _fake(roles, rows, counts=None):
    """rows: {(doctype, name): row}; counts: {(doctype, field): n}."""
    counts = counts or {}
    f = types.ModuleType("frappe")
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)
    f.defaults = SimpleNamespace(get_user_default=lambda k: "ESWASA")
    f.saved, f.inserted = [], []

    def exists(dt, name=None):
        if isinstance(name, dict):
            return False
        return (dt, name) in rows or dt == "DocType"

    def get_value(dt, name, fields=None, as_dict=False, **k):
        if isinstance(name, dict):
            return None
        row = rows.get((dt, name))
        return dict(row) if row and as_dict else row

    def count(dt, filters):
        field = next(k for k in filters if k not in ("status", "docstatus", "disabled"))
        return counts.get((dt, field), 0)

    f.db = SimpleNamespace(exists=exists, get_value=get_value, count=count, get_single_value=lambda *a: "ESWASA")

    def get_doc(d, name=None):
        data = dict(d) if isinstance(d, dict) else {"doctype": d, "name": name, **rows[(d, name)]}
        doc = SimpleNamespace(**data)
        doc.insert = lambda: f.inserted.append(data)
        doc.update = lambda u: data.update(u)
        doc.save = lambda: f.saved.append(data)
        doc.as_dict = lambda: data
        return doc

    f.get_doc = get_doc
    sys.modules["frappe"] = f
    return f


class FrappeTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)

    def test_hr_user_cannot_change_the_structure(self):
        f = _fake(["HR User"], {})
        with self.assertRaises(f.PermissionError):
            md.create_impl("location", {"title": "Matsapha"})

    def test_create_under_a_disabled_parent_refused(self):
        f = _fake(["HR Manager"], {("Department", "Ops - ESW"): {**GROUP, "disabled": 1}})
        with self.assertRaisesRegex(f.ValidationError, "The parent department is disabled."):
            md.create_impl("department", {"title": "Standards", "parent_department_id": "Ops - ESW"})
        self.assertEqual(f.inserted, [])

    def test_create_department_under_a_group(self):
        f = _fake(["HR Manager"], {("Department", "Ops - ESW"): GROUP})
        out = md.create_impl("department", {"title": "Standards", "parent_department_id": "Ops - ESW"})
        self.assertEqual((out["department_name"], out["company"], out["parent_department"]), ("Standards", "ESWASA", "Ops - ESW"))

    def test_disable_in_use_department_refused_with_reason(self):
        f = _fake(["HR Manager"], {("Department", "Metrology - ESW"): {"department_name": "Metrology"}},
                  {("Employee", "department"): 3, ("Staffing Plan", "department"): 1})
        with self.assertRaisesRegex(f.ValidationError, "3 active people and 1 submitted Staffing Plan still use this department."):
            md.update_impl("department", "Metrology - ESW", {"status": "archived"})
        self.assertEqual(f.saved, [])

    def test_disable_unused_department(self):
        f = _fake(["HR Manager"], {("Department", "Old - ESW"): {"department_name": "Old"}})
        md.update_impl("department", "Old - ESW", {"status": "archived"})
        self.assertEqual(f.saved[0]["disabled"], 1)

    def test_head_refused_through_update(self):
        f = _fake(["HR Manager"], {("Department", "Metrology - ESW"): {"department_name": "Metrology"}})
        with self.assertRaisesRegex(f.ValidationError, "Assign head"):
            md.update_impl("department", "Metrology - ESW", {"custom_head": "EMP-1"})


if __name__ == "__main__":
    unittest.main()
