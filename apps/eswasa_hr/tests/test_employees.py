"""Add a person / edit job fields — pure rules, plus create on a fake frappe (invite, link, User Permission)."""

from __future__ import annotations

import sys
import types
import unittest
from types import SimpleNamespace

from eswasa_hr import employees as em

LEAF = {"is_group": 0, "disabled": 0, "company": "ESWASA"}
FULL = {"employee_name": "Nomsa Mabuza", "gender": "Female", "date_of_birth": "1990-04-02", "date_of_joining": "2026-11-01"}


class CreateRuleTests(unittest.TestCase):
    def test_each_required_field_reported_and_none_defaulted(self):
        errs = em.create_errors({"employee_name": "Nomsa Mabuza"})
        self.assertEqual(errs, ["Gender is required.", "Date of birth is required.", "Date of joining is required."])
        self.assertEqual(em.create_errors({}), ["Name is required.", "Gender is required.", "Date of birth is required.", "Date of joining is required."])
        self.assertEqual(em.create_errors(FULL), [])

    def test_department_must_be_an_enabled_leaf_in_the_company(self):
        row = {**FULL, "department": "Metrology - ESW"}
        self.assertEqual(em.create_errors(row, LEAF, company="ESWASA"), [])
        self.assertEqual(em.create_errors(row, {**LEAF, "is_group": 1}, company="ESWASA"), ["Choose a department, not a group of departments."])
        self.assertEqual(em.create_errors(row, {**LEAF, "disabled": 1}, company="ESWASA"), ["That department is disabled."])
        self.assertEqual(em.create_errors(row, {**LEAF, "company": "Other"}, company="ESWASA"), ["That department belongs to another company."])
        self.assertEqual(em.create_errors(row, None, company="ESWASA"), ["That department doesn't exist."])

    def test_designation_must_exist_and_invite_needs_an_email(self):
        self.assertEqual(em.create_errors({**FULL, "designation": "Ghost"}, designation_exists=False), ["That designation doesn't exist."])
        self.assertEqual(em.create_errors({**FULL, "invite": True}), ["Give an email address to send the invitation to."])

    def test_invite_roles_are_limited(self):
        self.assertEqual(em.invite_roles(None, ["HR User"]), list(em.INVITE_DEFAULT_ROLES))
        self.assertEqual(em.invite_roles(["System Manager", "Employee"], ["HR Manager"]), ["Employee"])
        self.assertEqual(em.invite_roles(["HR Manager", "Employee"], ["HR User"]), ["Employee"])
        self.assertEqual(em.invite_roles(["HR Manager"], ["HR Manager"]), ["HR Manager"])

    def test_no_second_login(self):
        self.assertIsNone(em.link_error("a@x", False, None))
        self.assertIsNone(em.link_error("a@x", True, None))
        self.assertIn("already logs in as EMP-1", em.link_error("a@x", True, "EMP-1"))

    def test_name_split(self):
        self.assertEqual(em.split_name("Nomsa Thandi Mabuza"), ("Nomsa", "Thandi Mabuza"))
        self.assertEqual(em.split_name("Nomsa", last="Dlamini"), ("Nomsa", "Dlamini"))


class UpdateRuleTests(unittest.TestCase):
    def test_protected_fields_refused(self):
        self.assertIn("Date of birth is a protected detail", em.update_errors({"date_of_birth": "1990-01-01"}, "Active")[0])
        self.assertIn("Account number is a protected detail", em.update_errors({"bank_ac_no": "1"}, "Inactive")[0])
        self.assertIn("can't be changed here", em.update_errors({"ctc_extra": 1}, "Active")[0])

    def test_active_record_moves_go_through_promotion_or_transfer(self):
        errs = em.update_errors({"department": "Finance", "reports_to": "EMP-2"}, "Active")
        self.assertEqual(len(errs), 1)
        self.assertIn("Department, Reports to on an active record change through a promotion or transfer", errs[0])
        self.assertEqual(em.update_errors({"department": "Finance"}, "Inactive"), [])
        self.assertEqual(em.update_errors({"employee_name": "N. Mabuza", "company_email": "n@x"}, "Active"), [])

    def test_leaving_goes_through_separation(self):
        self.assertIn("separation", em.update_errors({"status": "Left"}, "Active")[0])
        self.assertEqual(em.update_errors({"status": "Suspended"}, "Active"), [])
        self.assertEqual(em.update_errors({}, "Active"), ["Nothing to change."])


class _Err(Exception):
    pass


def _fake(roles, users=None, employees=None):
    """users: {email: name}; employees: {name: row}. Records inserted docs in f.inserted."""
    users, employees = dict(users or {}), dict(employees or {})
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user="hr@x")
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)
    f.inserted = []
    f.defaults = SimpleNamespace(get_user_default=lambda k: "ESWASA")

    def get_value(dt, filters, fields=None, as_dict=False, **k):
        if dt == "Department":
            return dict(LEAF)
        if dt == "User":
            key = filters.get("name") or filters.get("email")
            return key if key in users else None
        if dt == "Employee":
            if isinstance(filters, dict):
                return next((n for n, e in employees.items() if e.get("user_id") == filters.get("user_id")), None)
            row = employees.get(filters)
            if row is None:
                return None
            return {k2: row.get(k2) for k2 in fields} if isinstance(fields, list) else row.get(fields)
        return None

    f.db = SimpleNamespace(get_value=get_value, exists=lambda dt, name=None: True, get_single_value=lambda *a: "ESWASA")

    def get_doc(d, name=None):
        doc = SimpleNamespace(**d) if isinstance(d, dict) else SimpleNamespace(**employees[name])

        def insert(ignore_permissions=False):
            doc.name = doc.email if d["doctype"] == "User" else "HR-EMP-9"
            f.inserted.append((dict(d), ignore_permissions))
            if d["doctype"] == "Employee":
                employees[doc.name] = {**d, "name": doc.name}

        doc.insert = insert
        return doc

    f.get_doc = get_doc
    sys.modules["frappe"] = f
    return f


class CreateTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)

    def test_only_hr_can_add(self):
        f = _fake(["Employee"])
        with self.assertRaises(f.PermissionError):
            em.create_impl(FULL)

    def test_missing_fields_are_one_plain_validation_error(self):
        f = _fake(["HR User"])
        with self.assertRaisesRegex(f.ValidationError, "Gender is required. Date of birth is required."):
            em.create_impl({"employee_name": "Nomsa Mabuza", "date_of_joining": "2026-11-01"})
        self.assertEqual(f.inserted, [])

    def test_invite_creates_the_login_and_links_it_with_a_user_permission(self):
        f = _fake(["HR User"])
        out = em.create_impl({**FULL, "department": "Metrology - ESW", "invite": True, "email": "Nomsa@Eswasa.org.sz", "roles": ["HR Manager", "Employee"]})
        (user, user_ip), (emp, emp_ip) = f.inserted
        self.assertEqual((user["doctype"], user["email"], user["send_welcome_email"], user_ip), ("User", "nomsa@eswasa.org.sz", 1, True))
        self.assertEqual(user["roles"], [{"role": "Employee"}])  # an HR User can't make an HR Manager
        self.assertEqual((emp["user_id"], emp["create_user_permission"], emp["company"], emp_ip), ("nomsa@eswasa.org.sz", 1, "ESWASA", False))
        self.assertEqual(out["user_id"], "nomsa@eswasa.org.sz")

    def test_existing_unlinked_login_is_reused_not_duplicated(self):
        f = _fake(["HR Manager"], users={"nomsa@x": "nomsa@x"})
        em.create_impl({**FULL, "invite": True, "email": "nomsa@x"})
        self.assertEqual([d["doctype"] for d, _ in f.inserted], ["Employee"])
        self.assertEqual(f.inserted[0][0]["user_id"], "nomsa@x")

    def test_second_user_for_someone_who_logs_in_refused(self):
        f = _fake(["HR Manager"], users={"nomsa@x": "nomsa@x"}, employees={"EMP-1": {"name": "EMP-1", "user_id": "nomsa@x"}})
        with self.assertRaisesRegex(f.ValidationError, "already logs in as EMP-1"):
            em.create_impl({**FULL, "invite": True, "email": "nomsa@x"})
        self.assertEqual(f.inserted, [])


class UpdateTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)

    def test_active_department_change_redirected(self):
        f = _fake(["HR Manager"], employees={"EMP-1": {"name": "EMP-1", "status": "Active"}})
        with self.assertRaisesRegex(f.ValidationError, "promotion or transfer"):
            em.update_impl("EMP-1", {"department": "Finance"})

    def test_unknown_employee(self):
        f = _fake(["HR Manager"])
        with self.assertRaises(f.DoesNotExistError):
            em.update_impl("EMP-404", {"employee_name": "X"})


if __name__ == "__main__":
    unittest.main()
