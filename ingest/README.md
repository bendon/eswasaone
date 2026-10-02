# Ingest worker (A9 / WS8)

Connectors → processing → enrich → storage → curation gate.

## Status

| Check | Expect |
|---|---|
| Health | `127.0.0.1:8016` — `GET /health` → `status: ok` when Qdrant reachable |
| ePing/TBT | End-to-end (`connectors/eping_tbt.py` → object store → Frappe metadata → Qdrant) |
| eurlex / regulator_rss / web_crawl | Stubs (`--connector` returns exit 2) |
| Collection | `{QDRANT_COLLECTION_PREFIX}tbt_notifications` → `eswasaone_tbt_notifications` |
| Object store | `INGEST_OBJECT_STORE_PATH` (default `/var/lib/eswasaone/ingest`) |

## Setup (venv)

```bash
cd /srv/projects/eswasaone/ingest
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
```

## Health server (start / stop / status)

No systemd unit — run under the venv, bound to loopback only.

```bash
cd /srv/projects/eswasaone/ingest
. .venv/bin/activate

# start (background)
nohup python -m health > /tmp/eswasaone-ingest-health.log 2>&1 &
# or: eswasa-ingest-health &

# status
curl -sS http://127.0.0.1:8016/health
ss -tlnp | grep 8016

# stop
fuser -k 8016/tcp
# or: pkill -f 'python -m health'
```

`GET /health` returns JSON with `status` (`ok` / `degraded`), Qdrant collections, object-store path, and target collection name.

## ePing / TBT pipeline

Respects robots (when present), `EPING_RATE_LIMIT_SECONDS` (default 1s), content-hash dedup, and rights (`licensed` → no full text in public Qdrant corpus). WTO ePing notices are `open`.

```bash
cd /srv/projects/eswasaone/ingest
. .venv/bin/activate
python pipeline.py --connector eping_tbt --max-pages 1 --page-size 5
# or: eswasa-ingest --connector eping_tbt --max-pages 1 --page-size 5
```

Writes:

| Sink | Path / target |
|---|---|
| Raw | `INGEST_OBJECT_STORE_PATH` (`/var/lib/eswasaone/ingest`) |
| Metadata | Frappe `eswasa_ingest` DocTypes via httpx (stubbed if Frappe down) |
| Chunks | Qdrant `eswasaone_tbt_notifications` |

## Tests

```bash
pytest -q                    # unit + any unselected markers that run by default
pytest -q -m "not integration"
pytest -q -m integration     # live ePing + Qdrant
```

## Qdrant point count

```bash
curl -sS http://127.0.0.1:6333/collections/eswasaone_tbt_notifications \
  | python3 -c 'import sys,json; r=json.load(sys.stdin)["result"]; print(r["points_count"], r["status"])'
```
