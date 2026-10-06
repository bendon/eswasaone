app_name = "eswasa_governance"
app_title = "Eswasa Governance"
app_publisher = "ESWASA"
app_description = "Eswasa Governance regulatory module for EswasaOne"
app_email = "ict@eswasa.org.sz"
app_license = "mit"

required_apps = ["frappe"]

add_to_apps_screen = [
	{
		"name": app_name,
		"logo": "/assets/eswasa_governance/logo.png",
		"title": app_title,
		"route": "/app/eswasa-governance",
		"has_permission": "eswasa_governance.permissions.check_app_permission",
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
     "Eswasa Board Secretary",
     "Eswasa Board Member",
     "Eswasa Risk Officer"
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
     "Adopted",
     "Draft",
     "Review"
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
     "Adopt",
     "Return to Draft",
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
     "Board Resolution Flow",
     "Board Pack Flow"
    ]
   ]
  ]
 }
]

# R-A1: open Workflow Action → referenced ToDo for approval queue aggregate.
# R-G2 / R-G3: resolution adopted → ToDos; high risk → feed + review cadence.
doc_events = {
	"Workflow Action": {
		"after_insert": "eswasa_governance.approvals.on_workflow_action_insert",
	},
	"Board Resolution": {
		"on_update": "eswasa_governance.rules.rg2_resolution_adopted",
	},
	"ToDo": {
		"on_update": "eswasa_governance.rules.rg2_todo_closure_check",
	},
	"Risk Register Entry": {
		"after_insert": "eswasa_governance.rules.rg3_high_risk_alert",
		"on_update": "eswasa_governance.rules.rg3_high_risk_alert",
	},
}

# R-G1: Board Meeting in 7d → assemble Board Pack + notify secretary
# L5: outbox retries; L1 reconciler backfills missing owner ToDos
scheduler_events = {
	"cron": {
		"*/5 * * * *": [
			"eswasa_governance.tasks.process_outbox",
		],
		"*/15 * * * *": [
			"eswasa_governance.tasks.reconcile_owner_todos",
		],
	},
	"daily": [
		"eswasa_governance.tasks.run_daily_governance_rules",
	],
}
