# Atlas Engine — host Python / runtime note

## Current Frappe v16 (this host)

Upstream `frappe` **version-16** tip declares `requires-python = ">=3.14,<3.15"`.
Use system Python:

```bash
/usr/bin/python3.14
```

Also required: **Node ≥ 24** (installed via NodeSource) and `yarn`.

## OS user

`bench` **refuses root**. Bootstrap re-execs as OS user `frappe`:

```bash
# as root:
./bootstrap.sh
# or:
sudo -u frappe -H bash -lc 'cd /srv/projects/eswasaone/engine && ./bootstrap.sh'
```

## Start / stop

```bash
sudo -u frappe -H bash -lc 'cd /srv/projects/eswasaone/engine/frappe-bench && bench start'
# Desk / REST: http://127.0.0.1:8020   Socket.io: :9020
# Admin: FRAPPE_ADMIN_USER / FRAPPE_ADMIN_PASSWORD from ../.env
```

## MariaDB root for `bench new-site`

Shared app user cannot GRANT. WS1 stores a TCP root password in
`engine/.mariadb_root_pass` (mode 600, gitignored locally — do not commit).
Bootstrap uses it for `--force` site create.

| Item | Value |
|---|---|
| OS user | `frappe` |
| Bench Python | `/usr/bin/python3.14` |
| bench CLI | `/home/frappe/.local/bin/bench` |
| Bench dir | `engine/frappe-bench/` |
| Site | `eswasaone.localhost` |
| HTTP / Socketio | `8020` / `9020` |

Secrets: `/srv/projects/eswasaone/.env` (`MYSQL_*`, `REDIS_URL`, `FRAPPE_*`).
