# HANDOFF — Certify Slice (WS2) API ready

Wire gateway + tool_registry to Frappe (mock fallback OK):

| Tool / route | Frappe method |
|---|---|
| list overdue audits | `eswasa_certification.api.list_overdue` |
| create application | `eswasa_certification.api.create_application` |
| advance state | `eswasa_certification.api.advance_state` |
| get / list | `get_application`, `list_applications` |

Mutations require `confirm=true`. Seed includes one overdue audit for Ask “show overdue audits”.

Also pending from WS6: replace `request_to_pay_stub` → `request_to_pay`; add `POST /api/adapters/momo/callback` → `handle_callback`.
