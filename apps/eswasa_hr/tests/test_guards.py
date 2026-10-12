"""Plan 07 steps 1–4 (+ plan 03 step 5): the assignment guards against a fake frappe module."""

from __future__ import annotations

import unittest

from tests import _fakefrappe as ff

TODAY = "2026-10-12"


def _store(**extra):
    store = {
        "Employee": [
            {"name": "HR-EMP-0044", "employee_name": "Thandi Mamba", "user_id": "thandi@x", "status": "Active"},
        ],
        "Skill": [
            {"name": "FSMS Lead Auditor", "custom_kind": "Audit", "custom_scheme": "FSMS"},
            {"name": "FSMS Review", "custom_kind": "Technical review", "custom_scheme": "FSMS"},
            {"name": "Mass calibration", "custom_kind": "Calibration", "custom_scheme": "TM-MASS"},
        ],
        "Staff Authorisation": [
            {"name": "SA-1", "employee": "HR-EMP-0044", "skill": "FSMS Lead Auditor", "docstatus": 1, "status": "Expiring", "valid_from": "2025-12-01", "valid_to": "2026-11-30"},
            {"name": "SA-2", "employee": "HR-EMP-0044", "skill": "Mass calibration", "docstatus": 1, "status": "Current", "valid_from": "2025-01-01", "valid_to": "2027-12-31"},
        ],
        "Impartiality Declaration": [
            {"name": "IMP-HR-EMP-0044-2026", "employee": "HR-EMP-0044", "year": 2026, "docstatus": 1},
        ],
        "Impartiality Interest": [
            {"parent": "IMP-HR-EMP-0044-2026", "organisation": "Sample Foods Ltd", "from_date": "2019-01-01", "to_date": "2025-06-30"},
        ],
        "Leave Application": [
            {"name": "L1", "employee": "HR-EMP-0044", "employee_name": "Thandi Mamba", "leave_type": "Annual", "from_date": "2026-11-02", "to_date": "2026-11-06", "status": "Approved", "docstatus": 1},
        ],
        "Instrument": [{"name": "INS-1", "owner_customer": "Sample Foods Ltd"}, {"name": "INS-2", "owner_customer": "Other Co"}],
    }
    store.update(extra)
    return store


def _install(store):
    f = ff.install(store, today=TODAY, doctypes=("Staff Authorisation", "Impartiality Declaration"))
    from eswasa_hr import competence

    competence.frappe = f  # bound at import; point it at this test's stand-in
    competence.getdate = f.utils.getdate
    return f, competence


class _Job(dict):
    def __init__(self, changed=None, new=False, **kw):
        super().__init__(kw)
        self._changed, self._new = changed, new

    def is_new(self):
        return self._new

    def has_value_changed(self, field):
        return self._changed is None or field in self._changed


class AuthorisationTests(unittest.TestCase):
    def tearDown(self):
        ff.uninstall()

    def test_valid_today_but_expired_on_the_visit_date(self):
        _install(_store())
        from eswasa_hr import authorisations as au

        self.assertEqual(au.authorised_reason("thandi@x", "FSMS", on="2026-11-20"), (True, None))
        ok, reason = au.authorised_reason("thandi@x", "FSMS", on="2026-12-03")
        self.assertFalse(ok)
        self.assertEqual(reason, "Thandi Mamba's authorisation for FSMS expires on 30 November 2026, before the audit on 3 December 2026.")
        self.assertTrue(au.authorised_for_scheme("thandi@x", "FSMS"))
        self.assertFalse(au.authorised_for_scheme("thandi@x", "FSMS", "2026-12-03"))

    def test_hr_has_nothing_for_it(self):
        _install(_store())
        from eswasa_hr import authorisations as au

        self.assertEqual(au.authorised_reason("thandi@x", "QMS"), (None, None))  # no Skill for the scheme
        self.assertEqual(au.authorised_reason("admin@x", "FSMS"), (None, None))  # no Employee record
        ok, reason = au.authorised_reason("thandi@x", "FSMS", kind="Technical review")
        self.assertEqual((ok, reason), (False, "Thandi Mamba isn't authorised for FSMS."))


class DeclarationTests(unittest.TestCase):
    def tearDown(self):
        ff.uninstall()

    def test_can_act(self):
        store = _store()
        _install(store)
        from eswasa_hr import declarations as dec

        self.assertEqual(dec.can_act("thandi@x", on="2026-12-03"), (True, None))
        self.assertEqual(dec.can_act("HR-EMP-0044", on="2026-12-03", party="Sample Foods Ltd")[1], "Thandi Mamba has declared an interest in Sample Foods Ltd, so can't act on its work.")
        self.assertEqual(dec.can_act("admin@x"), (True, None))  # not tracked by HR
        store["Impartiality Declaration"][0]["docstatus"] = 0  # a draft isn't signed
        self.assertEqual(dec.can_act("thandi@x"), (False, "Thandi Mamba has no signed impartiality declaration for 2026/27."))


class AssignmentTests(unittest.TestCase):
    def tearDown(self):
        ff.uninstall()

    def test_each_guard_refuses_in_order(self):
        store = _store()
        _, comp = _install(store)
        self.assertIsNone(comp.assignment_error("thandi@x", "2026-11-20", scheme="FSMS", party="Other Co"))
        self.assertIn("expires on 30 November 2026", comp.assignment_error("thandi@x", "2026-12-03", scheme="FSMS"))
        self.assertIn("interest in Sample Foods Ltd", comp.assignment_error("thandi@x", "2026-11-20", scheme="FSMS", party="Sample Foods Ltd"))
        self.assertEqual(
            comp.assignment_error("thandi@x", "2026-11-04", scheme="FSMS", work="visit"),
            "Thandi Mamba is on approved leave 2 Nov 2026–6 Nov 2026, so can't take this visit.",
        )
        store["Impartiality Declaration"].clear()
        self.assertIn("no signed impartiality declaration", comp.assignment_error("thandi@x", "2026-11-20", scheme="FSMS"))
        self.assertIsNone(comp.assignment_error(None, "2026-11-20"))

    def test_calibration_job(self):
        f, comp = _install(_store())
        ok = _Job(new=True, assigned_to="thandi@x", test_method="TM-MASS", instrument="INS-2", received_on="2026-10-12 09:00:00", due_on="2026-10-20")
        comp.validate_calibration_job(ok)
        # outside the technician's discipline: HR has a competence for TM-TEMP and Thandi doesn't hold it
        f, comp = _install(_store(Skill=[{"name": "Temp calibration", "custom_kind": "Calibration", "custom_scheme": "TM-TEMP"}]))
        with self.assertRaisesRegex(f.ValidationError, "isn't authorised for TM-TEMP"):
            comp.validate_calibration_job(_Job(new=True, assigned_to="thandi@x", test_method="TM-TEMP", due_on="2026-10-20"))
        # a method HR has no competence for isn't blocked (provisional until H7)
        comp.validate_calibration_job(_Job(new=True, assigned_to="thandi@x", test_method="TM-PRESSURE", instrument="INS-2", due_on="2026-10-20"))
        f, comp = _install(_store())
        with self.assertRaisesRegex(f.ValidationError, "on approved leave"):
            comp.validate_calibration_job(_Job(new=True, assigned_to="thandi@x", test_method="TM-MASS", due_on="2026-11-03"))
        with self.assertRaisesRegex(f.ValidationError, "interest in Sample Foods Ltd"):
            comp.validate_calibration_job(_Job(new=True, assigned_to="thandi@x", test_method="TM-MASS", instrument="INS-1", due_on="2026-10-20"))
        # a later save that doesn't change the technician or dates isn't re-checked
        comp.validate_calibration_job(_Job(changed={"workflow_state"}, assigned_to="thandi@x", test_method="TM-MASS", instrument="INS-1"))
        comp.validate_calibration_job(_Job(new=True, assigned_to=None, test_method="TM-MASS"))


if __name__ == "__main__":
    unittest.main()
