# Locked decisions — Guided Flow & Auth (WS10 / WS11)

Do not improvise mid-flight.

## Full user journey (scope)

Anonymous browse/guide → transactional action → progressive auth (signup/login) → resume buy / apply / book / enrol.

| Stage | Who | API |
|---|---|---|
| Goal + guide | Guest (service account) | `POST /api/guide` (live compose) or **cached** goal payload for `/goals/:slug` |
| Applicability (internal) | Guest | Guide **calls** applicability; does not reimplement graph |
| Buy / apply / book | Auth required | estore checkout, cert create, etc. after session |
| Signup / login | Modal | `POST /api/auth/register` \| `login` \| `otp` |

## Auth migration (WS11)

1. Cookie sessions **alongside** existing Bearer (both valid).
2. Migrate **both** portals via **one shared session client** in `portals/shared-ui` (`credentials: include`). WS11 **owns** that module; WS10 **import-only**.
3. Remove Bearer only after both SPAs migrated.

## Guide vs applicability (WS10)

**Applicability** = which standards/requirements apply (raw graph).  
**Guide** = applicability + ordered steps + RAG + tool-registry actions + rights-gated citations.  
GuideCraft calls applicability internally and composes on top.

## Routing (Goals library)

- Catalogued goals: `/goals/:slug` — prefer **cached** curated payloads so Popular / library cards match the guide UI.
- Free-text Ask with no slug match: `/guide?q=…` — may call live `POST /api/guide`.
- **Home never renders the guide inline.** Legacy `/?goal=` redirects to `/goals/:slug` or `/guide?q=`.

## React port

Escape / text-bind `title`, `detail`, `label` — no HTML injection from graph/RAG strings. Prototype `insertAdjacentHTML` is mock-only.

## Service Portal chrome (see also DECISIONS_SERVICE_NAV.md)

Fidelity for Service shell: `docs/mocks/eswasaone-customer-portal.html` (top nav + bottom tabs). Do not port the old 248px rail.
