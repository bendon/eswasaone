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
6. **Typography is global.** Faces live only in `tokens.css` (`--font-sans`, `--font-display`, `--font-mono`) and the matching `system/brand.ts` exports. Portals load Plus Jakarta Sans + IBM Plex Mono once in `index.html`. Do not hardcode Arial/other stacks in module CSS or Tailwind — use the tokens / `font-sans` / `font-mono` theme keys.

Partials under `styles/` are internal composition units for the barrels.

Institution barrel also includes `dashboard.css` (home SoT under `.dash`), `hr.css` (HR & People under `.hr`), `admin.css` (System Administration), and `skeletons.css` (ResourceGate).
