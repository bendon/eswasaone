"""Plan 09 two-pass employee import: the pure validators, the template, and dry run / run against a fake frappe."""

from __future__ import annotations

import base64
import json
import unittest
from datetime import date
from unittest import mock

from eswasa_hr import employee_import as ei
from tests import _fakefrappe as ff

LOOKUPS = {
    "genders": {"female": "Female", "male": "Male"},
    "departments": {"certification - esw": "Certification - ESW", "certification": "Certification - ESW", "operations - esw": "Operations - ESW",
                    "operations": "Operations - ESW"},
    "leaf_departments": {"Certification - ESW"},
    "designations": {"auditor": "Auditor"},
    "grades": {"g5": "G5"},
    "branches": {"mbabane": "Mbabane"},
    "employment_types": {"permanent": "Permanent"},
    "holiday_lists": {"eswatini": "Eswatini"},
    "cost_centers": {},
    "leave_types": {"annual leave": "Annual Leave"},
}
ROW = {"employee_number": "1042", "first_name": "Thandi", "last_name": "Mamba", "gender": "female", "date_of_birth": "1990-04-02",
       "date_of_joining": "2020-01-15", "department": "Certification", "designation": "Auditor", "grade": "G5", "branch": "Mbabane",
       "employment_type": "Permanent", "holiday_list": "Eswatini", "scheduled_confirmation_date": "15/07/2020", "notice_number_of_days": "30"}


def fields(errs):
    return [e["field"] for e in errs]


class ValidateRowTests(unittest.TestCase):
    def test_a_good_row_resolves_names_and_dates(self):
        clean, errs = ei.validate_row(ROW, LOOKUPS)
        self.assertEqual(errs, [])
        self.assertEqual(clean["department"], "Certification - ESW")
        self.assertEqual(clean["gender"], "Female")
        self.assertEqual(clean["scheduled_confirmation_date"], date(2020, 7, 15))
        self.assertEqual(clean["notice_number_of_days"], 30)

    def test_required_fields(self):
        _clean, errs = ei.validate_row({"employee_number": "1"}, LOOKUPS)
        self.assertEqual(set(fields(errs)), {"first_name", "gender", "date_of_birth", "date_of_joining", "department", "designation"})

    def test_each_unknown_link(self):
        for field in ("department", "designation", "grade", "branch", "employment_type", "holiday_list", "gender"):
            with self.subTest(field=field):
                _clean, errs = ei.validate_row({**ROW, field: "Nope"}, LOOKUPS)
                self.assertEqual(fields(errs), [field])
                self.assertIn("Unknown", errs[0]["message"])

    def test_a_group_department_is_refused(self):
        _clean, errs = ei.validate_row({**ROW, "department": "Operations"}, LOOKUPS)
        self.assertEqual(fields(errs), ["department"])
        self.assertIn("group", errs[0]["message"])

    def test_bad_dates(self):
        _clean, errs = ei.validate_row({**ROW, "date_of_joining": "2020-13-45"}, LOOKUPS)
        self.assertEqual(fields(errs), ["date_of_joining"])

    def test_duplicate_staff_number(self):
        _clean, errs = ei.validate_row(ROW, LOOKUPS, {"1042"})
        self.assertEqual(fields(errs), ["employee_number"])
        self.assertEqual(ei.duplicates([ROW, dict(ROW), {**ROW, "employee_number": "9"}], "employee_number"), {("1042",)})

    def test_probation_before_joining(self):
        _clean, errs = ei.validate_row({**ROW, "scheduled_confirmation_date": "2019-12-31"}, LOOKUPS)
        self.assertEqual(fields(errs), ["scheduled_confirmation_date"])

    def test_leavers_go_through_separation(self):
        _clean, errs = ei.validate_row({**ROW, "status": "Left"}, LOOKUPS)
        self.assertEqual(fields(errs), ["status"])

    def test_xlsx_numbers_and_dates(self):
        clean, errs = ei.validate_row({**ROW, "employee_number": 1042.0, "date_of_birth": date(1990, 4, 2)}, LOOKUPS)
        self.assertEqual(errs, [])
        self.assertEqual(clean["employee_number"], "1042")


BY_NUMBER = {
    "1": {"name": "EMP-1", "status": "Active", "reports_to": None, "user_id": "ed@x"},
    "2": {"name": "EMP-2", "status": "Active", "reports_to": None, "user_id": None},
    "3": {"name": "EMP-3", "status": "Active", "reports_to": "EMP-1", "user_id": None},
}
USERS = {"ed@x": "EMP-1", "sipho@x": ""}


class ValidateLinksTests(unittest.TestCase):
    def test_links_resolve_by_staff_number_and_email(self):
        clean, errs = ei.validate_links({"employee_number": "2", "reports_to": "1", "leave_approver": "ed@x", "user_id": "sipho@x"}, BY_NUMBER, USERS)
        self.assertEqual(errs, [])
        self.assertEqual(clean, {"employee": "EMP-2", "reports_to": "EMP-1", "leave_approver": "ed@x", "user_id": "sipho@x"})

    def test_pass_2_needs_the_pass_1_record(self):
        _clean, errs = ei.validate_links({"employee_number": "99", "reports_to": "1"}, BY_NUMBER, USERS)
        self.assertIn("pass 1", errs[0]["message"])

    def test_self_reference(self):
        _clean, errs = ei.validate_links({"employee_number": "2", "reports_to": "2"}, BY_NUMBER, USERS)
        self.assertEqual(fields(errs), ["reports_to"])
        _clean, errs = ei.validate_links({"employee_number": "1", "leave_approver": "ed@x"}, BY_NUMBER, USERS)
        self.assertEqual(fields(errs), ["leave_approver"])

    def test_unknown_approver_unless_this_file_gives_them_a_login(self):
        row = {"employee_number": "2", "expense_approver": "new@x"}
        self.assertEqual(fields(ei.validate_links(row, BY_NUMBER, USERS)[1]), ["expense_approver"])
        self.assertEqual(ei.validate_links(row, BY_NUMBER, USERS, new_users=["new@x"])[1], [])

    def test_a_login_used_by_someone_else(self):
        _clean, errs = ei.validate_links({"employee_number": "2", "user_id": "ed@x"}, BY_NUMBER, USERS)
        self.assertIn("already logs in as EMP-1", errs[0]["message"])
        _clean, errs = ei.validate_links({"employee_number": "2", "user_id": "a@x"}, BY_NUMBER, USERS, duplicate_users=["a@x"])
        self.assertEqual(fields(errs), ["user_id"])

    def test_a_different_manager_on_an_active_record_goes_through_transfer(self):
        _clean, errs = ei.validate_links({"employee_number": "3", "reports_to": "2"}, BY_NUMBER, USERS)
        self.assertIn("transfer", errs[0]["message"])
        self.assertEqual(ei.validate_links({"employee_number": "3", "reports_to": "1"}, BY_NUMBER, USERS)[1], [])

    def test_cycles(self):
        self.assertEqual(ei.reports_to_cycles({"a": "b", "b": "c", "c": "a", "d": "a", "e": ""}), {"a", "b", "c"})
        self.assertEqual(ei.reports_to_cycles({"a": "a"}), {"a"})
        self.assertEqual(ei.reports_to_cycles({"a": "b", "b": "c"}), set())
        _clean, errs = ei.validate_links({"employee_number": "2", "reports_to": "1"}, BY_NUMBER, USERS, cycles={"2"})
        self.assertIn("loop", errs[0]["message"])


class BalanceAndOrderTests(unittest.TestCase):
    def test_balance_rules(self):
        types = LOOKUPS["leave_types"]
        clean, errs = ei.validate_balance({"employee_number": "2", "leave_type": "Annual Leave", "balance": "12.5"}, BY_NUMBER, types)
        self.assertEqual((clean, errs), ({"employee": "EMP-2", "leave_type": "Annual Leave", "balance": 12.5}, []))
        self.assertEqual(fields(ei.validate_balance({"employee_number": "2", "leave_type": "Sick", "balance": "1"}, BY_NUMBER, types)[1]), ["leave_type"])
        self.assertEqual(fields(ei.validate_balance({"employee_number": "2", "leave_type": "Annual Leave", "balance": "-1"}, BY_NUMBER, types)[1]), ["balance"])
        self.assertIn("already has", ei.validate_balance({"employee_number": "2", "leave_type": "annual leave", "balance": "1"}, BY_NUMBER, types,
                                                         allocated={("EMP-2", "Annual Leave")})[1][0]["message"])

    def test_pass_2_and_3_before_pass_1_refused(self):
        self.assertIsNotNone(ei.pass_order_error(2, set()))
        self.assertIsNotNone(ei.pass_order_error(3, {2}))
        self.assertIsNone(ei.pass_order_error(2, {1}))
        self.assertIsNone(ei.pass_order_error(1, set()))

    def test_template_columns_match_the_validator_fields(self):
        for p in ei.PASSES:
            with self.subTest(pass_no=p):
                rows, errs = ei.read_table([ei.template_columns(p), ["x"] * len(ei.FIELDS[p])], p)
                self.assertEqual(errs, [])
                self.assertEqual(list(rows[0]), [f.name for f in ei.FIELDS[p]])
        _clean, errs = ei.validate_row({}, LOOKUPS)
        self.assertTrue({e["field"] for e in errs} <= {f.name for f in ei.FIELDS[1]})

    def test_missing_column_and_empty_file(self):
        self.assertIn("Missing column", ei.read_table([["Staff number"], ["1"]], 1)[1][0])
        self.assertEqual(ei.read_table([], 1)[1], ["The file is empty."])

    def test_import_state(self):
        self.assertEqual(ei.import_state({})[0], "todo")
        self.assertEqual(ei.import_state({1: {"status": "Done"}})[0], "partial")
        self.assertEqual(ei.import_state({1: {"status": "Done"}, 2: {"status": "Done"}})[0], "done")


def csv_file(rows: list[list[str]], name="staff.csv") -> dict[str, str]:
    text = "\n".join(",".join(r) for r in rows)
    return {"file_name": name, "content": base64.b64encode(text.encode()).decode()}


PASS1_HEADER = ["Staff number", "First name", "Last name", "Gender", "Date of birth", "Date of joining", "Department", "Designation"]


class GlueTests(unittest.TestCase):
    def setUp(self):
        self.store = {
            "Gender": [{"name": "Female"}, {"name": "Male"}],
            "Department": [{"name": "Certification - ESW", "department_name": "Certification", "is_group": 0, "disabled": 0, "company": "ESWASA"},
                           {"name": "Operations - ESW", "department_name": "Operations", "is_group": 1, "disabled": 0, "company": "ESWASA"}],
            "Designation": [{"name": "Auditor", "designation_name": "Auditor"}],
            "Employee": [],
            ei.RUN: [],
        }
        self.f = ff.install(self.store, user="hr@x", roles=("HR Manager",),
                            doctypes=(ei.RUN, "Gender", "Designation", "Employee Grade", "Branch", "Employment Type", "Holiday List", "Cost Center", "Leave Type"),
                            meta_fields={"Employee": tuple(ei.EMPLOYEE_FIELDS)})
        self.addCleanup(ff.uninstall)
        self.jobs = []
        job_args = ("run", "content", "file_name")
        self.f.enqueue = lambda fn, **kw: self.jobs.append((fn, {k: kw[k] for k in job_args}))
        self.f.db.commit = lambda: None
        self.f.db.rollback = mock.Mock()
        p = mock.patch("eswasa_hr.recruitment._company", return_value="ESWASA")
        p.start()
        self.addCleanup(p.stop)

    def _inserts(self, dt):
        return len(self.store.get(dt, []))

    def test_dry_run_writes_nothing(self):
        out = ei.dry_run_impl(csv_file([PASS1_HEADER, ["1", "Thandi", "Mamba", "Female", "1990-04-02", "2020-01-15", "Certification", "Auditor"]]), 1)
        self.assertTrue(out["ok"])
        self.assertEqual((out["create"], out["update"]), (1, 0))
        self.assertEqual(self._inserts("Employee"), 0)
        self.assertEqual(self._inserts(ei.RUN), 0)

    def test_dry_run_reports_rows_and_cells(self):
        out = ei.dry_run_impl(csv_file([PASS1_HEADER, ["1", "Thandi", "Mamba", "Female", "1990-04-02", "2020-01-15", "Operations", "Auditor"]]), 1)
        self.assertFalse(out["ok"])
        self.assertEqual((out["errors"][0]["row"], out["errors"][0]["field"]), (2, "department"))

    def test_pass_2_before_pass_1_is_refused(self):
        out = ei.dry_run_impl(csv_file([["Staff number", "Line manager's staff number"], ["1", "2"]]), 2)
        self.assertIn("pass 1", out["errors"][0]["message"])
        with self.assertRaises(ff.Throw):
            ei.run_impl(csv_file([["Staff number", "Line manager's staff number"], ["1", "2"]]), 2)

    def test_run_needs_hr_manager(self):
        ff.uninstall()
        self.f = ff.install(self.store, user="u@x", roles=("HR User",), doctypes=(ei.RUN,))
        with self.assertRaises(self.f.PermissionError):
            ei.run_impl(csv_file([PASS1_HEADER]), 1)

    def test_run_is_all_or_nothing(self):
        good = ["1", "Thandi", "Mamba", "Female", "1990-04-02", "2020-01-15", "Certification", "Auditor"]
        bad = ["2", "Sipho", "Dlamini", "Male", "1990-04-02", "not a date", "Certification", "Auditor"]
        out = ei.run_impl(csv_file([PASS1_HEADER, good, bad]), 1)
        self.assertEqual(out["status"], "Queued")
        fn, kw = self.jobs[0]
        res = fn(**kw)
        self.assertFalse(res["ok"])
        self.assertEqual(self._inserts("Employee"), 0)
        run = self.store[ei.RUN][0]
        self.assertEqual((run["status"], run["created"], run["error_count"]), ("Failed", 0, 1))
        self.assertEqual(json.loads(run["errors"])[0]["row"], 3)

    def test_a_failure_while_writing_rolls_everything_back(self):
        good = ["1", "Thandi", "Mamba", "Female", "1990-04-02", "2020-01-15", "Certification", "Auditor"]
        ei.run_impl(csv_file([PASS1_HEADER, good]), 1)
        fn, kw = self.jobs[0]
        with mock.patch("eswasa_hr.employees.create_impl", side_effect=RuntimeError("disk full")):
            res = fn(**kw)
        self.f.db.rollback.assert_called_once()
        self.assertEqual(self.store[ei.RUN][0]["status"], "Failed")
        self.assertIn("Nothing was imported", res["errors"][0]["message"])

    def test_a_clean_run_creates_through_create_impl(self):
        good = ["1", "Thandi", "Mamba", "Female", "1990-04-02", "2020-01-15", "Certification", "Auditor"]
        ei.run_impl(csv_file([PASS1_HEADER, good]), 1)
        fn, kw = self.jobs[0]
        res = fn(**kw)
        self.assertTrue(res["ok"])
        emp = self.store["Employee"][0]
        self.assertEqual((emp["employee_number"], emp["employee_name"], emp["department"]), ("1", "Thandi Mamba", "Certification - ESW"))
        self.assertNotIn("custom_is_demo", emp)
        self.assertEqual(self.store[ei.RUN][0]["status"], "Done")
        # Re-running the same file changes nothing.
        again = ei.dry_run_impl(csv_file([PASS1_HEADER, good]), 1)
        self.assertEqual((again["create"], again["update"], again["unchanged"]), (0, 0, 1))

    def test_demo_records_warn(self):
        self.f.get_meta = lambda dt: type("M", (), {"has_field": staticmethod(lambda fn: fn in (*ei.EMPLOYEE_FIELDS, "custom_is_demo"))})
        self.store["Employee"].append({"name": "DEMO-1", "custom_is_demo": 1, "status": "Active"})
        out = ei.dry_run_impl(csv_file([PASS1_HEADER, ["1", "Thandi", "Mamba", "Female", "1990-04-02", "2020-01-15", "Certification", "Auditor"]]), 1)
        self.assertIn("demo", out["warnings"][0])

    def test_pass_2_links_managers_and_logins(self):
        self.store[ei.RUN].append({"name": "R1", "pass_no": "1", "status": "Done"})
        self.store["Employee"] += [{"name": "EMP-1", "employee_number": "1", "employee_name": "Ed", "status": "Active"},
                                   {"name": "EMP-2", "employee_number": "2", "employee_name": "Thandi Mamba", "status": "Active"}]
        self.store["User"] = [{"name": "ed@x", "email": "ed@x"}]
        plain = self.f.get_doc
        added = []

        def get_doc(d, *a):
            doc = plain(d, *a)
            if a:
                rows = self.store[d]
                doc.save = lambda: rows.__setitem__(next(i for i, r in enumerate(rows) if r["name"] == a[0]), dict(doc))
                doc.add_roles = lambda *roles: added.append((a[0], roles))
            return doc

        self.f.get_doc = get_doc
        header = ["Staff number", "Line manager's staff number", "Leave approver email", "Login email"]
        ei.run_impl(csv_file([header, ["1", "", "", "ed@x"], ["2", "1", "ed@x", "thandi@x"]]), 2)
        fn, kw = self.jobs[0]
        res = fn(**kw)
        self.assertTrue(res["ok"], res["errors"])
        by = {r["name"]: r for r in self.store["Employee"]}
        login = next(u["name"] for u in self.store["User"] if u["email"] == "thandi@x")  # the fake names Users USER-n
        self.assertEqual((by["EMP-2"]["reports_to"], by["EMP-2"]["leave_approver"], by["EMP-2"]["user_id"]), ("EMP-1", "ed@x", login))
        self.assertEqual(by["EMP-2"]["create_user_permission"], 1)
        self.assertEqual(by["EMP-1"]["user_id"], "ed@x")
        self.assertEqual(len(self.store["User"]), 2)  # one new login; ed@x reused
        self.assertIn((login, ("Employee", "Employee Self Service")), added)

    def test_pass_3_refused_without_a_leave_period(self):
        self.store[ei.RUN].append({"name": "R1", "pass_no": "1", "status": "Done"})
        out = ei.dry_run_impl(csv_file([["Staff number", "Leave type", "Opening balance (days)"], ["1", "Annual Leave", "10"]]), 3)
        self.assertIn("Leave Period", out["errors"][0]["message"])


if __name__ == "__main__":
    unittest.main()
