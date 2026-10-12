app_name = "eswasa_hr"
app_title = "Eswasa HR"
app_publisher = "ESWASA"
app_description = "HR & People — authorisations, impartiality, cases, HR fixtures"
app_email = "ict@eswasa.org.sz"
app_license = "mit"

required_apps = ["frappe", "erpnext", "hrms"]

fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["Eswasa Executive Director"]]]},
    {
        "dt": "Custom Field",
        "filters": [
            [
                "name",
                "in",
                [
                    "Department-custom_head",
                    "Staffing Plan Detail-custom_frozen_positions",
                    "Designation-custom_grade",
                    "Skill-custom_kind",
                    "Skill-custom_scheme",
                    "Skill-custom_validity_months",
                    "Employee-custom_is_demo",
                    "Goal-custom_strategic_goal",
                    "Employee Promotion-custom_approved_by",
                    "Employee Transfer-custom_approved_by",
                    "Employee Separation-custom_approved_by",
                    "Employee Separation-custom_reason",
                    "Employee Grievance-custom_case_owner",
                    "Employee Grievance-custom_next_step",
                    "Employee Grievance-custom_next_step_due",
                    "Employee Grievance-custom_talk_first",
                ],
            ]
        ],
    },
    {
        "dt": "Property Setter",
        "filters": [
            [
                "name",
                "in",
                [
                    "HR Settings-leave_approver_mandatory_in_leave_application",
                    "HR Settings-expense_approver_mandatory_in_expense_claim",
                    "HR Settings-prevent_self_leave_approval",
                    "HR Settings-prevent_self_expense_approval",
                    "HR Settings-restrict_backdated_leave_application",
                    "HR Settings-check_vacancies",
                    "HR Settings-emp_created_by",
                    # J12: protected Employee fields (eswasa_hr.sensitive.LEVELS)
                    "Employee-date_of_birth-permlevel",
                    "Employee-marital_status-permlevel",
                    "Employee-personal_email-permlevel",
                    "Employee-cell_number-permlevel",
                    "Employee-current_address-permlevel",
                    "Employee-permanent_address-permlevel",
                    "Employee-person_to_be_contacted-permlevel",
                    "Employee-relation-permlevel",
                    "Employee-emergency_phone_number-permlevel",
                    "Employee-passport_number-permlevel",
                    "Employee-ctc-permlevel",
                    "Employee-salary_currency-permlevel",
                    "Employee-salary_mode-permlevel",
                    "Employee-bank_name-permlevel",
                    "Employee-bank_ac_no-permlevel",
                    "Employee-iban-permlevel",
                ],
            ]
        ],
    },
]

# Cases (brief §10): only HR Managers and the named case owner (or the appeal owner during an appeal) can read
# a case, in Desk as well as the portal. These hooks only narrow; HR User and Employee lose access to cases.
# Plan 02 (brief §11, §14.8): HR sees everyone; others see their own record, their reports, and what they decide
# (eswasa_hr.scope). These also only narrow.
permission_query_conditions = {
    "Employee Grievance": "eswasa_hr.cases.grievance_query",
    "Disciplinary Case": "eswasa_hr.cases.disciplinary_query",
    "Employee": "eswasa_hr.scope.employee_query",
    "Leave Application": "eswasa_hr.scope.leave_query",
    "Appraisal": "eswasa_hr.scope.appraisal_query",
    "Staff Authorisation": "eswasa_hr.scope.authorisation_query",
    "Employee Document": "eswasa_hr.scope.document_query",
}
has_permission = {
    "Employee Grievance": "eswasa_hr.cases.has_permission",
    "Disciplinary Case": "eswasa_hr.cases.has_permission",
    "Employee": "eswasa_hr.scope.employee_has_permission",
    "Leave Application": "eswasa_hr.scope.leave_has_permission",
    "Appraisal": "eswasa_hr.scope.appraisal_has_permission",
    "Staff Authorisation": "eswasa_hr.scope.authorisation_has_permission",
    "Employee Document": "eswasa_hr.scope.document_has_permission",
}

after_migrate = ["eswasa_hr.setup.after_migrate"]

scheduler_events = {
    "daily": [
        "eswasa_hr.tasks.daily",
    ],
}

doc_events = {
    "Staff Authorisation": {
        "validate": "eswasa_hr.eswasa_hr.doctype.staff_authorisation.staff_authorisation.validate",
        # Journey J4: draft → one ToDo for the head of the person's department.
        "after_insert": "eswasa_hr.authorisations.sync_todo",
        "on_update": "eswasa_hr.authorisations.sync_todo",
        "on_submit": "eswasa_hr.authorisations.sync_todo",
        "on_cancel": "eswasa_hr.authorisations.sync_todo",
    },
    # Journey J3: route each leave request to the employee's own leave approver in Approvals.
    "Leave Application": {
        "after_insert": "eswasa_hr.leave.sync_todo",
        "on_update": "eswasa_hr.leave.sync_todo",
        "on_submit": ["eswasa_hr.leave.sync_todo", "eswasa_hr.leave.cover_prompt"],
        "on_cancel": "eswasa_hr.leave.sync_todo",
    },
}

# Approvals decides DocTypes without a Frappe Workflow through these (eswasa_governance.approvals).
eswasa_approval_handlers = {
    "Leave Application": "eswasa_hr.leave.decide",
    "Staff Authorisation": "eswasa_hr.authorisations.decide",
    "Job Requisition": "eswasa_hr.recruitment.decide",
    "Job Offer": "eswasa_hr.hiring.decide_offer",
    # Onboarding tasks are marked done; other Tasks keep the old behaviour (ToDos closed).
    "Task": "eswasa_hr.onboarding.decide_task",
    "Employee Promotion": "eswasa_hr.lifecycle.decide_promotion",
    "Employee Transfer": "eswasa_hr.lifecycle.decide_transfer",
    "Employee Separation": "eswasa_hr.lifecycle.decide_separation",
    "Contract Change": "eswasa_hr.contracts.decide",
    # Self-assessment and manager-review ToDos close only once that step is really done.
    "Appraisal": "eswasa_hr.performance.decide",
    # R-H2…H4 alerts: Acknowledge closes only the acknowledging user's ToDo.
    "HR Alert": "eswasa_hr.alerts.decide",
    # Cases move on only from the case page (notes, outcome, appeal routing).
    "Employee Grievance": "eswasa_hr.cases.decide",
    "Disciplinary Case": "eswasa_hr.cases.decide",
    # J11: the Executive Director decides; the Board Secretary records the Council decision when needed.
    "Establishment Change": "eswasa_hr.establishment.decide",
    # Plan 02: module access requests; the HR page's review calls the same review_impl.
    "Module Access Request": "eswasa_hr.access_requests.decide",
}
