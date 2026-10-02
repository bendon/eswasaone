# Portals

| App | Port | Fidelity mock |
|---|---|---|
| `service-portal` | **3015** | **`docs/mocks/eswasaone-customer-portal.html`** — top nav + bottom tabs; Home=Ask+featured; guides on `/goals/:slug` |
| `institution-portal` | **3016** | `docs/mocks/eswasaone-institutional-portal.html` — dark left rail |
| `field-portal` | **3017** | **`docs/mocks/eswasaone-field.html`** — mobile ESS + field audits (`/field/`) |
| `shared-ui` | — | tokens, icons, **auth/** session client (WS11) |

## Service Portal — do not port stale chrome

- Source of truth is the **rebuilt customer portal** mock (light top nav).  
- **Ignore** left-rail layouts in older mocks (`eswasaone-guided-flow.html` chrome is stale).  
- Decisions: `docs/DECISIONS_SERVICE_NAV.md`.

Start: `cd portals/service-portal && npm run dev` · Institution: `cd portals/institution-portal && npm run dev`  
Bind `127.0.0.1`. Data via Core only (`VITE_API_BASE`). No direct Frappe.
