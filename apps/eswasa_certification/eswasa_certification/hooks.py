app_name = "eswasa_certification"
app_title = "Eswasa Certification"
app_publisher = "ESWASA"
app_description = "ISO/IEC 17021/17065 CBMS vertical slice for EswasaOne"
app_email = "ict@eswasa.org.sz"
app_license = "mit"
app_version = "0.0.1"

# Required apps (ERPNext optional; pure Frappe DocTypes)
# required_apps = []

add_to_apps_screen = [
    {
        "name": "eswasa_certification",
        "logo": "/assets/eswasa_certification/images/eswasa-lockup.png",
        "title": "Certification",
        "route": "/app/certification",
        "has_permission": "frappe.utils.if_has_permission",
    }
]

# Overrides frappe's default frappe-framework-logo when Website/Navbar logo unset
app_logo_url = "/assets/eswasa_certification/images/eswasa-lockup.png"

after_install = "eswasa_certification.install.after_install"
after_migrate = "eswasa_certification.install.after_migrate"

# Fixtures exported with the app — roles + certification application workflow
fixtures = [
    {
        "dt": "Role",
        "filters": [
            [
                "name",
                "in",
                [
                    "Certification Manager",
                    "Certification Officer",
                    "Certification Auditor",
                    "Certification Applicant",
                ],
            ]
        ],
    },
    {
        "dt": "Workflow State",
        "filters": [
            [
                "workflow_state_name",
                "in",
                [
                    "Application",
                    "Assessment",
                    "Audit Scheduled",
                    "Audit",
                    "NC Resolution",
                    "Certified",
                    "Surveillance",
                    "Renewal",
                    "Withdraw",
                ],
            ]
        ],
    },
    {
        "dt": "Workflow Action Master",
        "filters": [
            [
                "workflow_action_name",
                "in",
                [
                    "Submit for Assessment",
                    "Schedule Audit",
                    "Start Audit",
                    "Raise NC",
                    "Clear NC",
                    "Certify",
                    "Start Surveillance",
                    "Start Renewal",
                    "Withdraw",
                    "Reassess",
                ],
            ]
        ],
    },
    {
        "dt": "Workflow",
        "filters": [["name", "in", ["Certification Application Flow", "Field Visit Flow"]]],
    },
    {
        "dt": "Print Format",
        "filters": [["name", "=", "Certificate of Conformity"]],
    },
    {
        "dt": "Notification",
        "filters": [
            [
                "name",
                "in",
                [
                    "Cert R-C1 Application Submitted",
                    "Cert R-C3 Certificate Approved",
                    "Cert R-C4 Renewal Due",
                ],
            ]
        ],
    },
    {
        "dt": "Assignment Rule",
        "filters": [
            [
                "name",
                "in",
                [
                    "Cert Application Assessment Pool",
                    "Cert Surveillance Due Pool",
                ],
            ]
        ],
    },
]

# R-C1…C3 document events (controllers also implement on_submit)
doc_events = {
    "Certification Application": {
        "on_submit": "eswasa_certification.rules.rc1_application_submitted",
        "on_update": "eswasa_certification.rules.rc1_on_application_update",
    },
    "Audit": {
        "on_submit": "eswasa_certification.rules.rc2_audit_nc",
        "validate": "eswasa_certification.rules.validate_auditor_assignment",
    },
    "Audit Finding": {
        "after_insert": "eswasa_certification.rules.rc2_on_finding_insert",
        "on_update": "eswasa_certification.rules.rc2_on_finding_close",
    },
    "Certificate": {
        "on_submit": "eswasa_certification.rules.rc3_certificate_submitted",
    },
}

# Scheduler: overdue audits + R-C4…C7 daily sweep
scheduler_events = {
    "daily": [
        "eswasa_certification.tasks.run_daily_cert_rules",
    ],
}
