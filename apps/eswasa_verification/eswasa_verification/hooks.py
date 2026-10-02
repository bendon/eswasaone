app_name = "eswasa_verification"
app_title = "Eswasa Verification"
app_publisher = "ESWASA"
app_description = "Eswasa Verification regulatory module for EswasaOne"
app_email = "ict@eswasa.org.sz"
app_license = "mit"

required_apps = ["frappe"]

add_to_apps_screen = [
	{
		"name": app_name,
		"logo": "/assets/eswasa_verification/logo.png",
		"title": app_title,
		"route": "/app/eswasa-verification",
		"has_permission": "eswasa_verification.permissions.check_app_permission",
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
     "Eswasa Verification Officer"
    ]
   ]
  ]
 }
]

# Document Events / scheduler left empty — structural skeleton only.
