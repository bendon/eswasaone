app_name = "eswasa_standards"
app_title = "Eswasa Standards"
app_publisher = "ESWASA"
app_description = "Eswasa Standards regulatory module for EswasaOne"
app_email = "ict@eswasa.org.sz"
app_license = "mit"

required_apps = ["frappe"]

add_to_apps_screen = [
	{
		"name": app_name,
		"logo": "/assets/eswasa_standards/logo.png",
		"title": app_title,
		"route": "/app/eswasa-standards",
		"has_permission": "eswasa_standards.permissions.check_app_permission",
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
     "Eswasa Standards Officer",
     "Eswasa TC Member",
     "Eswasa Standards Manager"
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
     "Ballot",
     "Committee Draft",
     "New Work Item",
     "Public Review",
     "Published/Gazetted",
     "Working Draft"
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
     "Open Ballot",
     "Open Public Review",
     "Publish / Gazette",
     "Start Drafting",
     "Submit to Committee"
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
     "Standards Development"
    ]
   ]
  ]
 }
]

# R-S1 / R-S3 / R-S4 document events
doc_events = {
	"Work Item": {
		"on_update": "eswasa_standards.rules.rs1_rs3_on_work_item_update",
	},
	"Ballot": {
		"on_update": "eswasa_standards.rules.rs3_on_ballot_update",
	},
	"Standard": {
		"on_update": "eswasa_standards.rules.rs4_standard_supersedes",
		"after_insert": "eswasa_standards.rules.rs4_standard_supersedes",
	},
}

# R-S2 daily public-review sweep
scheduler_events = {
	"daily": [
		"eswasa_standards.tasks.run_daily_standards_rules",
	],
}
