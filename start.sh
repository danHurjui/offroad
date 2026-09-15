#!/bin/bash
# RigLog — Launch Script
# Usage: ./start.sh [dev|stop|logs]

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="/tmp/riglog-logs"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[RigLog]${NC} $1"; }
warn() { echo -e "${YELLOW}[RigLog]${NC} $1"; }
info() { echo -e "${CYAN}[RigLog]${NC} $1"; }
err()  { echo -e "${RED}[RigLog]${NC} $1"; }

mkdir -p "$LOG_DIR"

free_port() {
  local port=$1
  if fuser -k "$port/tcp" &>/dev/null 2>&1; then
    warn "Port $port in use — stopped existing process."
    sleep 1
  fi
}

wait_for_port() {
  local port=$1 name=$2 timeout=60
  for i in $(seq 1 $timeout); do
    if curl -s -o /dev/null -m 1 "http://localhost:$port" &>/dev/null; then
      log "$name is ready on port $port"
      return 0
    fi
    sleep 1
  done
  err "$name did not start on port $port after ${timeout}s — check logs: $LOG_DIR/app.log"
  return 1
}

start_dev() {
  [ ! -f "$ROOT/.env.local" ] && warn "Missing .env.local — copy from .env.example"
  info "Starting docker-compose (postgres + redis)..."
  (cd "$ROOT" && docker-compose up -d)
  if [ ! -d "$ROOT/node_modules" ]; then
    log "Installing dependencies (first run)..."
    (cd "$ROOT" && npm install) || { err "npm install failed"; return 1; }
  fi
  free_port 3000
  info "Starting RigLog (port 3000)..."
  (cd "$ROOT" && npm run dev) > "$LOG_DIR/app.log" 2>&1 &
  APP_PID=$!
  wait_for_port 3000 "RigLog"
  print_status
  wait
}

stop_all() {
  warn "Stopping RigLog..."
  fuser -k 3000/tcp &>/dev/null 2>&1 && log "Stopped service on port 3000"
  (cd "$ROOT" && docker-compose down)
  log "All services stopped."
}

show_logs() {
  local file="$LOG_DIR/app.log"
  if [ -f "$file" ]; then
    echo -e "${CYAN}=== app logs (last 50 lines) ===${NC}"
    tail -50 "$file"
  else
    err "No log found."
  fi
}

print_status() {
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  RigLog — Running${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  ${CYAN}App${NC}       →  http://localhost:3000"
  echo -e "  ${CYAN}Postgres${NC}  →  localhost:5434"
  echo -e "  ${CYAN}Redis${NC}     →  localhost:6380"
  echo ""
  echo -e "  ${YELLOW}Dev seed credentials (npm run db:seed):${NC}"
  echo -e "  demo@riglog.ro / demo1234"
  echo ""
  echo -e "  Run ${CYAN}./start.sh stop${NC} from another terminal to stop"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

cleanup() {
  echo ""
  stop_all
  exit 0
}

trap cleanup SIGINT SIGTERM

if ! command -v node &> /dev/null; then
  err "Node.js not found. Install from https://nodejs.org/"
  exit 1
fi

SERVICE=${1:-dev}

case "$SERVICE" in
  dev)  start_dev ;;
  stop) stop_all; exit 0 ;;
  logs) show_logs; exit 0 ;;
  *)    start_dev ;;
esac
