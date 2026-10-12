"""Lifecycle (J8, J9) — pure rules, plus approval and last-day processing on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import lifecycle as lc

TODAY = date(2026, 10, 12)


class RuleTests(unittest.TestCase):
    def test_property_rows_only_for_real_changes(self):
        current = {"designation": "Standards Officer", "grade": "B", "department": "Standards Development", "reports_to": "EMP-1"}
        rows = lc.property_rows(current, {"designation": "Senior Standards Officer", "grade": "B", "reports_to": None})
        self.assertEqual(rows, [{"property": "Designation", "fieldname": "designation", "current": "Standards Officer", "new": "Senior Standards Officer"}])
        self.assertEqual(lc.property_rows(current, {"grade": "B"}), [])

    def test_titles(self):
        rows = [{"property": "Designation", "current": "Standards Officer", "new": "Senior Standards Officer"}]
        self.assertEqual(lc.change_title(lc.PROMOTION, "Phindile Motsa", rows),
                         "Approve promotion: Phindile Motsa (Designation Standards Officer → Senior Standards Officer)")

    def test_separation_rules(self):
        self.assertEqual(lc.separation_errors("Resignation", "2026-10-31", "2026-09-30"), [])
        self.assertIn("Choose why", lc.separation_errors("Fed up", "2026-10-31", None)[0])
        self.assertIn("before the notice", lc.separation_errors("Resignation", "2026-09-01", "2026-09-30")[0])
        self.assertIn("last working day", lc.separation_errors("Resignation", None, None)[0])

    def test_reassigned_description_keeps_the_original(self):
        self.assertEqual(lc.reassigned_description("Approve leave for Thandi Mamba, 2 to 6 Nov", "Mandla Zwane", date(2026, 10, 31)),
                         "Approve leave for Thandi Mamba, 2 to 6 Nov [Moved from Mandla Zwane, who left on 31 Oct 2026]")


class _Err(Exception):
    pass


def _fake(user, roles, store, todos=None, staff=None, users=None, separations=()):
    todos = todos if todos is not None else []
    staff = staff if staff is not None else {}
    users = users if users is not None else {}
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)
    deleted = []
    f.deleted = deleted
    f.delete_doc = lambda dt, name, **k: deleted.append(name)

    def exists(dt, key=None):
        if dt == lc.SEPARATION and isinstance(key, dict):
            return key.get("employee") in separations
        return isinstance(key, str) and key in store

    def set_value(dt, name, field, val=None, **k):
        target = {"ToDo": {t["name"]: t for t in todos}, "Employee": staff, "User": users}[dt][name]
        target.update(field if isinstance(field, dict) else {field: val})

    f.db = SimpleNamespace(exists=exists, set_value=set_value,
                           get_value=lambda dt, name, field, *a, **k: staff.get(name, {}).get(field) if dt == "Employee" else None)

    def get_all(dt, filters=None, fields=None, **kw):
        if dt == "Employee":
            return [e for e in staff.values() if e["status"] == "Active" and e.get("relieving_date") and e["relieving_date"] <= TODAY]
        if dt == "ToDo":
            if "allocated_to" in filters:
                return [{"name": t["name"], "description": t["description"]} for t in todos if t["allocated_to"] == filters["allocated_to"] and t["status"] == "Open"]
            return [{"name": t["name"]} for t in todos if t.get("reference_name") == filters.get("reference_name") and t["status"] == "Open"]
        return []

    f.get_all = get_all

    def get_doc(dt, name):
        if dt == "Employee":
            e = staff[name]
            return SimpleNamespace(add_comment=lambda kind, text: e.setdefault("comments", []).append(text))
        return store[name]

    f.get_doc = get_doc
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda v: date.fromisoformat(str(v))
    utils.nowdate = lambda: TODAY.isoformat()
    sys.modules["frappe"], sys.modules["frappe.utils"] = f, utils
    return f


def _promotion(on="2026-10-12", owner="hr1@x"):
    d = SimpleNamespace(doctype=lc.PROMOTION, name="HR-EMP-PRO-1", owner=owner, docstatus=0, employee="EMP-66",
                        promotion_date=on, custom_approved_by=None, comments=[])
    d.get = lambda k: getattr(d, k, None)
    d.save = lambda: None

    def submit():
        d.docstatus = 1

    d.submit = submit
    d.add_comment = lambda kind, text: d.comments.append(text)
    return d


class ApprovalTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def test_four_eyes_and_submit_today(self):
        p = _promotion()
        f = _fake("hr1@x", ("HR Manager",), {p.name: p})
        with self.assertRaisesRegex(f.PermissionError, "another HR Manager"):
            lc.decide_promotion(p.name, "approve")
        _fake("hr2@x", ("HR Manager",), {p.name: p})
        res = lc.decide_promotion(p.name, "approve")
        self.assertEqual((res["status"], p.docstatus, p.custom_approved_by), ("Approved", 1, "hr2@x"))

    def test_future_dated_waits_for_its_date(self):
        p = _promotion(on="2026-11-01")
        _fake("hr2@x", ("HR Manager",), {p.name: p})
        res = lc.decide_promotion(p.name, "approve")
        self.assertEqual((res["status"], p.docstatus), ("Approved, takes effect 2026-11-01", 0))

    def test_send_back_keeps_the_reason_on_the_employee(self):
        p = _promotion()
        staff = {"EMP-66": {"name": "EMP-66"}}
        f = _fake("hr2@x", ("HR Manager",), {p.name: p}, staff=staff)
        with self.assertRaises(f.ValidationError):
            lc.decide_promotion(p.name, "reject")
        lc.decide_promotion(p.name, "reject", "Grade C needs the Council-approved band first.")
        self.assertEqual(f.deleted, [p.name])
        self.assertIn("Grade C needs", staff["EMP-66"]["comments"][0])


class LastDayTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def test_left_login_disabled_tasks_moved(self):
        staff = {
            "EMP-19": {"name": "EMP-19", "employee_name": "Mandla Zwane", "user_id": "mandla@x", "reports_to": "EMP-15", "relieving_date": date(2026, 10, 12), "status": "Active"},
            "EMP-15": {"name": "EMP-15", "employee_name": "Busisiwe Fakudze", "user_id": "busi@x", "status": "Active"},
            "EMP-20": {"name": "EMP-20", "employee_name": "Not Approved", "user_id": "na@x", "relieving_date": date(2026, 10, 1), "status": "Active"},
        }
        users = {"mandla@x": {"enabled": 1}, "na@x": {"enabled": 1}}
        todos = [{"name": "TD-1", "allocated_to": "mandla@x", "status": "Open", "description": "Approve leave for Thandi Mamba, 2 to 6 Nov"}]
        _fake("Administrator", ("System Manager",), {}, todos, staff, users, separations=("EMP-19",))
        self.assertEqual(lc.process_last_days(), 1)
        self.assertEqual(staff["EMP-19"]["status"], "Left")
        self.assertEqual(users["mandla@x"]["enabled"], 0)
        self.assertEqual(todos[0]["allocated_to"], "busi@x")
        self.assertTrue(todos[0]["description"].endswith("[Moved from Mandla Zwane, who left on 12 Oct 2026]"))
        self.assertEqual((staff["EMP-20"]["status"], users["na@x"]["enabled"]), ("Active", 1))  # no approved separation


if __name__ == "__main__":
    unittest.main()
