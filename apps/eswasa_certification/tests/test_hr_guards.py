"""Plan 07 step 3: certification asks HR's guards (authorisation on the visit date, declaration, leave),
and keeps working on installs without eswasa_hr. Runs against a small frappe stand-in."""

from __future__ import annotations

import importlib
import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace


class _Throw(Exception):
    pass


def _install_frappe(values):
    f = types.ModuleType("frappe")
    f.ValidationError = type("ValidationError", (_Throw,), {})
    f.session = SimpleNamespace(user="lindiwe@x")

    def throw(msg, exc=_Throw):
        raise exc(msg)

    def get_value(dt, name, field=None, as_dict=False):
        row = values.get((dt, name))
        if row is None:
            return None
        if isinstance(field, list):
            return {k: row.get(k) for k in field}
        return row.get(field)

    f.throw = throw
    f.db = SimpleNamespace(get_value=get_value)
    f.get_all = lambda *a, **kw: []
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda v: v if isinstance(v, date) else date.fromisoformat(str(v)[:10])
    utils.today = utils.nowdate = lambda: "2026-10-12"
    utils.cint = lambda v: int(v or 0)
    utils.add_days = utils.add_months = utils.now_datetime = lambda *a: None
    f.utils = utils
    sys.modules["frappe"] = f
    sys.modules["frappe.utils"] = utils
    return f


class _Doc(dict):
    def __init__(self, changed=None, new=False, **kw):
        super().__init__(kw)
        self._changed, self._new = changed, new

    def is_new(self):
        return self._new

    def has_value_changed(self, field):
        return self._changed is None or field in self._changed


class HrGuardWiringTests(unittest.TestCase):
    VALUES = {
        ("Auditor", "AUD-1"): {"user": "thandi@x", "assignment_blocked": 0},
        ("Certification Application", "APP-1"): {"applicant_org": "Sample Foods Ltd", "applicant_name": "S. Dlamini"},
    }

    def setUp(self):
        self.calls = []
        self.reason = None
        self.f = _install_frappe(self.VALUES)
        hr = types.ModuleType("eswasa_hr.competence")

        def assignment_error(user, on, scheme=None, party=None, kind=None, work="audit"):
            self.calls.append({"user": user, "on": str(on), "scheme": scheme, "party": party, "kind": kind, "work": work})
            return self.reason

        hr.assignment_error = assignment_error
        auth = types.ModuleType("eswasa_hr.authorisations")
        auth.authorised_for_scheme = lambda user, scheme, on=None: None
        sys.modules.update({"eswasa_hr": types.ModuleType("eswasa_hr"), "eswasa_hr.competence": hr, "eswasa_hr.authorisations": auth})
        self.rules = importlib.reload(importlib.import_module("eswasa_certification.rules"))

    def tearDown(self):
        for m in ("frappe", "frappe.utils", "eswasa_hr", "eswasa_hr.competence", "eswasa_hr.authorisations"):
            sys.modules.pop(m, None)

    def test_audit_asks_hr_on_the_audit_date_with_the_client(self):
        self.rules.validate_auditor_assignment(_Doc(new=True, auditor="AUD-1", scheme="FSMS", application="APP-1", planned_date="2026-12-03"))
        self.assertEqual(self.calls, [{"user": "thandi@x", "on": "2026-12-03", "scheme": "FSMS", "party": "Sample Foods Ltd", "kind": None, "work": "audit"}])

    def test_each_refusal_reaches_the_user_unchanged(self):
        for reason in (
            "Thandi Mamba's authorisation for FSMS expires on 30 November 2026, before the audit on 3 December 2026.",
            "Thandi Mamba has no signed impartiality declaration for 2026/27.",
            "Thandi Mamba is on approved leave 2 Nov 2026–6 Nov 2026, so can't take this audit.",
        ):
            self.reason = reason
            with self.assertRaises(self.f.ValidationError) as ctx:
                self.rules.validate_auditor_assignment(_Doc(new=True, auditor="AUD-1", scheme="FSMS", planned_date="2026-12-03"))
            self.assertEqual(str(ctx.exception), reason)

    def test_status_saves_are_not_rechecked(self):
        self.reason = "refused"
        self.rules.validate_auditor_assignment(_Doc(changed={"status"}, auditor="AUD-1", scheme="FSMS", planned_date="2026-12-03"))
        self.rules.validate_auditor_assignment(_Doc(new=True, auditor="AUD-1", status="Cancelled"))
        self.assertEqual(self.calls, [])

    def test_field_visit_and_decision(self):
        self.reason = "Thandi Mamba has declared an interest in Sample Foods Ltd, so can't act on its work."
        with self.assertRaises(self.f.ValidationError):
            self.rules.validate_field_visit_assignment(_Doc(new=True, lead_auditor="thandi@x", scheme="FSMS", customer="Sample Foods Ltd", planned_date="2026-11-20"))
        with self.assertRaises(self.f.ValidationError):
            self.rules.validate_certification_decision(_Doc(scheme="FSMS", holder_name="Sample Foods Ltd", issued_on="2026-10-12"))
        self.assertEqual([c["work"] for c in self.calls], ["visit", "certification decision"])
        self.assertEqual(self.calls[1]["user"], "lindiwe@x")
        self.assertEqual(self.calls[1]["kind"], "Technical review")

    def test_without_eswasa_hr(self):
        sys.modules["eswasa_hr.competence"] = None  # import raises ImportError
        sys.modules["eswasa_hr.authorisations"] = None
        self.reason = "never asked"
        self.rules.validate_auditor_assignment(_Doc(new=True, auditor="AUD-1", scheme="FSMS", planned_date="2026-12-03"))
        self.rules.validate_field_visit_assignment(_Doc(new=True, lead_auditor="thandi@x", planned_date="2026-11-20"))
        self.rules.validate_certification_decision(_Doc(scheme="FSMS"))
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
