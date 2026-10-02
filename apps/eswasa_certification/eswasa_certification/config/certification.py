from frappe import _


def get_data():
    return [
        {
            "label": _("Certification Body"),
            "icon": "octicon octicon-shield-check",
            "items": [
                {
                    "type": "doctype",
                    "name": "Certification Scheme",
                    "label": _("Schemes"),
                    "description": _("Accredited certification schemes"),
                },
                {
                    "type": "doctype",
                    "name": "Certification Application",
                    "label": _("Applications"),
                    "description": _("CBMS application workflow"),
                },
                {
                    "type": "doctype",
                    "name": "Audit",
                    "label": _("Audits"),
                    "description": _("Audit schedule and overdue tracking"),
                },
                {
                    "type": "doctype",
                    "name": "Audit Finding",
                    "label": _("Findings (NC)"),
                    "description": _("Nonconformities and observations"),
                },
                {
                    "type": "doctype",
                    "name": "Certificate",
                    "label": _("Certificates"),
                    "description": _("Issued certificates"),
                },
            ],
        },
        {
            "label": _("People & Surveillance"),
            "icon": "octicon octicon-organization",
            "items": [
                {
                    "type": "doctype",
                    "name": "Auditor",
                    "label": _("Auditors"),
                },
                {
                    "type": "doctype",
                    "name": "Auditor Competence",
                    "label": _("Auditor Competence"),
                },
                {
                    "type": "doctype",
                    "name": "Surveillance Visit",
                    "label": _("Surveillance Visits"),
                },
            ],
        },
    ]
