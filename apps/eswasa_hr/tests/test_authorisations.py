"""Staff authorisations (journey J4) — pure rules, plus routing and approval against a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import authorisations as au

TODAY = date(2026, 10, 12)
_DETAIL = au.detail_impl


class RuleTests(unittest.TestCase):
    def test_status(self):
        self.assertEqual(au.status_on(0, "2029-11-30", TODAY), "In training")
        self.assertEqual(au.status_on(1, "2029-11-30", TODAY), "Current")
        self.assertEqual(au.status_on(1, "2026-11-30", TODAY), "Expiring")
        self.assertEqual(au.status_on(1, "2026-10-11", TODAY), "Expired")
        self.assertEqual(au.status_on(1, None, TODAY), "Current")
        self.assertEqual(au.status_on(1, "2029-11-30", TODAY, withdrawn=True), "Withdrawn")

    def test_default_validity(self):
        self.assertEqual(au.default_valid_to("2026-12-01", 36), date(2029, 11, 30))
        self.assertEqual(au.default_valid_to("2026-01-31", 1), date(2026, 2, 27))
        self.assertIsNone(au.default_valid_to("2026-12-01", None))

    def test_four_eyes(self):
        self.assertIsNone(au.approver_error("nomvula@x", "nomvula@x", "thandi@x", "hr@x"))
        self.assertIn("no head", au.approver_error("nomvula@x", None, "thandi@x", "hr@x"))
        self.assertIn("own", au.approver_error("thandi@x", "thandi@x", "thandi@x", "hr@x"))
        self.assertIn("prepared", au.approver_error("nomvula@x", "nomvula@x", "thandi@x", "nomvula@x"))
        self.assertIn("head of the person", au.approver_error("sipho@x", "nomvula@x", "thandi@x", "hr@x"))

    def test_cover_counts_holders_and_expiring(self):
        rows = [
            {"skill": "FSMS", "status": "Current"}, {"skill": "FSMS", "status": "Expiring"},
            {"skill": "FSMS", "status": "In training"}, {"skill": "OHS", "status": "Expired"},
        ]
        self.assertEqual(au.cover(rows), {"FSMS": {"holders": 2, "expiring": 1}, "OHS": {"holders": 0, "expiring": 0}})

    def test_evidence(self):
        self.assertEqual(
            au.clean_evidence([{"evidence_type": "Witnessed audit", "reference": "FV-0091"}, {}]),
            [{"evidence_type": "Witnessed audit", "reference": "FV-0091", "notes": None}],
        )
        with self.assertRaisesRegex(ValueError, "what kind"):
            au.clean_evidence([{"evidence_type": "Rumour", "reference": "x"}])
        with self.assertRaisesRegex(ValueError, "attach the file"):
            au.clean_evidence([{"evidence_type": "File"}])
        with self.assertRaisesRegex(ValueError, "say what it is"):
            au.clean_evidence([{"evidence_type": "Other"}])

    def test_authorisation_on_the_visit_date(self):
        today, visit = date(2026, 10, 12), date(2026, 12, 3)
        row = {"docstatus": 1, "status": "Current", "valid_from": "2025-12-01", "valid_to": "2026-11-30"}
        self.assertTrue(au.covers(row, today))
        self.assertFalse(au.covers(row, visit))
        self.assertIsNone(au.authorisation_reason("Thandi Mamba", "FSMS", [row], today, today))
        self.assertEqual(
            au.authorisation_reason("Thandi Mamba", "FSMS", [row], visit, today),
            "Thandi Mamba's authorisation for FSMS expires on 30 November 2026, before the audit on 3 December 2026.",
        )
        # a multi-day job must be covered to its last day
        self.assertIn("before the calibration job on 3 December 2026", au.authorisation_reason("T", "Mass", [row], today, today, visit, "calibration job"))
        self.assertIn("expired on 30 November 2026. Renew it", au.authorisation_reason("T", "FSMS", [row], visit, date(2026, 12, 1)))
        later = {"docstatus": 1, "status": "Current", "valid_from": "2027-01-01", "valid_to": None}
        self.assertIn("starts on 1 January 2027, after the audit on 3 December 2026", au.authorisation_reason("T", "FSMS", [later], visit, today))
        self.assertIsNone(au.authorisation_reason("T", "FSMS", [row, later], date(2027, 2, 1), today))
        self.assertIn("still in training", au.authorisation_reason("T", "FSMS", [{"docstatus": 0}], today, today))
        self.assertIn("withdrawn", au.authorisation_reason("T", "FSMS", [{**row, "docstatus": 2}], today, today))
        self.assertEqual(au.authorisation_reason("T", "FSMS", [], today, today), "T isn't authorised for FSMS.")


class _Err(Exception):
    pass


EMP = {
    "EMP-44": {"user_id": "thandi@x", "department": "Certification", "employee_name": "Thandi Mamba"},
    "EMP-09": {"user_id": "nomvula@x", "department": "Executive", "employee_name": "Nomvula Tsabedze"},
}
DEPT = {"Certification": {"custom_head": "EMP-09"}}


def _fake(user, roles, todos, store):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)

    def get_value(dt, name, field, as_dict=False):
        if isinstance(field, list) and dt != "Skill":
            return {f: get_value(dt, name, f) for f in field}
        if dt == "Employee":
            return EMP.get(name, {}).get(field)
        if dt == "Department":
            return DEPT.get(name, {}).get(field)
        if dt == "Skill":
            return {"name": name, "custom_kind": "Audit", "custom_scheme": "ISO 22000", "custom_validity_months": 36}
        return None

    f.db = SimpleNamespace(
        get_value=get_value,
        set_value=lambda dt, name, field, val: next(t for t in todos if t["name"] == name).__setitem__(field, val),
    )
    f.get_all = lambda dt, filters=None, fields=None, **kw: [
        {"name": t["name"], "allocated_to": t["allocated_to"]}
        for t in todos
        if t["reference_name"] == filters["reference_name"] and t["status"] == "Open"
    ]

    class Doc(SimpleNamespace):
        def insert(self, ignore_permissions=False):
            if getattr(self, "doctype", "") == "ToDo":
                todos.append({**self.__dict__, "name": f"TD-{len(todos) + 1}"})
                return self
            self.name, self.docstatus, self.owner = "SA-0001", 0, user
            self.flags = SimpleNamespace(skip_route=False)
            store[self.name] = self
            au.sync_todo(self)
            return self

        def get(self, k):
            return getattr(self, k, None)

        def submit(self):
            self.docstatus = 1
            au.sync_todo(self)

        def add_comment(self, kind, text):
            self.__dict__.setdefault("comments", []).append(text)

    f.get_doc = lambda d, *a: Doc(**d) if isinstance(d, dict) else store[a[0]]
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda v: date.fromisoformat(str(v))
    utils.nowdate = lambda: TODAY.isoformat()
    utils.add_days = lambda d, n: date.fromordinal(d.toordinal() + n)
    sys.modules["frappe"], sys.modules["frappe.utils"] = f, utils
    return f


class FlowTests(unittest.TestCase):
    def tearDown(self):
        au.detail_impl = _DETAIL
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def _request(self, todos, store):
        _fake("hr@x", ("HR Manager",), todos, store)
        au.detail_impl = lambda name: {"id": name}  # detail reads more DocTypes than this fake has
        return au.request_impl(
            "EMP-44", "FSMS lead auditor (ISO 22000)", "2026-12-01",
            evidence=[{"evidence_type": "Training Result", "reference": "ISO 22000 refresher, 4 Nov"}],
        )

    def test_request_routes_to_the_department_head_with_default_validity(self):
        todos, store = [], {}
        self._request(todos, store)
        doc = store["SA-0001"]
        self.assertEqual(doc.valid_to, "2029-11-30")
        self.assertEqual(len(todos), 1)
        self.assertEqual(todos[0]["allocated_to"], "nomvula@x")
        self.assertEqual(todos[0]["description"], "Approve authorisation: Thandi Mamba, FSMS lead auditor (ISO 22000)")

    def test_head_approves_and_task_closes(self):
        todos, store = [], {}
        self._request(todos, store)
        f = _fake("nomvula@x", ("Employee",), todos, store)
        res = au.decide("SA-0001", "approve")
        self.assertEqual((res["status"], store["SA-0001"].docstatus, store["SA-0001"].approved_by), ("Approved", 1, "EMP-09"))
        self.assertEqual(todos[0]["status"], "Closed")
        with self.assertRaises(f.ValidationError):
            au.decide("SA-0001", "approve")

    def test_send_back_needs_a_note_and_others_cannot_decide(self):
        todos, store = [], {}
        self._request(todos, store)
        f = _fake("sipho@x", ("Leave Approver",), todos, store)
        with self.assertRaises(f.PermissionError):
            au.decide("SA-0001", "approve")
        f = _fake("nomvula@x", ("Employee",), todos, store)
        with self.assertRaises(f.ValidationError):
            au.decide("SA-0001", "reject")
        res = au.decide("SA-0001", "reject", "Needs the witnessed audit report attached.")
        self.assertEqual(res["status"], "Not approved")
        self.assertEqual(store["SA-0001"].docstatus, 0)
        self.assertEqual(todos[0]["status"], "Closed")

    def test_only_hr_requests(self):
        f = _fake("thandi@x", ("Employee",), [], {})
        with self.assertRaises(f.PermissionError):
            au.request_impl("EMP-44", "x", "2026-12-01", evidence=[{"evidence_type": "File", "reference": "cert"}])


if __name__ == "__main__":
    unittest.main()
