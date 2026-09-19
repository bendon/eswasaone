#!/usr/bin/env bash
# Native Frappe/ERPNext bootstrap for EswasaOne (NO Docker).
# Prerequisites: MariaDB, Redis, Python 3.11+ preferred, Node, yarn/npm.
# Owns: engine/ only. Custom apps under ../apps are linked into the bench.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

BENCH_DIR="${BENCH_DIR:-$ENGINE/frappe-bench}"
SITE="${FRAPPE_SITE:-eswasaone.localhost}"
DB_NAME="${MYSQL_DATABASE:-eswasaone}"
DB_USER="${MYSQL_USER:-eswasaone}"
DB_PASS="${MYSQL_PASSWORD:-change-me}"
HTTP_PORT="${FRAPPE_HTTP_PORT:-8020}"
SOCKETIO_PORT="${FRAPPE_SOCKETIO_PORT:-9020}"
REDIS_CACHE="${REDIS_URL:-redis://127.0.0.1:6379/15}"

echo "==> EswasaOne engine bootstrap"
echo "    bench: $BENCH_DIR"
echo "    site:  $SITE"
echo "    http:  127.0.0.1:$HTTP_PORT"

if ! command -v bench >/dev/null 2>&1; then
  echo "ERROR: 'bench' CLI not found. Install frappe-bench first."
  echo "  pipx install frappe-bench   # or pip install frappe-bench"
  exit 1
fi

if [[ ! -d "$BENCH_DIR" ]]; then
  echo "==> Creating bench (Frappe v16)"
  bench init --frappe-branch version-16 "$BENCH_DIR"
fi

cd "$BENCH_DIR"

if [[ ! -d "sites/$SITE" ]]; then
  echo "==> Creating site $SITE (DB $DB_NAME)"
  bench new-site "$SITE" \
    --db-name "$DB_NAME" \
    --db-user "$DB_USER" \
    --mariadb-root-username root \
    --admin-password "${FRAPPE_ADMIN_PASSWORD:-admin}" \
    --no-mariadb-socket || true
fi

bench use "$SITE"

# Install / update apps listed in apps.txt (skip frappe — already present)
while read -r app; do
  [[ -z "$app" || "$app" =~ ^# ]] && continue
  [[ "$app" == "frappe" ]] && continue
  if [[ -d "apps/$app" ]]; then
    echo "==> App present: $app"
    continue
  fi
  case "$app" in
    erpnext)
      bench get-app erpnext --branch version-16
      bench --site "$SITE" install-app erpnext
      ;;
    hrms|crm|lms|helpdesk|insights|payments)
      bench get-app "$app"
      bench --site "$SITE" install-app "$app" || true
      ;;
    eswasa_*)
      SRC="$ROOT/apps/$app"
      if [[ -d "$SRC" ]]; then
        echo "==> Linking custom app $app from $SRC"
        ln -sfn "$SRC" "apps/$app"
        bench --site "$SITE" install-app "$app" || true
      else
        echo "WARN: $SRC missing — WS2/WS3/WS8 will create it"
      fi
      ;;
    *)
      echo "WARN: unknown app $app — skip"
      ;;
  esac
done < "$ENGINE/apps.txt"

# Load fixtures when present
if [[ -d "$ENGINE/fixtures" ]] && compgen -G "$ENGINE/fixtures/*" >/dev/null 2>&1; then
  echo "==> Fixtures present under engine/fixtures (import via WS1)"
fi

echo "==> Configure ports in sites/$SITE/site_config.json / Procfile manually if needed:"
echo "    web: $HTTP_PORT  socketio: $SOCKETIO_PORT  redis: $REDIS_CACHE"
echo "==> Start: cd $BENCH_DIR && bench start   # or supervisor"
echo "DONE: engine bootstrap script finished (WS1 completes install + fixtures)."
