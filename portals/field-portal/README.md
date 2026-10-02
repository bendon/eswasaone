# EswasaOne Field Portal

Installable PWA shell for employees (`/field/` → port **3017**).

## Run

```bash
cd portals/field-portal
npm install
npm run dev
```

Dev server: `http://127.0.0.1:3017/field/`

## Scripts

| Script    | Description                          |
|-----------|--------------------------------------|
| `dev`     | Vite on `127.0.0.1:3017`             |
| `build`   | Typecheck + production build         |
| `preview` | Preview production build on 3017     |
| `test`    | Vitest (jsdom)                       |

## Auth

Staff session via `@eswasaone/shared-ui` (`me` / AuthModal). Guests must sign in.
Non-staff accounts see a message to use the Service Portal. After login, the app
**stays on `/field`** (does not redirect to Institution).

## On-device cache (PWA)

Production builds register a service worker (`virtual:pwa-register`, prompt — no silent reload):

- **Shell + assets** precached; fonts/scripts/images runtime-cached
- **Safe API GETs** (`/api/hr/*`, `/api/certification/audits*`, `/api/auth/me`) use **NetworkFirst** (4s timeout → Cache)
- **App snapshots** in `localStorage` (`eswasaone.field.snap.v1:*`) for Home / Me / Audits list — last-known-good on remount or offline
- Sign-out clears snapshots
- Optional SW in dev: `VITE_PWA_DEV=true npm run dev`

Writes (leave request, claims, audit submit) are **not** cached in Workbox.

## Screen stubs

Thin placeholders for other agents:

- `src/screens/HomeScreen.tsx`
- `src/screens/audits/AuditsScreen.tsx`
- `src/screens/me/MeScreen.tsx` (`?tab=leave|pay|claims|profile`)
- `src/screens/MoreScreen.tsx`
