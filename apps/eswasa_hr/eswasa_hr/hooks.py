app_name = "eswasa_hr"
app_title = "Eswasa HR"
app_publisher = "ESWASA"
app_description = "HR & People — authorisations, impartiality, cases, HR fixtures"
app_email = "ict@eswasa.org.sz"
app_license = "mit"

required_apps = ["frappe", "erpnext", "hrms"]

fixtures = [
    {
        "dt": "Custom Field",
        "filters": [
            [
                "name",
                "in",
                [
                    "Department-custom_head",
                    "Staffing Plan Detail-custom_frozen_positions",
                    "Skill-custom_kind",
                    "Skill-custom_scheme",
                    "Skill-custom_validity_months",
                    "Employee-custom_is_demo",
                    "Goal-custom_strategic_goal",
                    "Employee Promotion-custom_approved_by",
                    "Employee Transfer-custom_approved_by",
                    "Employee Separation-custom_approved_by",
                    "Employee Separation-custom_reason",
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
                ],
            ]
        ],
    },
]

# Permission hooks for Employee (line-manager visibility) — §11
# permission_query_conditions = {
#     "Employee": "eswasa_hr.permissions.employee_query",
# }
# has_permission = {
#     "Employee": "eswasa_hr.permissions.employee_has_permission",
# }

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
        "on_submit": "eswasa_hr.leave.sync_todo",
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
}
