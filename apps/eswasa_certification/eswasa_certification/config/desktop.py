from frappe import _


def get_data():
    return [
        {
            "module_name": "Certification",
            "type": "module",
            "label": _("Certification"),
            "color": "#15803D",
            "icon": "octicon octicon-shield-check",
            "description": "ISO/IEC 17021/17065 CBMS",
        }
    ]
