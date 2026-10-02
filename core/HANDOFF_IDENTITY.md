# HANDOFF — IdentityLock (A7)

Ops and integration notes for Core auth (`core/app/identity/`).

## Mock auth gate (production-ish demo)

When **Frappe is reachable**, failed `POST /api/auth/login` and `POST /api/auth/register` return real errors:

| Outcome | Status |
|---|---|
| Bad password / unknown user | **401** (`auth_required`, `reason=invalid_credentials`) |
| Email already registered | **409** (`detail=Account already exists`) |
| Invalid register payload | **422** |

**Mock Citizen sessions are allowed only when:**

1. `CORE_ALLOW_MOCK_AUTH=true` (or `1` / `yes` / `on`), **or**
2. Frappe is unreachable (connection refused / timeout).

Orchestrator owns `.env.example`. Identity reads:

```bash
# CORE_ALLOW_MOCK_AUTH=false   # set true only for offline / smoke demos
```

Smoke tests set this flag so AUD overdue paths keep working with demo credentials. Leave it **unset/false** on the demo host once Engine is up.

## Citizen registration

`POST /api/auth/register` → `FrappeClient.register_citizen`:

1. Admin login (`FRAPPE_ADMIN_USER` / `FRAPPE_ADMIN_PASSWORD`)
2. Create `User` with role **Citizen** (`engine/fixtures/roles.json`)
3. `add_role` best-effort; `generate_keys` for B3 acting-as-user
4. Login as the new user; return session (+ optional API key/secret)

Ensure the **Citizen** role exists on the site (sync fixtures / Desk → Role).

## Guest / anonymous API keys

Anonymous guide / catalogue / applicability use `get_actor()` → guest context.

| Env | Purpose |
|---|---|
| `FRAPPE_GUEST_USER` | Username (default `Guest` / recommend `eswasaone.guest`) |
| `FRAPPE_GUEST_API_KEY` | Frappe API key |
| `FRAPPE_GUEST_API_SECRET` | Frappe API secret |

**When keys are empty:** Core still builds a local Guest `AuthContext` (`mock=True`, `is_guest=True`) so public tools work offline. Frappe calls are **not** token-authenticated — set keys for production-ish demo.

### Create guest API keys in Desk

1. Desk → **User** → New (or open existing service account).
2. Email/username: e.g. `eswasaone.guest@localhost` (or match `FRAPPE_GUEST_USER`).
3. Roles: **Guest** only (read-appropriate permissions on public DocTypes / whitelisted methods). No Desk access needed for Citizen-style public reads; Guest role is enough if permissions allow.
4. Save user → open user form → **Settings** / menu → **Generate Keys** (or `User → generate_keys`).
5. Copy **API Key** and **API Secret** into `.env`:

```bash
FRAPPE_GUEST_USER=eswasaone.guest
FRAPPE_GUEST_API_KEY=…
FRAPPE_GUEST_API_SECRET=…
```

6. Restart Core (`CORE_PORT`, typically `8015`).
7. Smoke: unauthenticated `GET /api/standards` and guest-allowed agent tools; permissioned tools still return 401.

Optional Orchestrator fixture: a small script under `engine/fixtures/` can create this user — prefer Desk steps above if ownership conflicts with EngineOps (A8).

## OTP honesty

`POST /api/auth/otp` / login password step uses the messaging adapter.

- Login is **always** password → OTP. Password alone returns **202** `otp_required` (no session cookie).
- OTP code TTL ~10 minutes; **OTP trust window** after verify is **6 hours** (`otp_verified_until`).
- Idle **30 minutes** → soft lock; `POST /auth/unlock` with password only while trust window valid.
- If `SMTP_HOST` / `SMTP_FROM` empty → response `stubbed=true` and message clearly says **email not sent**; code is logged/printed by the adapter.
- Never treat stub responses as “OTP sent”.

## Admin invite

`POST /api/auth/invite-staff` (System Manager / Administrator / HR) creates a User with `send_welcome_email=1`. Requires SMTP configured (`503` otherwise). Desk User → Send Welcome Email is the same Email Account path (`engine/fixtures/configure_smtp.py`).

## Staff vs Citizen

A4 may import:

```python
from app.identity import require_staff, has_staff_role, STAFF_ROLES
```

- `require_staff` — Depends chain after `require_auth`; rejects Citizen-only / Guest with `reason=staff_required` (401).
- Staff markers include `System Manager`, `Desk User`, `Administrator`, and common Frappe module roles; any role outside `{Citizen, Guest, All}` also counts.

Citizen portal sessions should only have **Citizen** (no Desk User).

## Administrator smoke

Do **not** disable real Frappe login. Administrator + correct password still establishes a non-mock session when Engine is up (AUD overdue / Desk path).

## Tests

```bash
cd /srv/projects/eswasaone/core
pytest tests/test_identity_auth.py tests/test_smoke.py -q
```

## Report line

`A7: mock gate + require_staff + guest/OTP docs | Orchestrator to set CORE_ALLOW_MOCK_AUTH + guest keys in .env | OTP still in-memory store`
