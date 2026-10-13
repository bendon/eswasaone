"""Leave ↔ Approvals (journey J3, plan 03) — pure rules, plus the Frappe glue against an in-memory fake frappe."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import leave, scope


class RuleTests(unittest.TestCase):
    def test_titles_read_like_a_sentence(self):
        self.assertEqual(leave.todo_title("Thandi Mamba", "2026-11-02", "2026-11-06"), "Approve leave for Thandi Mamba, 2 to 6 Nov")
        self.assertEqual(leave.todo_title("Thandi Mamba", "2026-11-02", "2026-11-02"), "Approve leave for Thandi Mamba, on 2 Nov")
        self.assertEqual(leave.todo_title("Thandi Mamba", "2026-10-30", "2026-11-03"), "Approve leave for Thandi Mamba, 30 Oct to 3 Nov")

    def test_sla_skips_weekends_and_holidays(self):
        self.assertEqual(leave.add_working_days(date(2026, 10, 16), 2), date(2026, 10, 20))  # Fri → Tue
        self.assertEqual(leave.add_working_days(date(2026, 10, 16), 2, {date(2026, 10, 19)}), date(2026, 10, 21))

    def test_routing_only_open_and_never_to_self(self):
        self.assertTrue(leave.needs_todo("Open", 0, "sipho@x", "thandi@x"))
        self.assertFalse(leave.needs_todo("Approved", 1, "sipho@x", "thandi@x"))
        self.assertFalse(leave.needs_todo("Open", 0, None, "thandi@x"))
        self.assertFalse(leave.needs_todo("Open", 0, "thandi@x", "thandi@x"))

    def test_decisions(self):
        self.assertEqual(leave.decision_status("Approve"), "Approved")
        self.assertEqual(leave.decision_status("reject"), "Rejected")
        with self.assertRaises(ValueError):
            leave.decision_status("return")

    def test_who_decides_including_the_escalation_path(self):
        self.assertIsNone(leave.decider_error("sipho@x", "sipho@x", "thandi@x", ["Leave Approver"]))
        self.assertIsNone(leave.decider_error("hr@x", "sipho@x", "thandi@x", ["HR Manager"]))
        self.assertIn("own", leave.decider_error("thandi@x", "thandi@x", "thandi@x", ["HR Manager"]))
        self.assertIn("leave approver", leave.decider_error("zanele@x", "sipho@x", "thandi@x", ["Employee"]))
        self.assertIn("HR Manager", leave.decider_error("hruser@x", "sipho@x", "thandi@x", ["HR User"]))

    def test_escalation_targets_skip_the_approver_and_anyone_already_escalated(self):
        self.assertEqual(leave.escalation_targets(["a@x", "b@x", "sipho@x"], "sipho@x", ["a@x"]), ["b@x"])
        self.assertTrue(leave.escalation_title("Thandi", "2026-11-02", "2026-11-06", "2026-10-20").startswith("[escalated] Approve leave"))
        self.assertTrue(leave.is_escalated("[escalated] x"))
        self.assertFalse(leave.is_escalated("Approve leave for x"))

    def test_approver_problem(self):
        self.assertEqual(leave.approver_problem("thandi@x", "thandi@x"), "self")
        self.assertEqual(leave.approver_problem(None, "thandi@x"), "none")
        self.assertIsNone(leave.approver_problem("sipho@x", "thandi@x"))
        self.assertIn("different", leave.approver_alert_title("Thandi", "self"))

    def test_cancel_rules(self):
        today = date(2026, 10, 16)
        self.assertIn("why", leave.cancel_error("Open", 0, "2026-11-02", today, " "))
        self.assertIsNone(leave.cancel_error("Open", 0, "2026-10-01", today, "Plans changed"))
        self.assertIsNone(leave.cancel_error("Approved", 1, "2026-10-17", today, "Plans changed"))
        self.assertIn("started", leave.cancel_error("Approved", 1, "2026-10-16", today, "Plans changed"))
        self.assertIn("Only open or approved", leave.cancel_error("Rejected", 1, "2026-11-02", today, "x"))
        self.assertIn("Only open or approved", leave.cancel_error("Cancelled", 2, "2026-11-02", today, "x"))
        self.assertIsNone(leave.canceller_error("thandi@x", "thandi@x"))
        self.assertIsNotNone(leave.canceller_error("sipho@x", "thandi@x"))

    def test_overlap_edges(self):
        self.assertTrue(leave.overlaps("2026-11-02", "2026-11-06", "2026-11-06", "2026-11-06"))  # last day
        self.assertTrue(leave.overlaps("2026-11-02", "2026-11-06", "2026-10-30", "2026-11-02"))  # first day
        self.assertFalse(leave.overlaps("2026-11-02", "2026-11-06", "2026-11-07", "2026-11-07"))  # the day after
        self.assertFalse(leave.overlaps("2026-11-02", "2026-11-06", "2026-10-30", "2026-11-01"))
        self.assertEqual(leave.on_leave_message("Thandi Mamba", "2026-11-02", "2026-11-06"), "Thandi Mamba is on approved leave 2 Nov 2026–6 Nov 2026")

    def test_calendar_range(self):
        self.assertIsNone(leave.range_error("2026-11-01", "2027-01-02"))
        self.assertIsNotNone(leave.range_error("2026-11-01", "2027-01-03"))
        self.assertIsNotNone(leave.range_error("2026-11-05", "2026-11-01"))
        self.assertIsNotNone(leave.range_error("nope", "2026-11-01"))
        self.assertEqual(leave.calendar_entry({"employee": "E1", "leave_type": "Annual", "from_date": "2026-11-02", "to_date": "2026-11-03", "status": "Open"})["style"], "dashed")
        self.assertEqual(leave.field_entry("E1", {"planned_date": "2026-11-04", "title": "Audit"})["style"], "F")

    def test_request_row_sla_and_overdue(self):
        row = {"name": "L1", "status": "Open", "docstatus": 0, "from_date": "2026-11-02", "to_date": "2026-11-06", "total_leave_days": 5}
        r = leave.request_row(row, "2026-10-14", True, date(2026, 10, 16))
        self.assertEqual((r["sla_date"], r["overdue"], r["escalated"], r["days"]), ("2026-10-14", True, True, 5.0))
        r = leave.request_row({**row, "status": "Approved", "docstatus": 2}, "2026-10-14", True, date(2026, 10, 16))
        self.assertEqual((r["status"], r["sla_date"], r["overdue"], r["escalated"]), ("Cancelled", None, False, False))
        self.assertNotIn("description", r)

    def test_balances_from_the_ledger_with_owed_and_carry_over(self):
        alloc = {
            "Annual": {"total_leaves": 21, "leaves_taken": 4, "remaining_leaves": 17, "leaves_pending_approval": 2},
            "Sick": {"total_leaves": 10, "leaves_taken": 1, "remaining_leaves": 9},
        }
        types_ = {"Annual": {"allow_encashment": 1, "is_carry_forward": 1, "maximum_carry_forwarded_leaves": 5}, "Sick": {}}
        rows = leave.balance_rows(alloc, types_)
        self.assertEqual({k: rows[0][k] for k in ("leave_type", "allocated", "used", "balance")}, {"leave_type": "Annual", "allocated": 21.0, "used": 4.0, "balance": 17.0})
        self.assertEqual((rows[0]["owed"], rows[0]["above_carry_over"]), (17.0, 12.0))
        self.assertEqual((rows[1]["owed"], rows[1]["above_carry_over"]), (None, None))
        self.assertEqual(leave.balance_totals(rows), {"owed": 17.0, "above_carry_over": 12.0})
        self.assertEqual(leave.balance_totals([]), {"owed": None, "above_carry_over": None})

    def test_policy_view_is_empty_when_nothing_is_configured(self):
        v0 = leave.policy_view([], [], [])
        self.assertEqual((v0["configured"], v0["leave_types"], v0["awaiting"]), (False, [], None))
        v = leave.policy_view([{"name": "Annual", "allow_encashment": 1}], [{"parent": "P1", "leave_type": "Annual", "annual_allocation": 21}],
                              [{"name": "2026", "from_date": "2026-01-01", "to_date": "2026-12-31"}])
        self.assertTrue(v["configured"])
        self.assertEqual(v["leave_types"][0]["allocations"], [{"policy": "P1", "annual_allocation": 21.0}])
        self.assertEqual(v["leave_period"]["to_date"], "2026-12-31")

    def test_cover(self):
        self.assertTrue(leave.needs_cover(2, False, False))
        self.assertTrue(leave.needs_cover(0, True, False))
        self.assertFalse(leave.needs_cover(0, False, False))
        self.assertFalse(leave.needs_cover(3, True, True))


# ---------------------------------------------------------------- fake frappe


class _Throw(Exception):
    pass


def _cmp(value, op, arg):
    v = "" if value is None else str(value)
    if op == "=":
        return value == arg
    if op == "in":
        return value in arg
    if op == "not in":
        return value not in arg and (value or "") not in arg
    if op == "like":
        return v.startswith(arg.rstrip("%"))
    if op == "between":
        return str(arg[0]) <= v <= str(arg[1])
    a = str(arg)
    return {"<": v < a, "<=": v <= a, ">": v > a, ">=": v >= a}[op]


def _match(row, filters):
    items = filters.items() if isinstance(filters, dict) else [(f[0], [f[1], f[2]]) for f in filters]
    for k, cond in items:
        op, arg = (cond[0], cond[1]) if isinstance(cond, list) else ("=", cond)
        if not _cmp(row.get(k), op, arg):
            return False
    return True


class _Store(dict):
    def rows(self, dt):
        return self.setdefault(dt, [])


def _fake_frappe(store, user="sipho@x", roles=("Leave Approver",), today="2026-10-16"):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    f.PermissionError = type("PermissionError", (_Throw,), {})
    f.ValidationError = type("ValidationError", (_Throw,), {})
    f.DoesNotExistError = type("DoesNotExistError", (_Throw,), {})
    f._ = lambda s: s
    f.docs = {}

    def throw(msg, exc=_Throw):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda *a: list(roles)

    def get_all(dt, filters=None, fields=None, or_filters=None, order_by=None, limit=None, **kw):
        out = [r for r in store.rows(dt) if _match(r, filters or {})]
        if or_filters:
            out = [r for r in out if any(_match(r, [f]) for f in or_filters)]
        return [dict(r) for r in out][: limit or None]

    def get_value(dt, key, field=None, as_dict=False):
        rows = [r for r in store.rows(dt) if (r.get("name") == key if isinstance(key, str) else _match(r, key))]
        if not rows:
            return None
        r = rows[0]
        if isinstance(field, list):
            return {k: r.get(k) for k in field} if as_dict else tuple(r.get(k) for k in field)
        return r.get(field or "name")

    def set_value(dt, name, field, val):
        next(r for r in store.rows(dt) if r["name"] == name)[field] = val

    def exists(dt, key):
        if dt == "DocType":
            return key in store.get("DocType", [])
        return bool(get_value(dt, key))

    f.get_all = get_all
    f.db = SimpleNamespace(get_value=get_value, set_value=set_value, exists=exists)
    f.get_meta = lambda dt: SimpleNamespace(has_field=lambda fn: True)

    class _Doc(dict):
        def __getattr__(self, k):
            return self.get(k)

        def insert(self, ignore_permissions=False):
            rows = store.rows(self["doctype"])
            self["name"] = self.get("name") or f"{self['doctype'][:4]}-{len(rows) + 1}"
            rows.append(dict(self))
            return self

    f.get_doc = lambda d, *a: _Doc(d) if isinstance(d, dict) else f.docs[a[0]]
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda v: v if isinstance(v, date) else date.fromisoformat(str(v)[:10])
    utils.nowdate = lambda: today
    utils.cint = lambda v: int(v or 0)
    f.utils = utils
    sys.modules["frappe"] = f
    sys.modules["frappe.utils"] = utils
    return f


def _leave_doc(store=None, **kw):
    base = dict(name="HR-LAP-002", employee="HR-EMP-0044", employee_name="Thandi Mamba", from_date="2026-11-02",
                to_date="2026-11-06", status="Open", docstatus=0, leave_approver="sipho@x")
    base.update(kw)
    doc = SimpleNamespace(**base)
    doc.comments = []
    doc.flags = SimpleNamespace()
    doc.cancelled = False
    doc.add_comment = lambda kind, text: doc.comments.append(text)

    def submit():
        doc.docstatus = 1

    def cancel():
        doc.docstatus, doc.status, doc.cancelled = 2, "Cancelled", True
        leave.sync_todo(doc)  # on_cancel doc_event

    def db_set(field, val):
        setattr(doc, field, val)

    doc.submit, doc.cancel, doc.db_set = submit, cancel, db_set
    return doc


def _base_store():
    s = _Store()
    s["DocType"] = ["HR Alert", "Field Visit"]
    s["Employee"] = [
        {"name": "HR-EMP-0044", "user_id": "thandi@x", "employee_name": "Thandi Mamba", "status": "Active", "reports_to": "HR-EMP-0010", "department": "Certification"},
        {"name": "HR-EMP-0010", "user_id": "sipho@x", "employee_name": "Sipho Dlamini", "status": "Active", "department": "Certification"},
    ]
    return s


class GlueTests(unittest.TestCase):
    def setUp(self):
        self._hr = leave._hr_managers
        self._hol = leave._holidays
        self._viewer = scope.viewer_for
        leave._hr_managers = lambda exclude=None: [u for u in ("hr1@x", "hr2@x") if u != exclude]
        leave._holidays = lambda employee: set()

    def tearDown(self):
        leave._hr_managers = self._hr
        leave._holidays = self._hol
        scope.viewer_for = self._viewer
        for m in ("frappe", "frappe.utils", "hrms", "hrms.hr", "hrms.hr.doctype", "hrms.hr.doctype.leave_application",
                  "hrms.hr.doctype.leave_application.leave_application"):
            sys.modules.pop(m, None)

    def _open_todos(self, store):
        return [t for t in store.rows("ToDo") if t["status"] == "Open"]

    def test_new_request_gets_one_todo_for_the_approver(self):
        store = _base_store()
        _fake_frappe(store)
        doc = _leave_doc()
        leave.sync_todo(doc)
        leave.sync_todo(doc)  # on_update after after_insert must not duplicate
        todos = store.rows("ToDo")
        self.assertEqual(len(todos), 1)
        t = todos[0]
        self.assertEqual(t["allocated_to"], "sipho@x")
        self.assertEqual(t["description"], "Approve leave for Thandi Mamba, 2 to 6 Nov")
        self.assertEqual(t["date"], "2026-10-20")
        self.assertNotIn("role", t)  # never a role pool

    def test_sla_date_skips_the_employees_holidays(self):
        store = _base_store()
        _fake_frappe(store)
        leave._holidays = lambda employee: {date(2026, 10, 19)}
        leave.sync_todo(_leave_doc())
        self.assertEqual(store.rows("ToDo")[0]["date"], "2026-10-21")

    def test_changed_approver_moves_the_todo(self):
        store = _base_store()
        store["ToDo"] = [{"name": "TD-1", "allocated_to": "sipho@x", "reference_type": "Leave Application", "reference_name": "HR-LAP-002", "status": "Open", "description": "Approve leave"}]
        _fake_frappe(store)
        leave.sync_todo(_leave_doc(leave_approver="nomvula@x"))
        self.assertEqual(store["ToDo"][0]["status"], "Closed")
        self.assertEqual([t["allocated_to"] for t in self._open_todos(store)], ["nomvula@x"])

    def test_approve_submits_and_closes_the_todo(self):
        store = _base_store()
        store["ToDo"] = [{"name": "TD-1", "allocated_to": "sipho@x", "reference_type": "Leave Application", "reference_name": "HR-LAP-002", "status": "Open", "description": "Approve leave"}]
        f = _fake_frappe(store)
        f.docs["HR-LAP-002"] = doc = _leave_doc()
        res = leave.decide("HR-LAP-002", "approve")
        self.assertEqual((res["status"], doc.docstatus), ("Approved", 1))
        self.assertEqual(store["ToDo"][0]["status"], "Closed")

    def test_reject_needs_a_reason(self):
        f = _fake_frappe(_base_store())
        f.docs["HR-LAP-002"] = doc = _leave_doc()
        with self.assertRaises(f.ValidationError):
            leave.decide("HR-LAP-002", "reject")
        res = leave.decide("HR-LAP-002", "reject", "Audit week; please move it by a week.")
        self.assertEqual(res["status"], "Rejected")
        self.assertEqual(doc.comments, ["Audit week; please move it by a week."])

    def test_applicant_cannot_decide_and_decided_requests_are_final(self):
        f = _fake_frappe(_base_store(), user="thandi@x", roles=("HR Manager",))
        f.docs["HR-LAP-002"] = _leave_doc()
        with self.assertRaises(f.PermissionError):
            leave.decide("HR-LAP-002", "approve")
        f = _fake_frappe(_base_store())
        f.docs["HR-LAP-002"] = _leave_doc(status="Approved", docstatus=1)
        with self.assertRaises(f.ValidationError):
            leave.decide("HR-LAP-002", "approve")

    # escalation (R-L1)

    def _overdue_store(self):
        store = _base_store()
        store["Leave Application"] = [{"name": "HR-LAP-002", "employee": "HR-EMP-0044", "employee_name": "Thandi Mamba", "from_date": "2026-11-02",
                                       "to_date": "2026-11-06", "status": "Open", "docstatus": 0, "leave_approver": "sipho@x"}]
        store["ToDo"] = [{"name": "TD-1", "allocated_to": "sipho@x", "reference_type": "Leave Application", "reference_name": "HR-LAP-002",
                          "status": "Open", "description": "Approve leave for Thandi Mamba, 2 to 6 Nov", "date": "2026-10-14"}]
        return store

    def test_overdue_request_escalates_to_each_named_hr_manager_once(self):
        store = self._overdue_store()
        _fake_frappe(store)
        self.assertEqual(leave.escalate_overdue(), 2)
        self.assertEqual(leave.escalate_overdue(), 0)  # the next night: nothing new
        esc = [t for t in store["ToDo"] if leave.is_escalated(t["description"])]
        self.assertEqual(sorted(t["allocated_to"] for t in esc), ["hr1@x", "hr2@x"])
        self.assertTrue(all(t["reference_name"] == "HR-LAP-002" for t in esc))
        self.assertEqual(store["ToDo"][0]["status"], "Open")  # the approver keeps theirs

    def test_not_yet_due_or_decided_requests_do_not_escalate(self):
        store = self._overdue_store()
        store["ToDo"][0]["date"] = "2026-10-16"
        _fake_frappe(store)
        self.assertEqual(leave.escalate_overdue(), 0)
        store = self._overdue_store()
        store["Leave Application"][0].update(status="Approved", docstatus=1)
        _fake_frappe(store)
        self.assertEqual(leave.escalate_overdue(), 0)

    def test_escalation_todo_survives_updates_and_closes_on_decide(self):
        store = self._overdue_store()
        f = _fake_frappe(store)
        leave.escalate_overdue()
        doc = _leave_doc()
        leave.sync_todo(doc)  # an edit while Open
        self.assertEqual(len(self._open_todos(store)), 3)
        f = _fake_frappe(store, user="hr1@x", roles=("HR Manager",))
        f.docs["HR-LAP-002"] = doc
        leave.decide("HR-LAP-002", "approve")
        self.assertEqual(self._open_todos(store), [])

    def test_hr_user_cannot_decide_an_escalated_request(self):
        store = self._overdue_store()
        f = _fake_frappe(store, user="hruser@x", roles=("HR User",))
        f.docs["HR-LAP-002"] = _leave_doc()
        with self.assertRaises(f.PermissionError):
            leave.decide("HR-LAP-002", "approve")

    def test_self_approver_raises_one_alert_to_hr_managers(self):
        store = _base_store()
        _fake_frappe(store)
        doc = _leave_doc(leave_approver="thandi@x")
        leave.sync_todo(doc)
        leave.sync_todo(doc)
        self.assertEqual(len(store.rows("HR Alert")), 1)
        alert = store["HR Alert"][0]
        self.assertEqual((alert["rule"], alert["subject_name"]), (leave.RULE_APPROVER, "HR-LAP-002"))
        self.assertEqual(sorted(t["allocated_to"] for t in self._open_todos(store)), ["hr1@x", "hr2@x"])
        doc.leave_approver = "sipho@x"  # HR fixes the approver
        leave.sync_todo(doc)
        self.assertEqual([t["allocated_to"] for t in self._open_todos(store)], ["sipho@x"])

    # cancel

    def test_applicant_cancels_an_open_request_and_everything_closes(self):
        store = self._overdue_store()
        f = _fake_frappe(store)
        leave.escalate_overdue()
        f = _fake_frappe(store, user="thandi@x", roles=("Employee",))
        f.docs["HR-LAP-002"] = doc = _leave_doc()
        res = leave.cancel_impl("HR-LAP-002", "Plans changed")
        self.assertEqual((res["status"], doc.status, doc.docstatus), ("Cancelled", "Cancelled", 0))
        self.assertEqual(self._open_todos(store), [])
        self.assertEqual(doc.comments, ["Cancelled by the employee: Plans changed"])

    def test_cancelling_future_approved_leave_reverses_it_and_tells_the_approver(self):
        store = _base_store()
        f = _fake_frappe(store, user="thandi@x", roles=("Employee",))
        f.docs["HR-LAP-002"] = doc = _leave_doc(status="Approved", docstatus=1)
        leave.cancel_impl("HR-LAP-002", "Family event moved")
        self.assertTrue(doc.cancelled)
        self.assertTrue(doc.flags.ignore_permissions)
        self.assertEqual(store["HR Alert"][0]["rule"], leave.RULE_CANCELLED)
        self.assertEqual([(t["allocated_to"], t["priority"]) for t in self._open_todos(store)], [("sipho@x", "Low")])

    def test_cancel_refusals(self):
        f = _fake_frappe(_base_store(), user="sipho@x")
        f.docs["HR-LAP-002"] = _leave_doc()
        with self.assertRaises(f.PermissionError):
            leave.cancel_impl("HR-LAP-002", "Not mine")
        f = _fake_frappe(_base_store(), user="thandi@x")
        f.docs["HR-LAP-002"] = _leave_doc(status="Approved", docstatus=1, from_date="2026-10-15")
        with self.assertRaises(f.ValidationError):
            leave.cancel_impl("HR-LAP-002", "Back early")
        f.docs["HR-LAP-002"] = _leave_doc()
        with self.assertRaises(f.ValidationError):
            leave.cancel_impl("HR-LAP-002", "")
        with self.assertRaises(f.ValidationError):
            leave.cancel(name="HR-LAP-002", reason="x", confirm=False)

    # guard, reads, cover

    def test_on_leave_by_user_or_employee(self):
        store = _base_store()
        store["Leave Application"] = [
            {"name": "L1", "employee": "HR-EMP-0044", "employee_name": "Thandi Mamba", "leave_type": "Annual", "from_date": "2026-11-02", "to_date": "2026-11-06", "status": "Approved", "docstatus": 1},
            {"name": "L2", "employee": "HR-EMP-0044", "employee_name": "Thandi Mamba", "leave_type": "Annual", "from_date": "2026-11-09", "to_date": "2026-11-09", "status": "Open", "docstatus": 0},
        ]
        _fake_frappe(store)
        self.assertEqual([r["name"] for r in leave.on_leave("thandi@x", "2026-11-06")], ["L1"])
        self.assertEqual(leave.on_leave("HR-EMP-0044", "2026-11-07", "2026-11-09"), [])  # the day after, and Open leave doesn't count
        self.assertIn("approved leave 2 Nov 2026–6 Nov 2026", leave.on_leave_error("HR-EMP-0044", "2026-10-30", "2026-11-02"))
        self.assertIsNone(leave.on_leave_error("nobody@x", "2026-11-03"))

    def _as(self, **kw):
        v = scope.Viewer(**{"user": "sipho@x", "roles": ["Employee"], **kw})
        scope.viewer_for = lambda user=None: v
        return v

    def test_requests_are_scoped_and_carry_the_sla(self):
        store = self._overdue_store()
        store["Leave Application"].append({"name": "L9", "employee": "HR-EMP-0099", "employee_name": "Other", "from_date": "2026-11-02", "to_date": "2026-11-02",
                                           "status": "Open", "docstatus": 0, "leave_approver": "other@x"})
        _fake_frappe(store)
        self._as(employee="HR-EMP-0010", reports=["HR-EMP-0044"])
        rows = leave.requests_impl()
        self.assertEqual([r["id"] for r in rows], ["HR-LAP-002"])
        self.assertEqual((rows[0]["sla_date"], rows[0]["overdue"]), ("2026-10-14", True))
        self._as(roles=["HR Manager"])
        self.assertEqual(len(leave.requests_impl()), 2)
        self.assertEqual(len(leave.requests_impl(status="Approved")), 0)

    def test_calendar_marks_leave_and_field_visits(self):
        store = self._overdue_store()
        store["Field Visit"] = [{"name": "FV1", "lead_auditor": "thandi@x", "planned_date": "2026-11-10", "title": "Surveillance audit", "workflow_state": "Planned"}]
        f = _fake_frappe(store)
        self._as(employee="HR-EMP-0010", reports=["HR-EMP-0044"])
        cal = leave.calendar_impl("2026-11-01", "2026-11-30")
        self.assertEqual(sorted((e["employee"], e["style"]) for e in cal["entries"]), [("HR-EMP-0044", "F"), ("HR-EMP-0044", "dashed")])
        self.assertEqual({p["employee"] for p in cal["people"]}, {"HR-EMP-0010", "HR-EMP-0044"})
        with self.assertRaises(f.ValidationError):
            leave.calendar_impl("2026-11-01", "2027-02-01")

    def _hrms(self, details):
        mod = types.ModuleType("hrms.hr.doctype.leave_application.leave_application")
        mod.get_leave_details = lambda employee, on: details
        for name in ("hrms", "hrms.hr", "hrms.hr.doctype", "hrms.hr.doctype.leave_application"):
            sys.modules[name] = types.ModuleType(name)
        sys.modules[mod.__name__] = mod

    def test_balances_are_none_without_a_leave_period_or_allocation(self):
        f = _fake_frappe(_base_store(), user="thandi@x")
        self._as(user="thandi@x", employee="HR-EMP-0044")
        self._hrms({"leave_allocation": {}})
        b = leave.balances_impl()
        self.assertEqual((b["items"], b["owed"], b["above_carry_over"], b["awaiting"]), ([], None, None, None))
        with self.assertRaises(f.PermissionError):
            leave.balances_impl("HR-EMP-0010")

    def test_balances_match_the_ledger_details(self):
        store = _base_store()
        store["Leave Type"] = [{"name": "Annual", "allow_encashment": 1, "is_carry_forward": 1, "maximum_carry_forwarded_leaves": 5}]
        _fake_frappe(store, user="thandi@x")
        self._as(user="thandi@x", employee="HR-EMP-0044")
        self._hrms({"leave_allocation": {"Annual": {"total_leaves": 21, "leaves_taken": 4, "remaining_leaves": 17}}})
        b = leave.balances_impl()
        self.assertEqual(b["items"][0]["balance"], 17.0)
        self.assertEqual((b["owed"], b["above_carry_over"], b["awaiting"]), (17.0, 12.0, None))

    def test_cover_prompt_for_someone_others_wait_on(self):
        store = _base_store()
        store["ToDo"] = [{"name": "TD-9", "allocated_to": "thandi@x", "reference_type": "Staff Authorisation", "reference_name": "SA-1", "status": "Open"}]
        _fake_frappe(store)
        doc = _leave_doc(status="Approved", docstatus=1)
        leave.cover_prompt(doc)
        leave.cover_prompt(doc)
        self.assertEqual([a["rule"] for a in store["HR Alert"]], [leave.RULE_COVER])
        cover = [t["allocated_to"] for t in store["ToDo"] if t["reference_type"] == "HR Alert"]
        self.assertEqual(cover, ["thandi@x", "sipho@x"])

    def test_no_cover_prompt_when_nobody_waits(self):
        store = _base_store()
        _fake_frappe(store)
        leave.cover_prompt(_leave_doc(status="Approved", docstatus=1))
        self.assertEqual(store.rows("HR Alert"), [])


class ApplyTests(unittest.TestCase):
    """POST /hr/leave through eswasa_hr (plan 01 sweep): the caller's own record, their approver, plain refusals."""

    def setUp(self):
        from tests import _fakefrappe as ff

        self.ff = ff
        self.store = {"Employee": [
            {"name": "EMP-44", "employee_name": "Thandi Mamba", "user_id": "thandi@x", "status": "Active",
             "leave_approver": "sipho@x", "company": "ESWASA"},
            {"name": "EMP-50", "employee_name": "Gone", "user_id": "gone@x", "status": "Left"},
        ]}
        self.addCleanup(ff.uninstall)

    def test_rules(self):
        self.assertEqual(leave.apply_error("", "2026-11-02", "2026-11-03"), "Choose a leave type.")
        self.assertEqual(leave.apply_error("Annual", "nope", "2026-11-03"), "Choose the first and last day of your leave.")
        self.assertEqual(leave.apply_error("Annual", "2026-11-03", "2026-11-02"), "The last day can't be before the first day.")
        self.assertIsNone(leave.apply_error("Annual", "2026-11-02", "2026-11-02"))
        self.assertIsNone(leave.apply_error("Maternity", "2026-11-02", "2027-02-01"))  # long leave is HRMS's to check

    def test_binds_the_callers_own_record_and_approver(self):
        self.ff.install(self.store, user="thandi@x", roles=("Employee",))
        out = leave.apply_impl(" Annual ", "2026-11-02", "2026-11-03", "  Family  ")
        [row] = self.store[leave.DOCTYPE]
        self.assertEqual((row["employee"], row["leave_approver"], row["leave_type"], row["status"], row["description"], row["company"]),
                         ("EMP-44", "sipho@x", "Annual", "Open", "Family", "ESWASA"))
        self.assertEqual((out["employee_name"], out["status"]), ("Thandi Mamba", "Open"))

    def test_no_active_record_is_refused(self):
        f = self.ff.install(self.store, user="gone@x", roles=("Employee",))
        with self.assertRaisesRegex(f.DoesNotExistError, "isn't linked to an employee record"):
            leave.apply_impl("Annual", "2026-11-02", "2026-11-03")
        f = self.ff.install(self.store, user="thandi@x", roles=("Employee",))
        with self.assertRaisesRegex(f.ValidationError, "before the first day"):
            leave.apply_impl("Annual", "2026-11-03", "2026-11-02")
        self.assertFalse(self.store.get(leave.DOCTYPE))


class CertificateTests(unittest.TestCase):
    """HR additions plan 08: a medical certificate past the type's threshold (H14, provisional)."""

    def setUp(self):
        from tests import _fakefrappe as ff

        self.ff = ff
        self.store = {
            "Employee": [{"name": "EMP-44", "employee_name": "Thandi Mamba", "user_id": "thandi@x", "status": "Active",
                          "leave_approver": "sipho@x", "company": "ESWASA"}],
            "Leave Type": [{"name": "Sick Leave", leave.CERT_FIELD: 2}, {"name": "Annual", leave.CERT_FIELD: 0}],
        }
        self.addCleanup(ff.uninstall)

    def _install(self, user="thandi@x"):
        return self.ff.install(self.store, user=user, roles=("Employee",), today="2026-10-16",
                               meta_fields={"Leave Type": [leave.CERT_FIELD], leave.DOCTYPE: [leave.CERT_LINK]})

    def test_rule(self):
        self.assertFalse(leave.certificate_required({leave.CERT_FIELD: None}, 30))  # empty: never
        self.assertFalse(leave.certificate_required({leave.CERT_FIELD: 0}, 30))
        self.assertFalse(leave.certificate_required({leave.CERT_FIELD: 2}, 2))  # boundary day: not more than 2
        self.assertTrue(leave.certificate_required({leave.CERT_FIELD: 2}, 2.5))
        self.assertEqual(leave.apply_error("Sick Leave", "2026-11-02", "2026-11-04", None, 2, 3, date(2026, 10, 16)),
                         "Sick Leave for more than 2 days needs a medical certificate.")
        self.assertIsNone(leave.apply_error("Sick Leave", "2026-11-02", "2026-11-04", "hr/evidence/cert.pdf", 2, 3, date(2026, 10, 16)))
        # Already started: the certificate may follow.
        self.assertIsNone(leave.apply_error("Sick Leave", "2026-10-14", "2026-10-16", None, 2, 3, date(2026, 10, 16)))

    def test_apply_refuses_then_files_the_certificate(self):
        f = self._install()
        with self.assertRaisesRegex(f.ValidationError, "needs a medical certificate"):
            leave.apply_impl("Sick Leave", "2026-11-02", "2026-11-04")
        out = leave.apply_impl("Sick Leave", "2026-11-02", "2026-11-04", None, "hr/evidence/cert.pdf")
        [row] = self.store[leave.DOCTYPE]
        self.assertEqual(row[leave.CERT_LINK], "hr/evidence/cert.pdf")
        self.assertEqual((out["certificate_required"], out["has_certificate"]), (True, True))
        [doc] = self.store["Employee Document"]
        self.assertEqual((doc["employee"], doc["document_type"], doc["status"]), ("EMP-44", "Medical certificate", "To check"))
        leave.apply_impl("Annual", "2026-11-09", "2026-11-20")  # threshold not set: never required

    def test_late_certificate_on_an_open_request(self):
        self._install()
        out = leave.apply_impl("Sick Leave", "2026-10-14", "2026-10-16")
        name = out["name"]
        self.store[leave.DOCTYPE][0].update({"docstatus": 0})
        f = self._install(user="sipho@x")
        with self.assertRaises(f.PermissionError):
            leave.add_certificate_impl(name, "hr/evidence/cert.pdf")
        self._install()
        self.assertTrue(leave.add_certificate_impl(name, "hr/evidence/cert.pdf")["has_certificate"])
        self.assertEqual(self.store[leave.DOCTYPE][0][leave.CERT_LINK], "hr/evidence/cert.pdf")
        self.store[leave.DOCTYPE][0]["status"] = "Approved"
        f = self._install()
        with self.assertRaisesRegex(f.ValidationError, "decided"):
            leave.add_certificate_impl(name, "hr/evidence/cert2.pdf")

    def test_request_row_flags(self):
        row = {"name": "LA-1", "status": "Open", "docstatus": 0, "total_leave_days": 3}
        out = leave.request_row(row, None, False, date(2026, 10, 16), 2)
        self.assertEqual((out["certificate_required"], out["has_certificate"]), (True, False))
        self.assertFalse(leave.request_row(row, None, False, date(2026, 10, 16))["certificate_required"])


if __name__ == "__main__":
    unittest.main()
