#!/usr/bin/env bash
#
# git-watcher.sh — Polls GitHub for changes on tracked branches and auto-pulls.
# Also restarts the Core API server when Python files change.
# Logs to /tmp/git-watcher.log. Designed to run as a systemd service.
#
set -euo pipefail

REPO="/srv/projects/eswasaone"
CERTS_REPO="/srv/projects/eswasaone-certifications"
LOG="/tmp/git-watcher.log"
INTERVAL="${1:-120}"  # default 2 minutes
BRANCHES=("main" "hr-people" "certifications" "fe-dev")

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"
}

# Restart the Core API uvicorn server (port 8015) if it's running.
restart_core() {
  local old_pid
  old_pid=$(pgrep -f "uvicorn app.main:app.*8015" 2>/dev/null || echo "")
  if [ -n "$old_pid" ]; then
    log "  ↻ Restarting Core API server (PID $old_pid)…"
    kill "$old_pid" 2>/dev/null || true
    sleep 2
  fi
  # Start fresh
  cd "$REPO/core"
  .venv/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8015 >> /tmp/core-server.log 2>&1 &
  local new_pid=$!
  log "  ✓ Core API restarted (PID $new_pid)"
  cd "$REPO"
}

# Check if a pull brought changes to core/ or portals/ that need a server action.
# Vite HMR auto-reloads portal code; Core needs a manual restart for Python changes.
check_and_restart() {
  local changed_files
  changed_files=$(git diff --name-only HEAD@{1} HEAD 2>/dev/null || echo "")
  if echo "$changed_files" | grep -qE "^core/app/.*\.py$"; then
    log "  ⚡ Python files changed — restarting Core API"
    restart_core
  fi
}

log "=== Git watcher started (interval=${INTERVAL}s) ==="
log "Tracking branches: ${BRANCHES[*]}"

while true; do
  # --- Primary worktree ---
  cd "$REPO"
  if git fetch origin --quiet 2>>"$LOG"; then
    current_branch=$(git branch --show-current)
    for branch in "${BRANCHES[@]}"; do
      remote_ref="origin/$branch"
      local_sha=$(git rev-parse "$branch" 2>/dev/null || echo "")
      remote_sha=$(git rev-parse "$remote_ref" 2>/dev/null || echo "")

      if [ -z "$remote_sha" ]; then
        continue
      fi

      if [ "$local_sha" != "$remote_sha" ]; then
        log "CHANGE DETECTED on $branch: ${local_sha:0:8} → ${remote_sha:0:8}"

        if [ "$branch" = "$current_branch" ]; then
          # We're on this branch — pull with rebase
          if git pull --rebase origin "$branch" --quiet 2>>"$LOG"; then
            log "  ✓ Auto-pulled (rebase) $branch in primary worktree"
            # Check if Core API Python files changed → restart
            check_and_restart
          else
            log "  ✗ Pull failed on $branch — rebase conflict, needs manual resolve"
            git rebase --abort 2>/dev/null || true
          fi
        else
          # Not on this branch — update the ref without checkout
          if git fetch origin "$branch:$branch" --quiet 2>>"$LOG"; then
            log "  ✓ Updated local $branch ref (not checked out)"
          else
            git fetch origin "+$branch:$branch" --quiet 2>>"$LOG" && \
              log "  ✓ Force-updated local $branch ref" || \
              log "  ✗ Could not update $branch"
          fi
        fi
      fi
    done
  else
    log "Fetch failed (network issue?) — will retry next cycle"
  fi

  # --- Certifications worktree ---
  if [ -d "$CERTS_REPO/.git" ]; then
    cd "$CERTS_REPO"
    if git fetch origin --quiet 2>>"$LOG"; then
      cert_local=$(git rev-parse HEAD 2>/dev/null || echo "")
      cert_remote=$(git rev-parse origin/certifications 2>/dev/null || echo "")
      if [ -n "$cert_remote" ] && [ "$cert_local" != "$cert_remote" ]; then
        log "CHANGE DETECTED on certifications worktree: ${cert_local:0:8} → ${cert_remote:0:8}"
        if git pull --rebase origin certifications --quiet 2>>"$LOG"; then
          log "  ✓ Auto-pulled (rebase) certifications in certs worktree"
        else
          log "  ✗ Pull failed in certs worktree — needs manual resolve"
          git rebase --abort 2>/dev/null || true
        fi
      fi
    fi
  fi

  sleep "$INTERVAL"
done