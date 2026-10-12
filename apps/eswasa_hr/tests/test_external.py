"""External personnel (plan 07 step 7) — exactly one person, the flag, and the same guards as staff."""

from __future__ import annotations

import unittest

from eswasa_hr import external as ex
from tests import _fakefrappe as ff


class RuleTests(unittest.TestCase):
    def test_exactly_one_person(self):
        self.assertIsNone(ex.person_error("Employee", "EMP-1", None, False))
        self.assertIsNone(ex.person_error(None, "EMP-1", None, False))
        self.assertIn("Choose the employee", ex.person_error("Employee", None, None, False))
        self.assertIn("not both", ex.person_error("Employee", "EMP-1", "EXT-1", True))
        self.assertIsNone(ex.person_error("External", None, "EXT-1", True))
        self.assertIn("not both", ex.person_error("External", "EMP-1", "EXT-1", True))
        self.assertIn("Choose the external person", ex.person_error("External", None, None, True))
        self.assertIn("employee or an external", ex.person_error("Contractor", "EMP-1", None, True))

    def test_flag_off_refuses_external(self):
        self.assertEqual(ex.person_error("External", None, "EXT-1", False), ex.DISABLED)
        self.assertIn("H10", ex.DISABLED)

    def test_old_rows_are_employees(self):
        self.assertEqual(ex.person_type({}), "Employee")
        self.assertEqual(ex.person_type({"person_type": "External"}), "External")

    def test_create_errors(self):
        self.assertEqual(ex.create_errors({"full_name": "Sipho Dube", "role": "Contract auditor"}), [])
        errs = ex.create_errors({"full_name": " ", "role": "Cleaner", "email": "no-at", "organisation": "ACME"})
        self.assertEqual(len(errs), 4)

    def test_head_sees_an_external_authorisation_in_their_department(self):
        from eswasa_hr import scope as sc

        head = sc.Viewer(user="head@x", roles=["Employee"], employee="EMP-9", headed=["Certification"])
        self.assertTrue(sc.can_see("Staff Authorisation", head, {"employee": None, "department": "Certification"}))
        self.assertFalse(sc.can_see("Staff Authorisation", head, {"employee": None, "department": "Metrology"}))
        q = sc.conditions("Staff Authorisation", head, lambda v: f"'{v}'")
        self.assertIn("ifnull(`tabStaff Authorisation`.`employee`, '') = ''", q)
        self.assertIn("`tabStaff Authorisation`.`department` in ('Certification')", q)


def _install(flag: int, store=None, user="hr@x", roles=("HR Manager",)):
    store = store if store is not None else {}
    store.setdefault("__single__", {})["HR Settings"] = {ex.FLAG: flag}
    f = ff.install(store, user=user, roles=roles, today="2026-10-16", doctypes=("External Person", "Impartiality Declaration"))
    f.db.get_single_value = lambda dt, field: store["__single__"].get(dt, {}).get(field)
    return f, store


class FlagTests(unittest.TestCase):
    def tearDown(self):
        ff.uninstall()

    def test_flag_off_returns_disabled_and_lists_nothing(self):
        _install(0, {"External Person": [{"name": "EXT-1", "full_name": "Sipho Dube", "role": "Contract auditor"}]})
        self.assertEqual(ex.create_impl({"full_name": "A B", "role": "Contract auditor"})["disabled"], True)
        self.assertEqual(ex.list_impl(), {"enabled": False, "items": []})
        self.assertIsNone(ex.for_user("sipho@x"))

    def test_flag_on_creates_and_lists(self):
        _, store = _install(1)
        out = ex.create_impl({"full_name": " Sipho Dube ", "role": "Technical expert", "email": "s@x.org"})
        self.assertEqual((out["full_name"], out["status"]), ("Sipho Dube", "Active"))
        self.assertEqual([p["full_name"] for p in ex.list_impl()["items"]], ["Sipho Dube"])

    def test_an_employee_login_is_refused(self):
        _install(1, {"Employee": [{"name": "EMP-1", "user_id": "thandi@x"}]})
        with self.assertRaisesRegex(ff.Throw, "belongs to an employee"):
            ex.create_impl({"full_name": "Thandi", "role": "Contract auditor", "user": "thandi@x"})

    def test_only_hr(self):
        _install(1, user="me@x", roles=("Employee",))
        with self.assertRaisesRegex(ff.Throw, "Only HR"):
            ex.list_impl()


class GuardTests(unittest.TestCase):
    """The authorisation and declaration guards treat an external person as staff; leave doesn't apply."""

    def tearDown(self):
        ff.uninstall()

    def _store(self, valid_to="2026-11-30", declared=True):
        store = {
            "External Person": [{"name": "EXT-1", "full_name": "Sipho Dube", "user": "sipho@x", "status": "Active"}],
            "Skill": [{"name": "FSMS lead auditor", "custom_scheme": "ISO 22000", "custom_kind": "Audit"}],
            "Staff Authorisation": [
                {"name": "SA-1", "external_person": "EXT-1", "skill": "FSMS lead auditor", "docstatus": 1,
                 "status": "Current", "valid_from": "2025-12-01", "valid_to": valid_to}
            ],
            "Impartiality Declaration": [{"name": "IMP-EXT-1-2026", "external_person": "EXT-1", "year": 2026, "docstatus": 1}]
            if declared
            else [],
            "Impartiality Interest": [],
        }
        return store

    def test_authorisation_on_the_visit_date(self):
        from eswasa_hr.authorisations import authorised_reason

        _install(1, self._store(), user="officer@x", roles=("Certification Officer",))
        self.assertEqual(authorised_reason("sipho@x", "ISO 22000", on="2026-11-10"), (True, None))
        ok, reason = authorised_reason("sipho@x", "ISO 22000", on="2026-12-03")
        self.assertFalse(ok)
        self.assertIn("Sipho Dube's authorisation for ISO 22000 expires on 30 November 2026, before the audit", reason)

    def test_flag_off_external_isnt_tracked(self):
        from eswasa_hr.authorisations import authorised_reason

        _install(0, self._store(), user="officer@x", roles=("Certification Officer",))
        self.assertEqual(authorised_reason("sipho@x", "ISO 22000", on="2026-12-03"), (None, None))

    def test_declaration_guard(self):
        from eswasa_hr.declarations import can_act

        _install(1, self._store(declared=False), user="officer@x", roles=("Certification Officer",))
        ok, reason = can_act("sipho@x", on="2026-11-10")
        self.assertFalse(ok)
        self.assertIn("Sipho Dube", reason)
        ff.uninstall()
        _install(1, self._store(), user="officer@x", roles=("Certification Officer",))
        self.assertEqual(can_act("sipho@x", on="2026-11-10"), (True, None))


if __name__ == "__main__":
    unittest.main()
