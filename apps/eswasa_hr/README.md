# eswasa_hr

Frappe app for EswasaOne HR & People gaps that native HRMS cannot cover.

See `docs/EswasaOne_HR_PEOPLE_BUILD_BRIEF.md` and `docs/EswasaOne_HR_DOCTYPE_AUDIT.md`.

## Owns

- Custom fields: `Department.custom_head`, `Staffing Plan Detail.custom_frozen_positions`, Skill catalogue fields
- DocTypes: Staff Authorisation, Impartiality Declaration, Disciplinary Case, Employee Document
- Guard: `eswasa_hr.competence.is_authorised` / `has_conflict` (shared by Field Visit and Calibration)
- Fixtures: HR Settings property setters, disable ERPNext department install fixtures
- Cron rules R-H1…H6 (scaffold)

## Install

```bash
cd /srv/projects/eswasaone/engine/frappe-bench
bench get-app /srv/projects/eswasaone-certifications/apps/eswasa_hr   # or symlink into apps/
bench --site eswasaone.localhost install-app eswasa_hr
bench --site eswasaone.localhost migrate
```

Do **not** invent ESWASA departments, staff, leave rules or tax rates — wait for §0.5 inputs.
