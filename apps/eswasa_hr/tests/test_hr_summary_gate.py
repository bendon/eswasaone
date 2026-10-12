"""eswasa_governance.api.hr_summary — Board roles only, and numbers from the Board HR pack."""

from __future__ import annotations

import importlib
import os
import sys
import types
import unittest
from types import SimpleNamespace
from unittest import mock

GOVERNANCE = os.path.join(os.path.dirname(__file__), "..", "..", "eswasa_governance")


class _Err(Exception):
    pass


def _stub_frappe(roles):
    f = types.ModuleType("frappe")
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f._ = lambda s: s
    f.whitelist = lambda *a, **k: (lambda fn: fn)
    f.get_roles = lambda: list(roles)
    f.db = SimpleNamespace(exists=lambda *a, **k: True, count=lambda dt, filters=None: 2)
    utils = types.ModuleType("frappe.utils")
    for n in ("cint", "formatdate", "getdate", "nowdate", "get_datetime", "now_datetime"):
        setattr(utils, n, lambda *a, **k: None)
    model = types.ModuleType("frappe.model")
    workflow = types.ModuleType("frappe.model.workflow")
    workflow.__getattr__ = lambda name: (lambda *a, **k: None)
    f.utils, f.model = utils, model
    return {"frappe": f, "frappe.utils": utils, "frappe.model": model, "frappe.model.workflow": workflow}


class HrSummaryGateTests(unittest.TestCase):
    def _api(self, roles):
        mods = _stub_frappe(roles)
        patcher = mock.patch.dict(sys.modules, mods)
        patcher.start()
        self.addCleanup(patcher.stop)
        sys.path.insert(0, os.path.abspath(GOVERNANCE))
        self.addCleanup(sys.path.remove, os.path.abspath(GOVERNANCE))
        for name in [m for m in sys.modules if m.startswith("eswasa_governance")]:
            sys.modules.pop(name)
        return importlib.import_module("eswasa_governance.api"), mods["frappe"]

    def test_certification_officer_refused(self):
        api, f = self._api(["Eswasa Certification Officer"])
        with self.assertRaisesRegex(f.PermissionError, "can't see the HR summary"):
            api.hr_summary()

    def test_board_member_gets_the_board_pack_numbers(self):
        api, _f = self._api(["Eswasa Board Member"])
        pack = {"headcount": 41, "appraisals": {"people": 40, "manager_done": 30}}
        with mock.patch("eswasa_hr.overview.board_pack_impl", return_value=pack):
            out = api.hr_summary()
        self.assertEqual((out["headcount"], out["appraisal_completion_pct"], out["open_leave"]), (41, 75.0, 2))


if __name__ == "__main__":
    unittest.main()
