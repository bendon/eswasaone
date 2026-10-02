# Locked — Service Portal IA & nav (do not improvise)

Fidelity reference: **`docs/mocks/eswasaone-customer-portal.html`** (shell) + **`docs/mocks/eswasaone-goals.html`** (library) + **`docs/mocks/eswasaone-goal-guide.html`** (guide page).

## Shell

| Surface | Pattern |
|---|---|
| Service (citizen) | Light **top horizontal** nav; full-width content |
| Institution (staff) | Dark **left rail** — unchanged |

## Desktop top bar

Left: EswasaOne logo · Nav: Home · **Goals** · Standards · Certification · Training · Export · Complaints · Right: auth control.

## Mobile

- Slim top: logo + auth
- **Bottom tabs:** Home · **Goals** · Standards · Export · More
- More sheet: Certification · Training · Complaints · Applicability · Account
- **No hamburger**

## Three surfaces — no overlap

| Route | Job |
|---|---|
| `/` Home | Ask + a few featured goals + services. **Never renders steps.** |
| `/goals` | Full Goals library (search + category filter). Browse-first. |
| `/goals/:slug` | Guide page — steps are the whole content. Related goals strip at bottom only. |
| `/guide?q=…` | Same guide layout for free-text that does not match a cached goal. |

**Rule:** Everything that selects a goal (featured chip, library card, Ask resolving to a known goal) **navigates** to `/goals/:slug`. Home must not stack the guide inline.

Goals are **generated + cached** guides promoted from the requirements graph (popular product×market combos). Ask handles the long tail and can promote a new guide into a goal.

## Auth control

- Top-right (desktop) / top bar (mobile) only
- Guest: Sign in · Authed: avatar + name + Sign out
- Drive from `GET /api/auth/me`
- Remove any sidebar footer Sign in / Collapse

## Agent brief (Service Portal shell)

```
Own portals/service-portal nav + Home + Goals routes.
Port chrome from docs/mocks/eswasaone-customer-portal.html (TOP NAV + bottom tabs).
Goals library SoT: docs/mocks/eswasaone-goals.html
Guide page SoT: docs/mocks/eswasaone-goal-guide.html
Home NEVER stacks steps — selection routes to /goals/:slug (or /guide?q=).
Institution portal left rail is out of scope.
```
