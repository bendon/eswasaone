"""Row scoping (brief §11, Acceptance §14.8) — pure rules, plus the hooks on a fake frappe."""

from __future__ import annotations

import ast
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace

from eswasa_hr import scope as sc

# ed ← nt ← sm ← tm ;  nt ← nd ; peer has no reports
EDGES = [("nt", "ed"), ("sm", "nt"), ("nd", "nt"), ("tm", "sm"), ("peer", "ed")]


def esc(v: str) -> str:
    return "'" + v.replace("'", "''") + "'"


def viewer(emp, roles=("Employee",), user="u@x", headed=()):
    return sc.Viewer(user=user, roles=list(roles), employee=emp, reports=sc.report_tree(emp, EDGES) if emp else [], headed=list(headed))


class VisibleTests(unittest.TestCase):
    def test_manager_sees_direct_and_indirect_reports(self):
        self.assertTrue(sc.visible(["Employee"], "nt", "sm", EDGES))
        self.assertTrue(sc.visible(["Employee"], "nt", "tm", EDGES))  # indirect
        self.assertTrue(sc.visible(["Employee"], "nt", "nt", EDGES))  # self
        self.assertFalse(sc.visible(["Employee"], "nt", "ed", EDGES))  # not upwards

    def test_peer_sees_nothing_but_themselves(self):
        self.assertFalse(sc.visible(["Employee"], "peer", "nt", EDGES))
        self.assertFalse(sc.visible(["Employee"], "peer", "tm", EDGES))
        self.assertFalse(sc.visible(["Employee"], None, "tm", EDGES))

    def test_hr_sees_all(self):
        for role in sc.HR_ROLES:
            self.assertTrue(sc.visible([role], None, "tm", EDGES))


class RowRuleTests(unittest.TestCase):
    def test_employee(self):
        v = viewer("nt")
        self.assertTrue(sc.can_see("Employee", v, {"name": "tm"}))
        self.assertFalse(sc.can_see("Employee", v, {"name": "peer"}))

    def test_leave_applicant_and_approver_only(self):
        v = viewer("tm", user="tm@x")
        self.assertTrue(sc.can_see("Leave Application", v, {"employee": "tm"}))
        self.assertTrue(sc.can_see("Leave Application", v, {"employee": "peer", "leave_approver": "tm@x"}))
        self.assertFalse(sc.can_see("Leave Application", v, {"employee": "peer", "leave_approver": "nt@x"}))
        self.assertFalse(sc.can_see("Leave Application", viewer(None, user="x@x"), {"employee": None, "leave_approver": None}))

    def test_appraisal_chain(self):
        v = viewer("nt")
        self.assertTrue(sc.can_see("Appraisal", v, {"employee": "tm"}))
        self.assertFalse(sc.can_see("Appraisal", viewer("tm"), {"employee": "nt"}))

    def test_authorisation_person_and_department_head(self):
        head = viewer("nd", headed=["Metrology - ESW"])
        self.assertTrue(sc.can_see("Staff Authorisation", head, {"employee": "peer", "department": "Metrology - ESW"}))
        self.assertFalse(sc.can_see("Staff Authorisation", head, {"employee": "peer", "department": "Finance - ESW"}))
        self.assertTrue(sc.can_see("Staff Authorisation", viewer("peer"), {"employee": "peer", "department": "Finance - ESW"}))

    def test_document_person_only_not_manager(self):
        self.assertTrue(sc.can_see("Employee Document", viewer("tm"), {"employee": "tm"}))
        self.assertFalse(sc.can_see("Employee Document", viewer("nt"), {"employee": "tm"}))

    def test_hr_sees_every_row(self):
        hr = viewer(None, roles=["HR User"])
        for dt in sc.DOCTYPES:
            self.assertTrue(sc.can_see(dt, hr, {"name": "x", "employee": "peer"}))


class QueryTests(unittest.TestCase):
    def test_hr_gets_no_condition(self):
        for dt in sc.DOCTYPES:
            self.assertEqual(sc.conditions(dt, viewer(None, roles=["HR Manager"]), esc), "")

    def test_query_narrows_only(self):
        # Non-HR always gets a restriction, and someone with no employee record matches nothing.
        nobody = viewer(None, user="guest@x")
        for dt in sc.DOCTYPES:
            q = sc.conditions(dt, nobody, esc)
            self.assertTrue(q, dt)
            self.assertNotIn(" or 1=1", q)
        self.assertEqual(sc.conditions("Employee", nobody, esc), "1=0")
        self.assertEqual(sc.conditions("Employee Document", nobody, esc), "1=0")
        self.assertEqual(sc.conditions("Leave Application", nobody, esc), "(1=0 or `tabLeave Application`.`leave_approver` = 'guest@x')")

    def test_manager_query_lists_self_and_reports(self):
        self.assertEqual(sc.conditions("Employee", viewer("nt"), esc), "`tabEmployee`.`name` in ('nt', 'sm', 'nd', 'tm')")
        self.assertEqual(sc.conditions("Appraisal", viewer("sm"), esc), "`tabAppraisal`.`employee` in ('sm', 'tm')")

    def test_head_query_uses_departments(self):
        q = sc.conditions("Staff Authorisation", viewer("nd", headed=["Metrology - ESW"]), esc)
        self.assertIn("`department` in ('Metrology - ESW')", q)
        self.assertEqual(sc.conditions("Staff Authorisation", viewer("tm"), esc), "(`tabStaff Authorisation`.`employee` in ('tm') or 1=0)")

    def test_values_are_escaped(self):
        q = sc.conditions("Leave Application", viewer(None, user="o'brien@x"), esc)
        self.assertIn("'o''brien@x'", q)


def _fake(user, roles, employees, departments=None, leave=None):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    f.local = SimpleNamespace()
    f.get_roles = lambda u=None: list(roles)

    def get_all(dt, filters=None, fields=None, limit=None, **k):
        if dt == "Employee":
            return [{"name": n, "reports_to": e.get("reports_to")} for n, e in employees.items()]
        if dt == "Department":
            return [{"name": d} for d, head in (departments or {}).items() if head == filters.get("custom_head")]
        return []

    def get_value(dt, filters, fields=None, as_dict=False, **k):
        if dt == "Employee" and isinstance(filters, dict):
            return next((n for n, e in employees.items() if e.get("user_id") == filters["user_id"]), None)
        if dt == "Employee":
            return employees.get(filters, {}).get(fields)
        if dt == "Leave Application":
            return (leave or {}).get(filters)
        return None

    f.get_all = get_all
    f.db = SimpleNamespace(get_value=get_value, escape=esc)
    sys.modules["frappe"] = f
    return f


EMPLOYEES = {
    "nt": {"user_id": "nt@x", "reports_to": "ed", "department": "Metrology - ESW"},
    "sm": {"user_id": "sm@x", "reports_to": "nt", "department": "Metrology - ESW"},
    "tm": {"user_id": "tm@x", "reports_to": "sm", "department": "Metrology - ESW"},
    "peer": {"user_id": "peer@x", "reports_to": "ed", "department": "Finance - ESW"},
}


class HookTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)

    def test_manager_list_and_doc(self):
        _fake("nt@x", ["Employee"], EMPLOYEES)
        self.assertEqual(sc.employee_query("nt@x"), "`tabEmployee`.`name` in ('nt', 'sm', 'tm')")
        self.assertTrue(sc.employee_has_permission(SimpleNamespace(name="tm"), "read", "nt@x"))
        self.assertFalse(sc.employee_has_permission(SimpleNamespace(name="peer"), "read", "nt@x"))

    def test_hr_unrestricted(self):
        _fake("hr@x", ["HR User"], EMPLOYEES)
        self.assertEqual(sc.employee_query("hr@x"), "")
        self.assertTrue(sc.document_has_permission({"name": "D1", "employee": "peer"}, "read", "hr@x"))

    def test_leave_by_name_and_by_doc(self):
        _fake("nt@x", ["Employee"], EMPLOYEES, leave={"LA-1": {"name": "LA-1", "employee": "tm", "leave_approver": "nt@x"}})
        self.assertTrue(sc.leave_has_permission("LA-1", "read", "nt@x"))  # approver
        self.assertFalse(sc.leave_has_permission({"name": "LA-2", "employee": "tm", "leave_approver": "sm@x"}, "read", "nt@x"))

    def test_authorisation_head(self):
        _fake("nt@x", ["Employee"], EMPLOYEES, departments={"Metrology - ESW": "nt"})
        self.assertTrue(sc.authorisation_has_permission({"name": "SA-1", "employee": "tm"}, "submit", "nt@x"))
        self.assertFalse(sc.authorisation_has_permission({"name": "SA-2", "employee": "peer"}, "read", "nt@x"))

    def test_appraisal_peer_refused(self):
        _fake("peer@x", ["Employee"], EMPLOYEES)
        self.assertFalse(sc.appraisal_has_permission({"name": "AP-1", "employee": "tm"}, "read", "peer@x"))
        self.assertTrue(sc.appraisal_has_permission({"name": "AP-2", "employee": "peer"}, "read", "peer@x"))


class BackfillTests(unittest.TestCase):
    def test_creates_own_record_permission_once_and_skips_managers(self):
        from eswasa_hr.patches.v1 import own_record_user_permission as p

        emps = [{"name": "tm", "user_id": "tm@x"}, {"name": "sm", "user_id": "sm@x"}, {"name": "nt", "user_id": "nt@x"}, {"name": "nl", "user_id": None}]
        rows = p.missing(emps, existing={("sm@x", "sm")}, managers={"nt"})
        self.assertEqual([(r["user"], r["for_value"]) for r in rows], [("tm@x", "tm")])
        self.assertEqual((rows[0]["allow"], rows[0]["apply_to_all_doctypes"], rows[0]["applicable_for"]), ("Employee", 0, "Employee"))
        self.assertEqual(p.missing(emps, existing={("sm@x", "sm"), ("tm@x", "tm")}, managers={"nt"}), [])  # idempotent

    def test_listed_in_patches_txt(self):
        self.assertIn("eswasa_hr.patches.v1.own_record_user_permission", (Path(sc.__file__).parent / "patches.txt").read_text())


class HookRegistrationTests(unittest.TestCase):
    """Every scoped doctype has both hooks, and each points at a function that exists."""

    def test_hooks_registered(self):
        tree = ast.parse((Path(sc.__file__).parent / "hooks.py").read_text())
        found = {}
        for node in tree.body:
            if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id in ("permission_query_conditions", "has_permission"):
                found[node.targets[0].id] = ast.literal_eval(node.value)
        for key in ("permission_query_conditions", "has_permission"):
            for dt in sc.DOCTYPES:
                path = found[key][dt]
                self.assertTrue(path.startswith("eswasa_hr.scope."), path)
                self.assertTrue(callable(getattr(sc, path.rsplit(".", 1)[1])), path)


if __name__ == "__main__":
    unittest.main()
