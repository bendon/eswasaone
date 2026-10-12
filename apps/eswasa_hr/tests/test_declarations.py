"""Yearly declaration (journey J5) — pure rules, plus signing against a fake frappe module."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import declarations as dec


class RuleTests(unittest.TestCase):
    def test_declaration_year_starts_in_april(self):
        self.assertEqual(dec.declaration_year(date(2026, 10, 12)), 2026)
        self.assertEqual(dec.declaration_year(date(2027, 3, 31)), 2026)
        self.assertEqual(dec.declaration_year(date(2027, 4, 1)), 2027)
        self.assertEqual(dec.year_label(2026), "2026/27")

    def test_look_back_is_two_years(self):
        self.assertEqual(dec.look_back_from(date(2026, 10, 12)), date(2024, 10, 12))
        self.assertEqual(dec.look_back_from(date(2028, 2, 29)), date(2026, 2, 28))

    def test_interests_are_cleaned_and_checked(self):
        rows = dec.clean_interests([
            {"organisation": " Sample Foods Ltd ", "relationship": "Former employer", "from_date": "2019-01-01", "to_date": "2020-12-31"},
            {"organisation": "", "relationship": "", "from_date": "", "to_date": ""},
        ])
        self.assertEqual(rows, [{"organisation": "Sample Foods Ltd", "relationship": "Former employer", "from_date": "2019-01-01", "to_date": "2020-12-31"}])
        with self.assertRaisesRegex(ValueError, "Row 1: say what your relationship"):
            dec.clean_interests([{"organisation": "Acme"}])
        with self.assertRaisesRegex(ValueError, "end date for Acme is before"):
            dec.clean_interests([{"organisation": "Acme", "relationship": "Other", "from_date": "2025-05-01", "to_date": "2025-01-01"}])

    def test_signing_rules(self):
        self.assertIn("nothing else", dec.signing_error([], False, True, "Thandi Mamba"))
        self.assertIn("confidentiality", dec.signing_error([], True, False, "Thandi Mamba"))
        self.assertIn("full name", dec.signing_error([], True, True, " "))
        self.assertIsNone(dec.signing_error([], True, True, "Thandi Mamba"))


class CanActRuleTests(unittest.TestCase):
    TODAY = date(2026, 10, 12)

    def test_no_signed_declaration_for_the_work_year(self):
        self.assertEqual(
            dec.act_reason("Thandi Mamba", self.TODAY, self.TODAY, set(), []),
            "Thandi Mamba has no signed impartiality declaration for 2026/27.",
        )
        self.assertIsNone(dec.act_reason("T", self.TODAY, self.TODAY, {2026}, []))

    def test_year_boundary_is_1_april(self):
        # 31 March is still 2026/27; from 1 April the 2027/28 declaration is needed once that year has started
        self.assertIsNone(dec.act_reason("T", date(2027, 3, 31), date(2027, 3, 31), {2026}, []))
        self.assertIn("for 2027/28", dec.act_reason("T", date(2027, 4, 1), date(2027, 4, 1), {2026}, []))
        # planning a visit in next year before it starts: this year's signature is enough (it can't be signed yet)
        self.assertIsNone(dec.act_reason("T", date(2027, 4, 1), self.TODAY, {2026}, []))

    def test_declared_interest_in_the_client(self):
        interests = [{"organisation": "Sample Foods Ltd", "from_date": "2019-01-01", "to_date": "2025-06-30"}]
        self.assertEqual(
            dec.act_reason("T", self.TODAY, self.TODAY, {2026}, interests, " sample  foods ltd"),
            "T has declared an interest in sample  foods ltd, so can't act on its work.",
        )
        self.assertIsNone(dec.act_reason("T", self.TODAY, self.TODAY, {2026}, interests, "Other Co"))
        self.assertIsNone(dec.act_reason("T", self.TODAY, self.TODAY, {2026}, interests))
        # ended more than two years before the work date: outside the look-back
        self.assertIsNone(dec.act_reason("T", date(2027, 7, 1), date(2027, 7, 1), {2027}, interests, "Sample Foods Ltd"))
        ongoing = [{"organisation": "Acme", "from_date": None, "to_date": None}]
        self.assertIn("interest in Acme", dec.act_reason("T", self.TODAY, self.TODAY, {2026}, ongoing, "Acme"))


class _Err(Exception):
    pass


class _Doc(dict):
    """Minimal Frappe Document stand-in."""

    def __getattr__(self, k):
        return self.get(k)

    def __setattr__(self, k, v):
        self[k] = v

    def set(self, k, v):
        self[k] = v

    def append(self, k, row):
        self.setdefault(k, []).append(SimpleNamespace(**row))

    def insert(self):
        self["name"] = f"IMP-{self['employee']}-{self['year']}"
        dec.validate(self)
        STORE[self["name"]] = self
        return self

    def save(self):
        dec.validate(self)
        return self

    def submit(self):
        dec.before_submit(self)
        self["docstatus"] = 1
        dec.on_submit(self)


STORE: dict[str, _Doc] = {}


def _fake(user="thandi@x", roles=("Employee",), todos=None):
    todos = todos if todos is not None else []
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)
    staff = [
        {"name": "EMP-44", "employee_name": "Thandi Mamba", "department": "Certification", "designation": "Lead Auditor", "user_id": "thandi@x"},
        {"name": "EMP-61", "employee_name": "Lindiwe Simelane", "department": "Field Operations", "designation": "Auditor", "user_id": "lindiwe@x"},
        {"name": "EMP-90", "employee_name": "No Login", "department": "ICT", "designation": "Technician", "user_id": None},
    ]

    def get_all(dt, filters=None, fields=None, limit=None, order_by=None):
        if dt == "Employee":
            uid = (filters or {}).get("user_id")
            return [s for s in staff if uid is None or s["user_id"] == uid]
        if dt == dec.DOCTYPE:
            return [{"employee": d["employee"], "signed_on": d.get("signed_on")} for d in STORE.values() if d.get("docstatus") == 1 and d["year"] == filters["year"]]
        if dt == "ToDo":
            return [{"name": t["name"]} for t in todos if t["status"] == "Open" and all(t.get(k) == v for k, v in filters.items() if k != "status")]
        raise AssertionError(dt)

    f.get_all = get_all
    f.db = SimpleNamespace(
        exists=lambda dt, key: (key in STORE) if isinstance(key, str) else any(
            t["status"] == "Open" and all(t.get(k) == v for k, v in key.items() if k != "status") for t in todos),
        get_value=lambda dt, name, field: next((s[field] for s in staff if s["name"] == name), None),
        set_value=lambda dt, name, field, val: next(t for t in todos if t["name"] == name).__setitem__(field, val),
    )

    class _ToDo(dict):
        def insert(self, ignore_permissions=False):
            self["name"] = f"TD-{len(todos) + 1}"
            todos.append(dict(self))

    f.get_doc = lambda d, *a: (_Doc(d) if d.get("doctype") == dec.DOCTYPE else _ToDo(d)) if isinstance(d, dict) else STORE[a[0]]
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda v: date.fromisoformat(str(v))
    utils.nowdate = lambda: "2026-10-12"
    utils.add_days = lambda d, n: date.fromordinal(d.toordinal() + n)
    f.utils = utils
    sys.modules["frappe"] = f
    sys.modules["frappe.utils"] = utils
    return f, todos


class SigningTests(unittest.TestCase):
    def setUp(self):
        STORE.clear()

    def tearDown(self):
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def test_hr_reminds_then_employee_signs_and_task_closes(self):
        f, todos = _fake(user="hr@x", roles=("HR Manager",))
        res = dec.remind_impl()
        self.assertEqual((res["created"], res["without_login"], res["outstanding"]), (2, 1, 3))
        self.assertEqual(todos[0]["description"], "Sign your 2026/27 impartiality and confidentiality declaration")
        self.assertEqual(dec.remind_impl()["created"], 0)  # idempotent

        _fake(user="thandi@x", todos=todos)
        mine = dec.my_declaration_impl()
        self.assertEqual((mine["status"], mine["year_label"], mine["look_back_from"]), ("outstanding", "2026/27", "2024-10-12"))
        self.assertFalse(mine["wording_confirmed"])
        out = dec.sign_impl(
            [{"organisation": "Sample Foods Ltd", "relationship": "Former employer", "from_date": "2019-01-01", "to_date": "2020-12-31"}],
            False, True, "Thandi Mamba",
        )
        self.assertEqual((out["status"], out["signed_on"]), ("signed", "2026-10-12"))
        thandi_todo = next(t for t in todos if t["allocated_to"] == "thandi@x")
        self.assertEqual(thandi_todo["status"], "Closed")

        _fake(user="hr@x", roles=("HR Manager",), todos=todos)
        reg = dec.register_impl()
        self.assertEqual((reg["total"], reg["signed"]), (3, 1))
        self.assertEqual([o["employee_name"] for o in reg["outstanding"]], ["Lindiwe Simelane", "No Login"])

    def test_signing_needs_confidentiality_and_cannot_repeat(self):
        f, _ = _fake()
        with self.assertRaises(f.ValidationError):
            dec.sign_impl([], True, False, "Thandi Mamba")
        dec.sign_impl([], True, True, "Thandi Mamba")
        with self.assertRaisesRegex(f.ValidationError, "already signed"):
            dec.sign_impl([], True, True, "Thandi Mamba")

    def test_only_hr_sees_the_register_and_nobody_signs_for_someone_else(self):
        f, _ = _fake(user="lindiwe@x")
        with self.assertRaises(f.PermissionError):
            dec.register_impl()
        doc = _Doc({"doctype": dec.DOCTYPE, "employee": "EMP-44", "year": 2026, "interests": []})
        with self.assertRaises(f.PermissionError):
            dec.validate(doc)


class HandoffTests(unittest.TestCase):
    """R-H5: an unsigned declaration reaches the line manager once, after the 10 days, never after signing."""

    def setUp(self):
        from unittest import mock

        from tests import _fakefrappe as ff

        self.ff = ff
        self.store = {
            "Employee": [
                {"name": "EMP-44", "employee_name": "Thandi Mamba", "user_id": "thandi@x", "status": "Active", "reports_to": "EMP-10"},
                {"name": "EMP-10", "employee_name": "Sipho Dlamini", "user_id": "sipho@x", "status": "Active", "reports_to": None},
            ],
            "ToDo": [{"name": "TD-1", "reference_type": dec.DOCTYPE, "reference_name": "IMP-EMP-44-2026", "allocated_to": "thandi@x",
                      "status": "Open", "date": "2026-10-22"}],
        }
        p = mock.patch("eswasa_hr.recruitment._hr_manager_users", return_value=["hr1@x"])
        p.start()
        self.addCleanup(mock.patch.stopall)
        self.addCleanup(ff.uninstall)

    def _run(self, today):
        self.ff.install(self.store, today=today, doctypes=("HR Alert",))
        return dec.rh5_escalate()

    def _manager_todos(self):
        return [t for t in self.store["ToDo"] if t["allocated_to"] != "thandi@x"]

    def test_not_before_day_10(self):
        self.assertEqual(self._run("2026-10-22"), 0)
        self.assertEqual(self._manager_todos(), [])

    def test_escalates_to_the_line_manager_once_and_the_employee_todo_stays(self):
        self.assertEqual(self._run("2026-10-23"), 1)
        self.assertEqual(self._run("2026-10-24"), 0)
        [todo] = self._manager_todos()
        self.assertEqual(todo["allocated_to"], "sipho@x")
        self.assertTrue(todo["description"].startswith("Thandi Mamba hasn't signed their 2026/27 impartiality declaration"))
        self.assertEqual(self.store["HR Alert"][0]["key"], "decl-late:EMP-44:2026")
        self.assertEqual(self.store["ToDo"][0]["status"], "Open")

    def test_not_after_signing(self):
        self.store[dec.DOCTYPE] = [{"name": "IMP-EMP-44-2026", "employee": "EMP-44", "year": 2026, "docstatus": 1}]
        self.assertEqual(self._run("2026-10-30"), 0)

    def test_without_a_line_manager_hr_is_told(self):
        self.store["Employee"][0]["reports_to"] = None
        self._run("2026-10-23")
        self.assertEqual([t["allocated_to"] for t in self._manager_todos()], ["hr1@x"])

    def test_rule_dates(self):
        self.assertFalse(dec.handoff_due("2026-10-22", date(2026, 10, 22)))
        self.assertTrue(dec.handoff_due("2026-10-22", date(2026, 10, 23)))
        self.assertFalse(dec.handoff_due(None, date(2026, 10, 23)))


if __name__ == "__main__":
    unittest.main()
