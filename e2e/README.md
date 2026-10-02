# EswasaOne Playwright e2e

Staging base: `ESWASAONE_BASE_URL` (default `https://eswasaone.aiceafrica.com`).

```bash
cd e2e
npm install
npx playwright install chromium
npm run test:wave0
```

Wave 1 adds per-WS specs under `tests/w1-*.spec.ts` that assert Core + Frappe side-effects.
