"""Module access requests (plan 02) — pure rules, the staff.ts parity check, and review on a fake frappe."""

from __future__ import annotations

import re
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace

from eswasa_hr import access_requests as ar

STAFF_TS = Path(__file__).resolve().parents[3] / "portals" / "institution-portal" / "src" / "staff.ts"


def parse_route_access(ts: str) -> dict[str, list[str] | None]:
    body = ts[ts.index("const ROUTE_ACCESS"):]
    body = body[body.index("{") + 1 : body.index("\n};")]
    body = re.sub(r"//[^\n]*", "", body)
    out: dict[str, list[str] | None] = {}
    for m in re.finditer(r"(\w+):\s*(ANY_STAFF|\[(.*?)\])", body, re.S):
        out[m.group(1)] = None if m.group(2) == "ANY_STAFF" else re.findall(r'"([^"]+)"', m.group(3))
    return out


class ParityTests(unittest.TestCase):
    @unittest.skipUnless(STAFF_TS.exists(), "portal source not checked out")
    def test_module_roles_equal_staff_ts(self):
        self.assertEqual(ar.MODULE_ROLES, parse_route_access(STAFF_TS.read_text()))


class RuleTests(unittest.TestCase):
    def test_any_staff_and_unknown_modules_refused(self):
        self.assertEqual(ar.submit_error("hr", "HR & People", ["Employee"]), "Everyone can open HR & People.")
        self.assertEqual(ar.submit_error("nope", None, []), "That module doesn't exist.")

    def test_already_holding_a_granting_role_refused(self):
        self.assertEqual(ar.submit_error("finance", "Finance", ["Accounts Manager"]), "You can already open Finance.")
        self.assertEqual(ar.submit_error("finance", "Finance", ["System Manager"]), "You can already open Finance.")
        self.assertIsNone(ar.submit_error("finance", "Finance", ["Employee"]))

    def test_admin_module_not_requestable(self):
        self.assertIn("System Manager, not by request", ar.submit_error("admin", "Admin", ["Employee"]))

    def test_narrowest_role_never_admin(self):
        self.assertEqual(ar.grant_role("certification"), "Certification Officer")
        self.assertEqual(ar.grant_role("board"), "Eswasa Board Member")
        self.assertEqual(ar.grant_role("finance"), "Accounts User")
        self.assertEqual(ar.grant_role("crm"), "Sales User")
        self.assertIsNone(ar.grant_role("admin"))
        self.assertIsNone(ar.grant_role("hr"))
        for module, roles in ar.MODULE_ROLES.items():
            role = ar.grant_role(module)
            if role:
                self.assertIn(role, roles)
                self.assertNotIn(role, ar.ADMIN_ROLES)

    def test_four_eyes_reviewer_roles_and_reject_note(self):
        self.assertIn("own access request", ar.review_error("a@x", ["HR Manager"], "a@x", "approved", None))
        self.assertIn("Only HR", ar.review_error("b@x", ["Employee"], "a@x", "approved", None))
        self.assertIn("Say why", ar.review_error("b@x", ["HR User"], "a@x", "rejected", "  "))
        self.assertIsNone(ar.review_error("b@x", ["HR User"], "a@x", "rejected", "Use the shared report instead."))
        self.assertIsNone(ar.review_error("b@x", ["Administrator"], "a@x", "approved", None))
        self.assertEqual(ar.review_error("b@x", ["HR User"], "a@x", "maybe", None), "Approve or reject.")

    def test_camel_case_shape(self):
        row = {"name": "MAR-00001", "module_id": "finance", "module_label": "Finance", "requester": "a@x", "requester_name": "Ann",
               "requester_email": "a@x", "note": "", "status": "Pending", "creation": "2026-10-12 09:00:00.1"}
        out = ar.to_api(row)
        self.assertEqual(out["moduleId"], "finance")
        self.assertEqual((out["status"], out["createdAt"]), ("pending", "2026-10-12T09:00:00.1"))
        self.assertNotIn("reviewedAt", out)
        done = ar.to_api({**row, "status": "Approved", "reviewed_by": "hr@x", "reviewed_at": "2026-10-13 10:00:00", "roles_granted": "Accounts User"})
        self.assertEqual((done["status"], done["reviewedBy"], done["reviewedAt"], done["rolesGranted"]), ("approved", "hr@x", "2026-10-13T10:00:00", "Accounts User"))


class _Err(Exception):
    pass


def _fake(user, roles, rows, user_roles=None, managers=("hr1@x", "hr2@x")):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda u=None: list(roles if u in (None, user) else [])
    f.todos, f.comments, f.granted = [], [], []
    seq = [len(rows)]

    def get_value(dt, filters, fields=None, as_dict=False, **k):
        if dt == "User":
            return {"full_name": "Ann Dlamini", "email": user}
        if dt == ar.DOCTYPE and isinstance(filters, dict):
            return next((n for n, r in rows.items() if all(r.get(a) == b for a, b in filters.items())), None)
        if dt == ar.DOCTYPE:
            r = rows.get(filters)
            return dict(r, name=filters) if r else None
        return None

    def set_value(dt, name, values, update_modified=False):
        if dt == ar.DOCTYPE:
            rows[name].update(values)
        elif dt == "ToDo":
            f.todos.append(("closed", name))

    def exists(dt, filters=None):
        return False

    f.db = SimpleNamespace(get_value=get_value, set_value=set_value, exists=exists)

    def get_all(dt, filters=None, fields=None, **k):
        if dt == "Has Role":
            return [{"parent": m} for m in managers]
        if dt == "User":
            return [{"name": m} for m in filters["name"][1]]
        if dt == "ToDo":
            return [{"name": f"T-{i}"} for i, t in enumerate(f.todos) if t[0] == "open" and t[2] == filters.get("reference_name")]
        if dt == ar.DOCTYPE:
            return [dict(r, name=n) for n, r in rows.items() if all(r.get(a) == b for a, b in (filters or {}).items())]
        return []

    f.get_all = get_all

    def get_doc(d, name=None):
        if isinstance(d, dict):
            doc = SimpleNamespace(**d, flags=SimpleNamespace())

            def insert(ignore_permissions=False):
                if d["doctype"] == "ToDo":
                    f.todos.append(("open", d["allocated_to"], d["reference_name"], d["description"]))
                    return
                seq[0] += 1
                doc.name = f"MAR-{seq[0]:05d}"
                rows[doc.name] = {k: v for k, v in d.items() if k != "doctype"} | {"creation": "2026-10-12 09:00:00"}

            doc.insert = insert
            return doc
        if d == "User":
            u = SimpleNamespace(flags=SimpleNamespace(), roles=[SimpleNamespace(role=r) for r in (user_roles or [])])
            u.get = lambda k, default=None: u.roles
            u.add_roles = lambda *r: f.granted.append((name, r, u.flags.ignore_permissions))
            return u
        return SimpleNamespace(add_comment=lambda kind, text: f.comments.append(text))

    f.get_doc = get_doc
    utils = types.ModuleType("frappe.utils")
    utils.add_days = lambda d, n: "2026-10-15"
    utils.nowdate = lambda: "2026-10-12"
    utils.now_datetime = lambda: "2026-10-13 10:00:00"
    utils.cint = lambda v: int(v or 0)
    f.utils = utils
    sys.modules["frappe"] = f
    sys.modules["frappe.utils"] = utils
    return f


PENDING = {"module_id": "finance", "module_label": "Finance", "requester": "ann@x", "requester_name": "Ann", "requester_email": "ann@x",
           "note": "", "status": "Pending", "creation": "2026-10-12 09:00:00"}


class GlueTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)
        sys.modules.pop("frappe.utils", None)

    def test_submit_routes_to_named_hr_managers_but_not_the_requester(self):
        f = _fake("hr1@x", ["Employee"], {})
        out = ar.submit_impl("finance", "Finance", " need the ledger ")
        self.assertEqual((out["id"], out["requesterUsername"], out["note"], out["status"]), ("MAR-00001", "hr1@x", "need the ledger", "pending"))
        self.assertEqual([t[1] for t in f.todos], ["hr2@x"])
        self.assertEqual(f.todos[0][3], "Review access to Finance for Ann Dlamini")

    def test_duplicate_pending_returned(self):
        f = _fake("ann@x", ["Employee"], {"MAR-00001": dict(PENDING)})
        out = ar.submit_impl("finance", "Finance", "again")
        self.assertEqual(out["id"], "MAR-00001")
        self.assertEqual(f.todos, [])

    def test_any_staff_refused(self):
        f = _fake("ann@x", ["Employee"], {})
        with self.assertRaisesRegex(f.ValidationError, "Everyone can open"):
            ar.submit_impl("team", "My team", "")

    def test_approve_grants_narrowest_role_and_closes_todos(self):
        f = _fake("hr2@x", ["HR User"], {"MAR-00001": dict(PENDING)})
        f.todos.append(("open", "hr2@x", "MAR-00001", "Review"))
        out = ar.review_impl("MAR-00001", "approved", None)
        self.assertEqual(f.granted, [("ann@x", ("Accounts User",), True)])
        self.assertEqual((out["status"], out["reviewedBy"], out["rolesGranted"]), ("approved", "hr2@x", "Accounts User"))
        self.assertIn(("closed", "T-0"), f.todos)
        self.assertIn("granted Accounts User", f.comments[0])

    def test_four_eyes_and_non_reviewer(self):
        f = _fake("ann@x", ["HR Manager"], {"MAR-00001": dict(PENDING)})
        with self.assertRaisesRegex(f.PermissionError, "own access request"):
            ar.review_impl("MAR-00001", "approved")
        f = _fake("bob@x", ["Employee"], {"MAR-00001": dict(PENDING)})
        with self.assertRaises(f.PermissionError):
            ar.review_impl("MAR-00001", "approved")

    def test_reject_needs_note(self):
        f = _fake("hr2@x", ["HR Manager"], {"MAR-00001": dict(PENDING)})
        with self.assertRaisesRegex(f.ValidationError, "Say why"):
            ar.review_impl("MAR-00001", "rejected", "")
        out = ar.review_impl("MAR-00001", "rejected", "Ask your manager first.")
        self.assertEqual((out["status"], out["reviewNote"]), ("rejected", "Ask your manager first."))
        self.assertEqual(f.granted, [])

    def test_already_decided_unchanged(self):
        f = _fake("hr2@x", ["HR Manager"], {"MAR-00001": {**PENDING, "status": "Rejected", "review_note": "No."}})
        out = ar.review_impl("MAR-00001", "approved")
        self.assertEqual((out["status"], out["reviewNote"]), ("rejected", "No."))
        self.assertEqual((f.granted, f.comments), ([], []))

    def test_approvals_decide_uses_review(self):
        f = _fake("hr2@x", ["HR Manager"], {"MAR-00001": dict(PENDING)})
        out = ar.decide("MAR-00001", "Approve", "")
        self.assertEqual((out["ok"], out["status"]), (True, "Approved"))
        with self.assertRaises(f.ValidationError):
            ar.decide("MAR-00001", "maybe")

    def test_list_reviewer_all_others_own(self):
        rows = {"MAR-00001": dict(PENDING), "MAR-00002": {**PENDING, "requester": "bob@x", "status": "Approved"}}
        _fake("bob@x", ["Employee"], rows)
        self.assertEqual([r["id"] for r in ar.list_impl()], ["MAR-00002"])
        _fake("hr2@x", ["HR User"], rows)
        self.assertEqual([r["id"] for r in ar.list_impl(status="pending")], ["MAR-00001"])
        self.assertEqual(len(ar.list_impl()), 2)

    def test_confirm_required(self):
        f = _fake("ann@x", ["Employee"], {})
        with self.assertRaisesRegex(f.ValidationError, "confirm"):
            ar.submit("finance", "Finance")


if __name__ == "__main__":
    unittest.main()
