# HANDOFF — Frappe Desk (system admin) vs Institution Portal (ops)

**Owner:** EngineOps (A8) · **Site:** `eswasaone.localhost` · **HTTP:** `127.0.0.1:8020`

## Two admin surfaces

| Surface | Who | URL | Purpose |
|---|---|---|---|
| **Frappe Desk** | System Administrators / ERPNext power users | `http://127.0.0.1:8020` (Desk after login) | Users/roles, Company & accounting masters, workflows, print formats, Email Domain/Account, companion apps (HRMS, CRM, LMS, Payments), custom DocTypes, System Settings, migrations |
| **Institution Portal** | Day-to-day institutional ops staff | `http://127.0.0.1:3016` (or public `/institution/` via nginx) | Operational work against Core BFF (`:8015`) — certification queues, standards/estore ops UX. **Not** a substitute for Desk system config |

Administrators who need to change **system** configuration (roles, company, tax, email, app install) use **Desk**. Staff who process applications and catalogue work use the **Institution Portal**.

## Local Desk access (preferred)

Desk must stay on loopback unless Orchestrator explicitly merges an auth-gated `/desk` proxy.

```bash
# Start bench (OS user frappe — never root)
sudo -u frappe -H bash -lc \
  'cd /srv/projects/eswasaone/engine/frappe-bench && bench start'

# Browser / curl from the host
open http://127.0.0.1:8020/login
# After login: Desk at /app (Frappe v16)
```

| Item | Value |
|---|---|
| Bind | Prefer `127.0.0.1:8020` (Procfile `bench serve --port 8020`) |
| Socket.io | `:9020` |
| Site | `eswasaone.localhost` |
| Admin credentials | `FRAPPE_ADMIN_USER` / `FRAPPE_ADMIN_PASSWORD` in repo-root `.env` (**never echo secrets**) |
| Python / user | See `engine/PYTHON.md` |

SSH tunnel from a workstation (example):

```bash
ssh -L 8020:127.0.0.1:8020 user@eswasaone-host
# then browse http://127.0.0.1:8020/login
```

## Security

- **Do not expose Desk publicly without authentication and an explicit ops decision.** A draft nginx `/desk` snippet may exist under `docs/nginx/` — **Orchestrator merges**; comments warn admin-only.
- Agent and portal actions inherit the authenticated user's Frappe permissions; Desk System Manager bypasses are for humans only.
- Writes that affect finance / identity should be confirm-before-commit and audit-logged (platform rule).

## Companion apps (A8 snapshot)

Listed in `engine/apps.txt`. Installed on site when listed **and** `bench list-apps` shows them.

| App | Status |
|---|---|
| hrms | installed (version-16) |
| crm | installed (develop) |
| lms | installed (version-16; needs `payments`) |
| payments | installed (version-16) |
| helpdesk | **WARN** — not installed; develop build failed on Frappe v16 |
| insights | **WARN** — not installed; develop build failed on Frappe v16 |

Re-try later:

```bash
sudo -u frappe -H bash -lc \
  'cd /srv/projects/eswasaone/engine/frappe-bench && \
   bench get-app helpdesk --branch develop && \
   bench --site eswasaone.localhost install-app helpdesk'
# same pattern for insights
```

## Fixtures

Idempotent load:

```bash
sudo -u frappe -H bash -lc \
  'cd /srv/projects/eswasaone/engine/frappe-bench && \
   ./env/bin/python ../fixtures/load_fixtures.py --site eswasaone.localhost'
```

Covers: SZL currency, Eswasa Company, roles, VAT note, **Email Domain note**, cost centres, print formats.

### Outbound SMTP (Email Account)

Core OTP / confirmation and Frappe welcome emails share repo-root `SMTP_*`:

```bash
# In /srv/projects/eswasaone/.env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=…
SMTP_PASSWORD=…
SMTP_FROM=noreply@eswasa.org.sz
SMTP_USE_TLS=true
```

Then:

```bash
sudo -u frappe -H bash -lc \
  'cd /srv/projects/eswasaone/engine/frappe-bench && \
   ./env/bin/python ../fixtures/configure_smtp.py --site eswasaone.localhost'
```

Restart Core after changing `.env`. Desk: **User → New → Send Welcome Email** for admin-issued accounts; Institution HR → **Invite staff** calls `POST /api/auth/invite-staff`.

### Email branding (remove Frappe / ERPNext chrome)

The **Email Template** body is customisable (`EswasaOne Welcome`). Welcome mails still wrap in Frappe’s `standard.html` container, which reads:

| Setting | Effect |
|---|---|
| **Website Settings → App Name** | Masthead text (was `Frappe`) |
| **System Settings → Disable Standard Email Footer** | Hides ERPNext `Sent via` hook |
| **System Settings → Email Footer Address** | Optional org line instead |

Apply via:

```bash
sudo -u frappe -H bash -lc \
  'cd /srv/projects/eswasaone/engine/frappe-bench && \
   ./env/bin/python ../fixtures/configure_email_branding.py --site eswasaone.localhost'
```

### Login OTP + idle lock

- Every full login: password then OTP (6h trust window).
- Idle 30 minutes: soft lock — unlock with password only.
- After 6h: full password + OTP again.

## Related

- `engine/README.md` — bench atlas
- `engine/PYTHON.md` — Python 3.14 / OS user
- `docs/PORTS.md` — port block 15 (`8020` / `9020`)
- `docs/nginx/desk-8020.DRAFT.conf` — draft `/desk` proxy (Orchestrator merge only)

## Ops note (A8)

If Redis reports `max number of clients reached`, Desk/queue work stalls. Shared `redis-server` on `127.0.0.1:6379` may need a controlled restart (`systemctl restart redis-server`), then `bench start` as user `frappe`. Investigate client leaks before raising `maxclients`.
