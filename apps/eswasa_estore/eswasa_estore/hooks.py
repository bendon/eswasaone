app_name = "eswasa_estore"
app_title = "Eswasa Estore"
app_publisher = "ESWASA"
app_description = "Eswasa Estore regulatory module for EswasaOne"
app_email = "ict@eswasa.org.sz"
app_license = "mit"

required_apps = ["frappe", "erpnext"]

add_to_apps_screen = [
	{
		"name": app_name,
		"logo": "/assets/eswasa_estore/logo.png",
		"title": app_title,
		"route": "/app/eswasa-estore",
		"has_permission": "eswasa_estore.permissions.check_app_permission",
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
     "Eswasa Estore Manager",
     "Eswasa Estore Clerk"
    ]
   ]
  ]
 }
]

doc_events = {
	"Payment Entry": {
		"on_submit": "eswasa_estore.rules.on_payment_entry_submit",
	},
	"Sales Order": {
		"on_update": "eswasa_estore.rules.on_sales_order_update",
	},
}
