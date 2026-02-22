#!/usr/bin/env bash
set -euo pipefail

# Run script to start the carbooking server and a DDNS client (if present).
# Writes logs to ./logs and pid files to ./logs.

DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${LOG_DIR:-$DIR/logs}"
mkdir -p "$LOG_DIR"
# ensure ddns log exists so tail -F won't fail
touch "$LOG_DIR/ddns.log"

echo "=== run_with_ddns start $(date -Iseconds) ===" | tee -a "$LOG_DIR/run.log"

start_ddns(){
  echo "Searching for DDNS client..." | tee -a "$LOG_DIR/run.log"
  local candidates=("noip2" "duc" "noip-duc" "noip2d" "ddclient")
  for c in "${candidates[@]}"; do
    if command -v "$c" >/dev/null 2>&1; then
      echo "Found DDNS client: $c" | tee -a "$LOG_DIR/run.log"
      nohup "$c" >>"$LOG_DIR/ddns.log" 2>&1 &
      echo $! > "$LOG_DIR/ddns.pid"
      echo "Started $c (pid $(cat $LOG_DIR/ddns.pid))" | tee -a "$LOG_DIR/run.log"
      return 0
    fi
  done
  echo "No DDNS client found in PATH. Install No-IP DUC or ddclient." | tee -a "$LOG_DIR/run.log"
  return 1
}

start_server(){
  echo "Starting Node server (USE_HTTP=1)" | tee -a "$LOG_DIR/run.log"
  cd "$DIR"
  # run in background and log
  nohup env USE_HTTP=1 node server/index.js >>"$LOG_DIR/server.log" 2>&1 &
  echo $! > "$LOG_DIR/server.pid"
  echo "Server started (pid $(cat $LOG_DIR/server.pid))" | tee -a "$LOG_DIR/run.log"
}

stop_server(){
  if [ -f "$LOG_DIR/server.pid" ]; then
    pid=$(cat "$LOG_DIR/server.pid")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping server pid $pid" | tee -a "$LOG_DIR/run.log"
      kill "$pid"
      rm -f "$LOG_DIR/server.pid"
    fi
  fi
}

trap 'echo "Terminating..." | tee -a "$LOG_DIR/run.log"; stop_server; exit 0' SIGINT SIGTERM

start_ddns || true
start_server

echo "Logs: $LOG_DIR/run.log  $LOG_DIR/server.log  $LOG_DIR/ddns.log" | tee -a "$LOG_DIR/run.log"

# tail logs to console so systemd/journal captures output too
tail -F "$LOG_DIR/run.log" "$LOG_DIR/server.log" "$LOG_DIR/ddns.log" || true
