"""Onboarding (J2 end, H7/E10) — pure rules, plus task completion and the Task handler on a fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from types import SimpleNamespace

from eswasa_hr import onboarding as ob


class RuleTests(unittest.TestCase):
    def test_default_checklist_names_owners(self):
        rows = ob.default_checklist("hr@x", "sipho@x", "ayanda@x")
        owners = {r["activity_name"]: r["user"] for r in rows}
        self.assertEqual(owners["Contract signed and filed"], "hr@x")
        self.assertEqual(owners["Welcome meeting and first-week plan"], "sipho@x")
        self.assertEqual(owners[ob.DECLARATION_ACTIVITY], "ayanda@x")
        self.assertIsNone(owners["Laptop and access card"])  # HR picks the ICT person

    def test_every_activity_needs_an_owner(self):
        self.assertEqual(ob.checklist_errors([]), ["Add at least one activity."])
        errs = ob.checklist_errors([{"activity_name": "Laptop and access card", "user": None}, {"activity_name": " ", "user": "x"}])
        self.assertEqual(errs, ["Choose who does “Laptop and access card”.", "Activity 2 needs a name."])

    def test_progress(self):
        self.assertEqual(ob.progress(["Completed", "Open", "Cancelled", "Working"]), (2, 4))


class _Err(Exception):
    pass


def _fake(user, roles, tasks, todos, boarding):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)

    def get_value(dt, key, field, *a, **k):
        if dt == "Task":
            return {"project": "PROJ-1", "status": tasks.get(key, {}).get("status")}[field]
        if dt == ob.ONBOARDING:
            return {"name": "HR-EMP-ONB-1", "employee": "HR-EMP-87"}.get(field if isinstance(key, str) else "name")
        if dt == "Employee Boarding Activity":
            return {"TASK-ICT": "ict@x", "TASK-HR": "hr@x"}.get(key["task"])
        if dt == "Employee":
            return "ayanda@x"
        return None

    f.db = SimpleNamespace(get_value=get_value, set_value=lambda dt, name, field, val: next(t for t in todos if t["name"] == name).__setitem__(field, val))

    def get_all(dt, filters=None, fields=None, **kw):
        if dt == "Task":
            return [{"name": n, "subject": n, "status": t["status"]} for n, t in tasks.items()]
        if dt == "ToDo":
            return [{"name": t["name"]} for t in todos if t["reference_name"] == filters["reference_name"] and t["status"] == "Open"]
        return []

    f.get_all = get_all

    def get_doc(dt, name):
        if dt == "Task":
            t = SimpleNamespace(status=tasks[name]["status"], flags=SimpleNamespace())
            t.save = lambda: tasks[name].__setitem__("status", t.status)
            return t
        return boarding

    f.get_doc = get_doc
    sys.modules["frappe"] = f
    return f


def _boarding():
    b = SimpleNamespace(name="HR-EMP-ONB-1", project="PROJ-1", boarding_status="Pending",
                        activities=[SimpleNamespace(task="TASK-ICT"), SimpleNamespace(task="TASK-HR")])
    b.get = lambda k: getattr(b, k)
    b.db_set = lambda k, v: setattr(b, k, v)
    return b


class FlowTests(unittest.TestCase):
    def setUp(self):
        self._detail = ob.detail_impl
        ob.detail_impl = lambda name, doctype=ob.ONBOARDING: {"id": name}

    def tearDown(self):
        ob.detail_impl = self._detail
        sys.modules.pop("frappe", None)

    def test_owner_marks_done_and_status_moves(self):
        tasks = {"TASK-ICT": {"status": "Open"}, "TASK-HR": {"status": "Open"}}
        todos = [{"name": "TD-1", "reference_name": "TASK-ICT", "status": "Open"}]
        b = _boarding()
        f = _fake("zanele@x", ("Employee",), tasks, todos, b)
        with self.assertRaises(f.PermissionError):
            ob.complete_task_impl("TASK-ICT")
        _fake("ict@x", ("Employee",), tasks, todos, b)
        ob.complete_task_impl("TASK-ICT")
        self.assertEqual((tasks["TASK-ICT"]["status"], todos[0]["status"], b.boarding_status), ("Completed", "Closed", "In Process"))
        _fake("hr@x", ("HR Manager",), tasks, todos, b)
        ob.complete_task_impl("TASK-HR")
        self.assertEqual(b.boarding_status, "Completed")

    def test_task_handler_completes_onboarding_tasks(self):
        tasks = {"TASK-ICT": {"status": "Open"}, "TASK-HR": {"status": "Open"}}
        todos = [{"name": "TD-1", "reference_name": "TASK-ICT", "status": "Open"}]
        _fake("ict@x", ("Employee",), tasks, todos, _boarding())
        res = ob.decide_task("TASK-ICT", "approve")
        self.assertEqual((res["message"], tasks["TASK-ICT"]["status"]), ("Boarding task done", "Completed"))


class NoOfferTests(unittest.TestCase):
    """Plan 08: onboarding an existing employee who wasn't hired through Recruitment."""

    def setUp(self):
        from tests.test_leave import _Store, _fake_frappe

        self.store = _Store()
        self.store["Employee"] = [{"name": "E-7", "user_id": "sipho@x"}, {"name": "E-1", "user_id": "lm@x"}]
        self.f = _fake_frappe(self.store, user="hr@x", roles=("HR Manager",))
        self.emp = {"name": "E-7", "employee_name": "Sipho Dlamini", "status": "Active", "job_offer": None, "reports_to": "E-1", "user_id": "sipho@x",
                    "company": "ESWASA", "department": "Metrology", "designation": "Technician", "date_of_joining": "2019-03-01", "holiday_list": None,
                    "company_email": "sipho@eswasa.org.sz"}
        self.f.docs["E-7"] = _Emp(self.emp)
        self.reqd = False
        self.f.get_meta = lambda dt: SimpleNamespace(get_field=lambda fn: SimpleNamespace(reqd=1 if self.reqd else 0), has_field=lambda fn: True)
        self.created = []
        f = self.f
        base = f.get_doc

        def get_doc(d, *a):
            doc = base(d, *a)
            if isinstance(d, dict):
                doc_insert = doc.insert

                def insert(ignore_permissions=False):
                    out = doc_insert(ignore_permissions)
                    self.created.append(dict(doc))
                    return out

                dict.__setitem__(doc, "submit", lambda: None)
                return _Wrap(doc, insert)
            return doc

        f.get_doc = get_doc
        self._detail = ob.detail_impl
        ob.detail_impl = lambda name, doctype=ob.ONBOARDING: {"name": name}

    def tearDown(self):
        ob.detail_impl = self._detail
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def test_starts_without_an_offer_with_named_owners(self):
        ob.start_impl("E-7", [], "2026-10-20")
        onb = next(d for d in self.created if d["doctype"] == ob.ONBOARDING)
        self.assertNotIn("job_offer", onb)
        self.assertNotIn("job_applicant", onb)
        self.assertEqual(onb["boarding_begins_on"], "2026-10-20")
        self.assertTrue(all(a["user"] for a in onb["activities"]))
        owners = {a["activity_name"]: a["user"] for a in onb["activities"]}
        self.assertEqual(owners["Laptop and access card"], "hr@x")
        self.assertEqual(owners["Welcome meeting and first-week plan"], "lm@x")

    def test_direct_applicant_only_when_hrms_requires_one(self):
        self.reqd = True
        ob.start_impl("E-7", [], None)
        applicant = next(d for d in self.created if d["doctype"] == "Job Applicant")
        self.assertEqual((applicant["custom_source"], applicant["email_id"]), ("Direct", "sipho@eswasa.org.sz"))
        onb = next(d for d in self.created if d["doctype"] == ob.ONBOARDING)
        self.assertEqual(onb["job_applicant"], applicant["name"])

    def test_duplicate_refused(self):
        self.store["Employee Onboarding"] = [{"name": "ONB-1", "employee": "E-7", "docstatus": 1, "boarding_status": "In Process"}]
        with self.assertRaisesRegex(self.f.ValidationError, "already started"):
            ob.start_impl("E-7", [], None)
        self.store["Employee Onboarding"][0]["boarding_status"] = "Completed"
        ob.start_impl("E-7", [], None)  # a finished one doesn't block


class _Emp(dict):
    def __getattr__(self, k):
        return self.get(k)


class _Wrap:
    def __init__(self, doc, insert):
        self._doc, self.insert = doc, insert

    def __getattr__(self, k):
        return self._doc.get(k) if k != "submit" else (lambda: None)


if __name__ == "__main__":
    unittest.main()
