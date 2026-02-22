#!/usr/bin/env bash
# update_and_notify.sh
# Usage: run from anywhere; script locates repo root relative to this file.
# Fetch origin/main, if HEAD differs from origin/main then pull, install, restart service and notify clients.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/.."
LOGFILE="/var/log/carbooking-updater.log"
SERVICE_NAME="carbooking.service"
SERVER_NOTIFY_URL="http://127.0.0.1:3001/internal/notify"

echo "[$(date -Iseconds)] update check starting" >> "$LOGFILE" 2>/dev/null || true
cd "$REPO_ROOT"
# ensure we have remotes
git remote get-url origin >/dev/null 2>&1 || { echo "no origin remote" >> "$LOGFILE"; exit 0; }

# fetch latest
if ! git fetch origin main --quiet; then
  echo "[$(date -Iseconds)] git fetch failed" >> "$LOGFILE" || true
  exit 0
fi

LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "")

if [ "$LOCAL" != "$REMOTE" ] && [ -n "$REMOTE" ]; then
  echo "[$(date -Iseconds)] updates found: $LOCAL -> $REMOTE" >> "$LOGFILE" || true
  # pull updates
  if git pull origin main --ff-only --quiet; then
    echo "[$(date -Iseconds)] pulled latest" >> "$LOGFILE" || true
    # install production deps if package.json changed
    if [ -f package.json ]; then
      echo "[$(date -Iseconds)] running npm ci (production)" >> "$LOGFILE" || true
      if command -v npm >/dev/null 2>&1; then
        npm ci --only=production --silent || echo "npm ci failed" >> "$LOGFILE" || true
      fi
    fi
    # restart systemd service
    if command -v systemctl >/dev/null 2>&1; then
      systemctl restart "$SERVICE_NAME" && echo "[$(date -Iseconds)] restarted $SERVICE_NAME" >> "$LOGFILE" || echo "[$(date -Iseconds)] failed restart $SERVICE_NAME" >> "$LOGFILE"
    else
      echo "[$(date -Iseconds)] systemctl not available; please restart $SERVICE_NAME manually" >> "$LOGFILE"
    fi
    # notify connected clients via local internal endpoint
    MSG="Server updated: $(git log -1 --pretty=format:'%h %s')"
    curl -s -X POST -H 'Content-Type: application/json' -d "{\"message\":\"${MSG//"/\"}\"}" "$SERVER_NOTIFY_URL" >/dev/null 2>&1 || echo "[$(date -Iseconds)] notify curl failed" >> "$LOGFILE"
  else
    echo "[$(date -Iseconds)] git pull failed" >> "$LOGFILE" || true
  fi
else
  echo "[$(date -Iseconds)] no updates" >> "$LOGFILE" || true
fi
