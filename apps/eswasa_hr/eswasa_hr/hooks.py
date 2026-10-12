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
    },
}
