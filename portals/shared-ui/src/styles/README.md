# Portal CSS — four entry points

Apps import **one** of these from `@eswasaone/shared-ui`:

| Entry | File | Used by |
|-------|------|---------|
| Global | `styles/global.css` | Composed by the three portals (not imported by apps directly) |
| Service | `styles/service.css` | `service-portal` |
| Institution | `styles/institution.css` | `institution-portal` |
| Field | `styles/field.css` | `field-portal` (PWA) |

## Rules

1. **Portal `index.css` / `main.tsx` imports only its entry** (+ Tailwind if needed).
2. **Never import partials from pages** (`account.css`, `service-shell.css`, `guides.css`, etc.).
3. **Shared chrome** (tokens, reset, dock, modal, footer, staff-gate) → `global.css` / its partials.
4. **Portal-specific surfaces** → that portal’s barrel only.
5. **No cross-portal imports** (Field must not import Institution shell CSS).

Partials under `styles/` are internal composition units for the barrels.

Institution barrel also includes `dashboard.css` (home SoT under `.dash`), `hr.css` (HR & People under `.hr`), `admin.css` (System Administration), and `skeletons.css` (ResourceGate).
