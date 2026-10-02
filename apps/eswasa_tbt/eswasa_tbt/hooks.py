app_name = "eswasa_tbt"
app_title = "Eswasa TBT"
app_publisher = "ESWASA"
app_description = "Eswasa TBT regulatory module for EswasaOne"
app_email = "ict@eswasa.org.sz"
app_license = "mit"

required_apps = ["frappe"]

add_to_apps_screen = [
	{
		"name": app_name,
		"logo": "/assets/eswasa_tbt/logo.png",
		"title": app_title,
		"route": "/app/eswasa-tbt",
		"has_permission": "eswasa_tbt.permissions.check_app_permission",
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
     "Eswasa TBT Officer",
     "Eswasa TBT Analyst"
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
     "Ingested",
     "Notified",
     "Tagged"
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
     "Notify Subscribers",
     "Tag"
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
     "TBT Notification Flow"
    ]
   ]
  ]
 }
]

after_install = "eswasa_tbt.install.after_install"
after_migrate = "eswasa_tbt.install.after_migrate"

# R-T1 / R-T2 (controllers also implement after_insert / on_update)
doc_events = {
	"TBT Notification": {
		"after_insert": "eswasa_tbt.rules.rt1_notification_ingested",
		"on_update": "eswasa_tbt.rules.rt1_on_update",
	},
}
