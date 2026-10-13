app_name = "eswasa_hr"
app_title = "Eswasa HR"
app_publisher = "ESWASA"
app_description = "HR & People — authorisations, impartiality, cases, HR fixtures"
app_email = "ict@eswasa.org.sz"
app_license = "mit"

required_apps = ["frappe", "erpnext", "hrms"]

fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["Eswasa Executive Director", "Eswasa Quality Manager"]]]},
    {"dt": "Print Format", "filters": [["name", "in", ["ESWASA Offer Letter", "Certificate of Service",
                                                      # HR additions plan 03: letters on HR Letter
                                                      "ESWASA Probation Confirmation", "ESWASA Contract Letter", "ESWASA Promotion Letter",
                                                      "ESWASA Transfer Letter", "ESWASA Warning Letter", "ESWASA Employment Confirmation"]]]},
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
                    "User-custom_hr_email_opt_out",
                    "HR Settings-custom_receipt_required_above",
                    "Expense Claim Detail-custom_receipt",
                    "Job Requisition-custom_stage",
                    "HR Settings-custom_offer_signatory_role",
                    "Job Applicant-custom_source",
                    "Employment Type-custom_required_documents",
                    "Training Event-custom_skill",
                    "HR Settings-custom_external_personnel_enabled",
                    "Employee Boarding Activity-custom_owner",
                    "Employee Boarding Activity-custom_team",
                    "HR Settings-custom_eswasa_rules_section",
                    "HR Settings-custom_leave_sla_days",
                    "HR Settings-custom_expense_sla_days",
                    "HR Settings-custom_decision_sla_days",
                    "HR Settings-custom_head_sla_days",
                    "HR Settings-custom_interview_feedback_days",
                    "HR Settings-custom_offer_reply_days",
                    "HR Settings-custom_contract_notice_days",
                    "HR Settings-custom_probation_notice_days",
                    "HR Settings-custom_expiry_alert_days",
                    "HR Settings-custom_thin_cover",
                    "HR Settings-custom_declaration_handoff_days",
                    "HR Settings-custom_movement_days",
                    "HR Settings-custom_turnover_days",
                    "HR Settings-custom_cycle_warn_days",
                    "HR Settings-custom_appraisal_reminder_days",
                    "HR Settings-custom_calendar_max_days",
                    "HR Settings-custom_rating_max",
                    "HR Settings-custom_hr_email",
                    "HR Settings-custom_verbal_warning_months",
                    "HR Settings-custom_written_warning_months",
                    "HR Settings-custom_final_warning_months",
                    "HR Settings-custom_issued_item_types",
                    # HR additions plan 04: family and medical (permlevel 3 on the field itself)
                    "Employee-custom_medical_aid_scheme",
                    "Employee-custom_medical_aid_number",
                    "Employee-custom_medical_aid_plan",
                    "Employee-custom_medical_aid_main_member",
                    "Employee-custom_dependants",
                    # HR additions plan 08: sick-note threshold and service milestones
                    "Leave Type-custom_certificate_after_days",
                    "Leave Application-custom_medical_certificate",
                    "HR Settings-custom_service_milestones",
                    # HR additions plan 05: training plan lines scheduled as events, with recorded cost
                    "Training Event-custom_plan_line",
                    "Training Event-custom_direct_cost",
                    "Training Event-custom_indirect_cost",
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
                    "HR Settings-leave_approver_mandatory_in_leave_application-default",
                    "HR Settings-expense_approver_mandatory_in_expense_claim-default",
                    "HR Settings-prevent_self_leave_approval-default",
                    "HR Settings-prevent_self_expense_approval-default",
                    "HR Settings-restrict_backdated_leave_application-default",
                    "HR Settings-check_vacancies-default",
                    "HR Settings-emp_created_by-default",
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
    # Plan 06: HR and the person; exit interviews like cases (HR Managers and the interviewer).
    "Profile Change Request": "eswasa_hr.profile_changes.query",
    "Exit Interview": "eswasa_hr.lifecycle.exit_interview_query",
    # HR additions plan 02: HR sees every issued item; others their own and their reports'.
    "HR Issued Item": "eswasa_hr.issued_items.query",
    # HR additions plan 03: warning letters follow the case rule; staff see their own issued letters.
    "HR Letter": "eswasa_hr.letters.query",
    # HR additions plan 05: needs for HR, the person, their managers and department head; plans for HR and the head.
    "Training Need": "eswasa_hr.training_plan.need_query",
    "Training Plan": "eswasa_hr.training_plan.plan_query",
}
has_permission = {
    "Employee Grievance": "eswasa_hr.cases.has_permission",
    "Disciplinary Case": "eswasa_hr.cases.has_permission",
    "Employee": "eswasa_hr.scope.employee_has_permission",
    "Leave Application": "eswasa_hr.scope.leave_has_permission",
    "Appraisal": "eswasa_hr.scope.appraisal_has_permission",
    "Staff Authorisation": "eswasa_hr.scope.authorisation_has_permission",
    "Employee Document": "eswasa_hr.scope.document_has_permission",
    "Profile Change Request": "eswasa_hr.profile_changes.has_permission",
    "Exit Interview": "eswasa_hr.lifecycle.exit_interview_has_permission",
    "HR Issued Item": "eswasa_hr.issued_items.has_permission",
    "HR Letter": "eswasa_hr.letters.has_permission",
    "Training Need": "eswasa_hr.training_plan.need_has_permission",
    "Training Plan": "eswasa_hr.training_plan.plan_has_permission",
}

after_migrate = ["eswasa_hr.setup.after_migrate"]

# Plan 08: the ESWASA Offer Letter print format reads its data through this; plan 06 the Certificate of Service.
jinja = {"methods": ["eswasa_hr.hiring.offer_letter_context", "eswasa_hr.certificate.certificate_context_for", "eswasa_hr.letters.letter_context_for"]}

scheduler_events = {
    "daily": [
        "eswasa_hr.tasks.daily",
    ],
}

doc_events = {
    # Plan 02 follow-up: a manager's or approver's own-record User Permission must not hide what they decide.
    "Employee": {"on_update": "eswasa_hr.scope.on_employee_update"},
    "Department": {"on_update": "eswasa_hr.scope.on_department_update"},
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
    # Plan 05: route each expense claim to the employee's own expense approver in Approvals.
    "Expense Claim": {
        "after_insert": "eswasa_hr.expenses.sync_todo",
        "on_update": "eswasa_hr.expenses.sync_todo",
        "on_submit": "eswasa_hr.expenses.sync_todo",
        "on_cancel": "eswasa_hr.expenses.sync_todo",
    },
    # Plan 07: the technician must be authorised for the discipline on the job dates, have signed this
    # year's declaration and not be on leave. Here so eswasa_metrology needs no HR import.
    "Calibration Job": {
        "validate": "eswasa_hr.competence.validate_calibration_job",
    },
}

# Approvals decides DocTypes without a Frappe Workflow through these (eswasa_governance.approvals).
eswasa_approval_handlers = {
    "Leave Application": "eswasa_hr.leave.decide",
    # Plan 05: reimbursement only; Finance pays (Payment Entry), HR never posts.
    "Expense Claim": "eswasa_hr.expenses.decide",
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
    # Plan 06: staff corrections to their own record (HR other than the person decides; the change is logged).
    "Profile Change Request": "eswasa_hr.profile_changes.decide",
    # Plan 06: the interviewer marks the exit interview held, with a summary.
    "Exit Interview": "eswasa_hr.lifecycle.decide_exit_interview",
    # HR additions plan 02: the holder acknowledges receipt of an issued item (a do card).
    "HR Issued Item": "eswasa_hr.issued_items.decide",
    # HR additions plan 03: "Prepare employment confirmation letter …" do card; Done prepares it.
    "HR Letter": "eswasa_hr.letters.decide",
    # HR additions plan 05: "Approve training plan …"; a named HR Manager other than the preparer (provisional, A6).
    "Training Plan": "eswasa_hr.training_plan.decide",
}
