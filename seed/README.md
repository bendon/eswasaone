# A10 DemoSeed (`seed/`)

Demo-coherent Frappe population for EswasaOne portal mocks (institutional KPIs, feed anchors, finance months).

**Owns:** this directory only. Does **not** edit `apps/eswasa_certification/seed.py` (CertOps already made it absorbable).

## Epoch (locked)

| Period | Behaviour |
|--------|-----------|
| Era A 2001–2006 | Thin narrative only (Act assent) — **no** cert/metrology volumes |
| **2007-04-02** | `OPERATIONAL_EPOCH` — DocType volumes start here |
| Staff ~110 | Synthetic demo scale (Board Pack note, not full Employee flood) |

## Mock KPI anchors

Exact names (where DocTypes allow):

| Anchor | Role |
|--------|------|
| `CERT-2025-0041` | Certificate + Audit Scheduled application narrative |
| `CERT-2025-0029` | Active certificate |
| `SZNS 1043:2024` | Published standard (abstract only) |
| `SZNS 987:2023` / `STD-2025-0009` | Standard + e-store entitlement |
| `TRAIN-2025-0118` | LMS enrollment (or ToDo marker fallback) |
| `INV-2025-0394` | Overdue invoice narrative (ToDo; GL `# TODO: wire real`) |
| `G/TBT/N/EU/891` | TBT notification (absorbs `eswasa_tbt` seed by symbol) |
| `AUD-2026-00001` | Preferred overdue-audit smoke id (shared with CertOps) |

Dashboard targets: **148** certified, **2,840** enrolments, **3.63M** revenue (−8%), **23** pending (**7** SLA), **7** approvals, **312** standards, TBT badge **4**.

Finance months Apr–Sep (SZL thousands): Budget `[520,570,585,640,660,680]` · Actual `[470,600,540,720,665,575]` — written to `seed/data/kpi_targets.json`.

## Coexistence with CertOps demo seed

`apps/eswasa_certification/.../seed.py` uses **APP-** applications and prefers `AUD-2026-00001`. It **never** creates `CERT-2025-0041`.

When A10 owns demo volumes, disable CertOps auto-seed:

```bash
# env (bench / systemd)
export ESWASA_CERT_DEMO_SEED=0

# or site_config.json
# "eswasa_certification_demo_seed": 0
```

A10 will create/refresh `AUD-2026-00001` if missing; CertOps will not overwrite an unmarked row.

## Requirements

```bash
# from repo root — stdlib + requests (usually present on host)
pip install -r seed/requirements.txt
# or: python3 -m pip install --user requests
```

Reads `/srv/projects/eswasaone/.env` for `FRAPPE_URL`, `FRAPPE_SITE`, `FRAPPE_ADMIN_USER`, `FRAPPE_ADMIN_PASSWORD` (**never printed**).

## Run (host or user `frappe`)

Frappe must be up (`http://127.0.0.1:8020`). Bench refuses root — use OS user `frappe` for `bench` commands; the seed CLI itself may run as any user that can reach REST + read `.env`.

```bash
cd /srv/projects/eswasaone

# CI smoke — anchors + thin pending only
python3 -m seed.run --years 1 --anchors-only -v

# Default: 2-year window (2024–2025), scaled volumes
python3 -m seed.run --years 2

# Exact cert/standards/pending counts (enrolments still sampled)
python3 -m seed.run --years 2 --full-kpis

# Plan only (no writes)
python3 -m seed.run --dry-run

# DESTRUCTIVE: delete A10-marked docs, then re-seed
python3 -m seed.run --wipe --years 1 --anchors-only
```

### Via `bench execute` (optional)

For in-process Frappe (as user `frappe`):

```bash
sudo -u frappe -H bash -lc '
  cd /srv/projects/eswasaone/engine/frappe-bench &&
  bench --site eswasaone.localhost execute seed.run.run \
    --kwargs "{\"years\": 1, \"anchors_only\": true}"
'
```

Prefer REST (`python -m seed.run`) from the monorepo root so `seed/` need not live on `PYTHONPATH` inside the bench env. To use bench execute, add the repo root to `PYTHONPATH`:

```bash
export PYTHONPATH=/srv/projects/eswasaone:$PYTHONPATH
```

## Flags

| Flag | Meaning |
|------|---------|
| `--years N` | Volume year window ending 2025 (clamped to ≥ 2007) |
| `--anchors-only` | Anchors + KPI notes + tiny pending sample |
| `--full-kpis` | Push toward 148 / 312 / 23 counts |
| `--wipe` | **Destructive** — only docs containing `A10_DEMOSEED` |
| `--dry-run` | Print plan; no login/writes |
| `-v` | Debug logs |

If the site is unreachable, the CLI prints the plan and exits non-zero (`blocked_on=Frappe…`) without writing secrets.

## Layout

```
seed/
  README.md
  requirements.txt
  config.py          # OPERATIONAL_EPOCH=2007, KPI_TARGETS, ANCHORS
  client.py          # Frappe REST (Administrator)
  masters.py
  finance.py         # kpi_targets.json + INV narrative
  anchors.py         # exact names after / instead of bulk
  run.py             # CLI
  modules/           # cert, standards, metrology, tbt, governance, training
  data/kpi_targets.json
```

## Licence-aware content

Seed payloads store **titles/abstracts/paraphrase only**. No licensed full standard text. E-store rows set `rights=licensed` and point buyers to purchase.

## Stubs left

- Full ERPNext GL / Sales Invoice `INV-2025-0394` → `# TODO: wire real`
- Bulk **2,840** LMS enrolments → sampled + KPI note
- HR Employee ×110 → Board Pack scale note only
