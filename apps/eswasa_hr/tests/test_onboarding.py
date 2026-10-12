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
        ob.detail_impl = lambda name: {"id": name}

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
        self.assertEqual((res["message"], tasks["TASK-ICT"]["status"]), ("Onboarding task done", "Completed"))


if __name__ == "__main__":
    unittest.main()
