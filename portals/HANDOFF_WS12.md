# WS12 — Service Portal Pages, Routing, PWA & Sticky Ask

**Owns:** `portals/service-portal/*`  
**Shell SoT:** `docs/mocks/eswasaone-customer-portal.html` (citizen / light top nav)  
**Goals SoT:** `docs/mocks/eswasaone-goals.html`, `docs/mocks/eswasaone-goal-guide.html`  
**Depends on:** WS11 session client (`@eswasaone/shared-ui` auth)

## Route table

| Path | Page | Notes |
|---|---|---|
| `/` | Home | Ask + featured goals + services. **Never stacks steps.** |
| `/goals` | Goals library | Search + category filter; generated/cached catalogue |
| `/goals/:slug` | Guide page | Steps main; Related goals at bottom |
| `/guide` | Guide (ad-hoc) | `?q=` free-text → same layout as slug guide |
| `/standards`, `/standards/:id` | Catalogue | |
| `/certification`, `/apply`, `/:id` | Certification | |
| `/training`, `/training/:id` | Training | |
| `/export`, `/applicability`, `/verify`, `/complaints` | Services | |
| `/account/*`, `/login`, `/offline` | Account / PWA | |

**Rule:** Goal selection (featured chip, library card, Ask → known goal) navigates to `/goals/:slug`. Legacy `/?goal=` redirects. Goals are generated + cached guides promoted from the requirements graph.

## Done
- `createBrowserRouter` route table — real paths, `NavLink` active states
- Layout chrome + Dock Ask on every route; Home hero collapses via IntersectionObserver
- Pages: Home, **Goals**, **Goal guide**, Standards, Certification, Training, Export, Applicability, Verify, Complaints, Account/*, Login, Offline
- Data via Core `/api/*` with typed local fallbacks (`// TODO: wire real` where contract/Core stub missing)
- Progressive auth: gated routes + buy/enrol resume via WS11 `AuthModal`
- PWA: `vite-plugin-pwa` (manifest, Workbox SWR for catalogue/guides GETs, navigateFallback)
- SPA deep links work through Vite history middleware (nginx still proxies to :3015); see `docs/nginx-spa-fallback.snippet.conf` for static `try_files`

## Acceptance smoke
- `/standards/SZNS-060` refresh → 200 + detail
- Ask from any route → `/goals/:slug` or `/guide?q=…` (not inline on Home)
- `/goals` filter + search; `/goals/export-honey-eu` shows curated steps
- Installable after `npm run build` (SW registered in prod)

## Stubs left
- Core `GET /api/goals` catalogue + cached guide payloads (local catalogue until then)
- Core routes for `/training/*`, `/complaints`, `/account/*`, `/tbt/alerts`, `/standards/:id` (OpenAPI + Core)
- Production static deploy with `try_files` instead of Vite proxy
- Richer PWA icons (current placeholders are solid brand colour)
