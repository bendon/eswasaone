app_name = "eswasa_metrology"
app_title = "Eswasa Metrology"
app_publisher = "ESWASA"
app_description = "Eswasa Metrology regulatory module for EswasaOne"
app_email = "ict@eswasa.org.sz"
app_license = "mit"

required_apps = ["frappe"]

add_to_apps_screen = [
	{
		"name": app_name,
		"logo": "/assets/eswasa_metrology/logo.png",
		"title": app_title,
		"route": "/app/eswasa-metrology",
		"has_permission": "eswasa_metrology.permissions.check_app_permission",
	}
]

fixtures = [
 {
  "dt": "Role",
  "filters": [
   [
    "name",
    "in",
    [
     "Eswasa Metrology Officer",
     "Eswasa Metrology Reviewer",
     "Eswasa Metrology Manager"
    ]
   ]
  ]
 },
 {
  "dt": "Workflow State",
  "filters": [
   [
    "name",
    "in",
    [
     "Certified",
     "Dispatched",
     "In Progress",
     "Received",
     "Reviewed"
    ]
   ]
  ]
 },
 {
  "dt": "Workflow Action Master",
  "filters": [
   [
    "name",
    "in",
    [
     "Dispatch",
     "Issue Certificate",
     "Start Work",
     "Submit for Review"
    ]
   ]
  ]
 },
 {
  "dt": "Workflow",
  "filters": [
   [
    "name",
    "in",
    [
     "Metrology Calibration",
     "Sample Custody Flow"
    ]
   ]
  ]
 },
 {
  "dt": "Notification",
  "filters": [
   [
    "name",
    "in",
    [
     "Metro R-M1 Job Received",
     "Metro R-M2 Result Approved",
     "Metro R-M3 Calibration Due",
     "Metro R-M4 Out of Tolerance"
    ]
   ]
  ]
 },
 {
  "dt": "Assignment Rule",
  "filters": [
   [
    "name",
    "in",
    [
     "Metro Job Received Pool",
     "Metro OOT Supervisor Pool"
    ]
   ]
  ]
 }
]

# R-M1…M4 document events (controllers also implement hooks)
doc_events = {
    "Calibration Job": {
        "on_submit": "eswasa_metrology.rules.rm1_job_received",
        "on_update": "eswasa_metrology.rules.rm1_on_job_update",
        "validate": "eswasa_metrology.rules.validate_instrument_not_blocked",
    },
    "Result": {
        "validate": "eswasa_metrology.rules.rm4_out_of_tolerance",
        "after_insert": "eswasa_metrology.rules.rm4_after_insert",
        "before_submit": "eswasa_metrology.rules.rm4_before_submit",
        "on_update_after_submit": "eswasa_metrology.rules.rm2_result_approved",
    },
}

# Scheduler: R-M3 daily instrument calibration-due sweep
scheduler_events = {
    "daily": [
        "eswasa_metrology.tasks.run_daily_metro_rules",
    ],
}
