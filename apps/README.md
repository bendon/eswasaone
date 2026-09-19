# Custom Frappe apps

| App | Owner | Phase |
|---|---|---|
| `eswasa_certification` | WS2 | 1 — vertical slice |
| `eswasa_standards` | WS3 | 2 |
| `eswasa_metrology` | WS3 | 3 |
| `eswasa_estore` | WS3 | 2 |
| `eswasa_verification` | WS3 | 2 |
| `eswasa_tbt` | WS3 | 3 |
| `eswasa_governance` | WS3 | 3 |
| `eswasa_ingest` | WS8 | 2–3 |

Each app: `bench new-app` structure, DocTypes, fixtures, `api.py`. Linked into `engine/frappe-bench` by `engine/bootstrap.sh`.
