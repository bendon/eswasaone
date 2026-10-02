#!/usr/bin/env bash
# Native Frappe/ERPNext bootstrap for EswasaOne (NO Docker).
# Prerequisites: MariaDB, Redis, uv-managed Python 3.12, Node, yarn.
# Owns: engine/ only. Custom apps under ../apps are linked into the bench.
# See PYTHON.md for host Python notes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="$(cd "$(dirname "$0")" && pwd)"

# bench CLI refuses to run as root — re-exec as frappe before loading secrets
FRAPPE_OS_USER="${FRAPPE_OS_USER:-frappe}"
if [[ "$(id -u)" -eq 0 ]]; then
  if ! id "$FRAPPE_OS_USER" >/dev/null 2>&1; then
    echo "ERROR: OS user '$FRAPPE_OS_USER' missing (bench cannot run as root)."
    exit 1
  fi
  echo "==> Re-exec as $FRAPPE_OS_USER (bench forbids root)"
  chown -R "$FRAPPE_OS_USER:$FRAPPE_OS_USER" "$ENGINE" 2>/dev/null || true
  # Ensure .env is group-readable by frappe
  if [[ -f "$ROOT/.env" ]]; then
    chgrp "$FRAPPE_OS_USER" "$ROOT/.env" 2>/dev/null || true
    chmod 640 "$ROOT/.env" 2>/dev/null || true
  fi
  exec sudo -u "$FRAPPE_OS_USER" -H \
    env PATH="/home/${FRAPPE_OS_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin" \
    HOME="/home/${FRAPPE_OS_USER}" \
    bash "$ENGINE/bootstrap.sh" "$@"
fi

# shellcheck disable=SC1091
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

export PATH="${HOME}/.local/bin:${PATH}"

BENCH_DIR="${BENCH_DIR:-$ENGINE/frappe-bench}"
SITE="${FRAPPE_SITE:-eswasaone.localhost}"
DB_HOST="${MYSQL_HOST:-127.0.0.1}"
DB_PORT="${MYSQL_PORT:-3306}"
DB_NAME="${MYSQL_DATABASE:-eswasaone}"
DB_USER="${MYSQL_USER:-eswasaone}"
DB_PASS="${MYSQL_PASSWORD:-change-me}"
HTTP_PORT="${FRAPPE_HTTP_PORT:-8020}"
SOCKETIO_PORT="${FRAPPE_SOCKETIO_PORT:-9020}"
ADMIN_PASS="${FRAPPE_ADMIN_PASSWORD:-admin}"

# Frappe version-16 tip requires Python>=3.14,<3.15 (see PYTHON.md)
PYTHON="${FRAPPE_PYTHON:-/usr/bin/python3.14}"
if [[ ! -x "$PYTHON" ]]; then
  echo "ERROR: Python 3.14 not found at $PYTHON. See $ENGINE/PYTHON.md"
  exit 1
fi

echo "==> EswasaOne engine bootstrap"
echo "    user:   $(id -un)"
echo "    python: $PYTHON ($("$PYTHON" --version 2>&1))"
echo "    bench:  $BENCH_DIR"
echo "    site:   $SITE"
echo "    http:   127.0.0.1:$HTTP_PORT"

if ! command -v bench >/dev/null 2>&1; then
  echo "==> Installing frappe-bench via uv tool"
  uv tool install frappe-bench --python "$PYTHON"
fi

if [[ ! -d "$BENCH_DIR" ]]; then
  echo "==> Creating bench (Frappe v16)"
  bench init \
    --python "$PYTHON" \
    --frappe-branch version-16 \
    --skip-redis-config-generation \
    "$BENCH_DIR"
fi

cd "$BENCH_DIR"

write_common_config() {
  python3 - <<'PY'
import json, os
from pathlib import Path
cfg_path = Path("sites/common_site_config.json")
cfg = json.loads(cfg_path.read_text()) if cfg_path.exists() else {}
redis_url = os.environ["REDIS_URL"] if "REDIS_URL" in os.environ else "redis://127.0.0.1:6379/15"
http = int(os.environ.get("FRAPPE_HTTP_PORT", "8020"))
sock = int(os.environ.get("FRAPPE_SOCKETIO_PORT", "9020"))
cfg["redis_cache"] = redis_url
cfg["redis_queue"] = redis_url
cfg["redis_socketio"] = redis_url
cfg["webserver_port"] = http
cfg["socketio_port"] = sock
cfg_path.parent.mkdir(parents=True, exist_ok=True)
cfg_path.write_text(json.dumps(cfg, indent=1) + "\n")
print("==> Wrote sites/common_site_config.json (redis + ports)")
PY
}

write_common_config

# Procfile: bind web to allocated HTTP port on localhost
if [[ -f Procfile ]]; then
  python3 - <<'PY'
from pathlib import Path
import os, re
http = os.environ.get("FRAPPE_HTTP_PORT", "8020")
sock = os.environ.get("FRAPPE_SOCKETIO_PORT", "9020")
out = []
for line in Path("Procfile").read_text().splitlines():
    if line.startswith("web:"):
        out.append(f"web: bench serve --port {http}")
    elif line.startswith("socketio:") and "--port" in line:
        out.append(re.sub(r"--port\s+\d+", f"--port {sock}", line))
    else:
        out.append(line)
Path("Procfile").write_text("\n".join(out) + "\n")
print(f"==> Procfile web port → {http}")
PY
fi

if [[ ! -d "sites/$SITE" ]] || ! mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
    -N -e "SHOW TABLES LIKE 'tabDefaultValue';" 2>/dev/null | grep -q tabDefaultValue; then
  echo "==> Creating site $SITE (DB $DB_NAME @ $DB_HOST)"
  # Prefer real MariaDB root for GRANT/DROP (file written by WS1 host setup).
  # Fallback: app user (works only if GRANT OPTION already present).
  ROOT_USER=root
  ROOT_PASS=""
  if [[ -f "$ENGINE/.mariadb_root_pass" ]]; then
    ROOT_PASS="$(cat "$ENGINE/.mariadb_root_pass")"
  fi
  if [[ -z "$ROOT_PASS" ]]; then
    ROOT_USER="$DB_USER"
    ROOT_PASS="$DB_PASS"
  fi
  # Remove empty/broken site dir so new-site recreates it
  rm -rf "sites/$SITE"
  bench new-site "$SITE" \
    --db-name "$DB_NAME" \
    --db-user "$DB_USER" \
    --db-password "$DB_PASS" \
    --db-host "$DB_HOST" \
    --db-port "$DB_PORT" \
    --mariadb-root-username "$ROOT_USER" \
    --mariadb-root-password "$ROOT_PASS" \
    --mariadb-user-host-login-scope="%" \
    --admin-password "$ADMIN_PASS" \
    --force \
    --set-default
fi

bench use "$SITE"

python3 - <<PY
import json, os
from pathlib import Path
site = os.environ.get("FRAPPE_SITE", "eswasaone.localhost")
p = Path(f"sites/{site}/site_config.json")
cfg = json.loads(p.read_text()) if p.exists() else {}
redis_url = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/15")
cfg["redis_cache"] = redis_url
cfg["redis_queue"] = redis_url
cfg["redis_socketio"] = redis_url
cfg["host_name"] = f"http://127.0.0.1:{os.environ.get('FRAPPE_HTTP_PORT', '8020')}"
p.write_text(json.dumps(cfg, indent=1) + "\n")
print(f"==> Updated sites/{site}/site_config.json")
PY

install_app_if_needed() {
  local app="$1"
  if bench --site "$SITE" list-apps 2>/dev/null | awk '{print $1}' | grep -qx "$app"; then
    echo "==> Already installed on site: $app"
    return 0
  fi
  echo "==> Installing app on site: $app"
  bench --site "$SITE" install-app "$app"
}

while read -r app; do
  [[ -z "$app" || "$app" =~ ^# ]] && continue
  [[ "$app" == "frappe" ]] && continue
  case "$app" in
    erpnext)
      if [[ ! -d "apps/erpnext" ]]; then
        echo "==> get-app erpnext version-16"
        bench get-app erpnext --branch version-16
      else
        echo "==> App present: erpnext"
      fi
      install_app_if_needed erpnext || true
      ;;
    hrms|crm|lms|helpdesk|insights|payments)
      if [[ ! -d "apps/$app" ]]; then
        echo "==> get-app $app (prefer version-16)"
        bench get-app "$app" --branch version-16 \
          || bench get-app "$app" \
          || { echo "WARN: get-app $app failed"; continue; }
      else
        echo "==> App present: $app"
      fi
      install_app_if_needed "$app" || echo "WARN: install-app $app failed (continuing)"
      ;;
    eswasa_*)
      SRC="$ROOT/apps/$app"
      if [[ -d "$SRC" ]]; then
        echo "==> Linking custom app $app ← $SRC"
        ln -sfn "$SRC" "apps/$app"
        # Ensure apps.txt has a trailing newline before append
        [[ -f sites/apps.txt ]] && [[ -n "$(tail -c1 sites/apps.txt)" ]] && echo >> sites/apps.txt
        if ! grep -qx "$app" sites/apps.txt 2>/dev/null; then
          echo "$app" >> sites/apps.txt
        fi
        if [[ -f "$SRC/$app/hooks.py" ]]; then
          ./env/bin/uv pip install -e "apps/$app" --python ./env/bin/python >/dev/null 2>&1 \
            || ./env/bin/pip install -e "apps/$app" -q || true
          install_app_if_needed "$app" || echo "WARN: install-app $app failed"
        else
          echo "WARN: $app has no hooks.py yet — linked only (WS2/WS3/WS8)"
        fi
      else
        echo "WARN: $SRC missing — WS2/WS3/WS8 will create it"
      fi
      ;;
    *)
      echo "WARN: unknown app $app — skip"
      ;;
  esac
done < "$ENGINE/apps.txt"

if [[ -f "$ENGINE/fixtures/load_fixtures.py" ]]; then
  echo "==> Loading fixtures"
  ./env/bin/python "$ENGINE/fixtures/load_fixtures.py" --bench "$BENCH_DIR" --site "$SITE"
fi

echo "==> Ports: web 127.0.0.1:$HTTP_PORT  socketio $SOCKETIO_PORT"
echo "==> Start: cd $BENCH_DIR && bench start"
echo "DONE: engine bootstrap finished."
