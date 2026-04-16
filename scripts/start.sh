#!/usr/bin/env bash
# Preflight checks + launch the music app.
# Usage: ./scripts/start.sh [dev|web]
#   dev  (default) -> npm run tauri dev
#   web            -> npm run dev (Vite only)

set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env
if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

MODE="${1:-dev}"
PORT="${PORT:-1420}"
MUSIC_ROOT="${MUSIC_ROOT:-/Volumes/music}"
DATABASE_URL="${DATABASE_URL:-postgres://music@localhost:5432/music_db}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

fail=0
check() {
  local label="$1" ok="$2" hint="${3:-}"
  if [[ "$ok" == "1" ]]; then
    green "✓ $label"
  else
    red "✗ $label"
    [[ -n "$hint" ]] && yellow "  → $hint"
    fail=1
  fi
}

echo "── Preflight ──"

# 1. Music volume mounted
[[ -d "$MUSIC_ROOT" ]] && mount_ok=1 || mount_ok=0
check "Music volume mounted at $MUSIC_ROOT" "$mount_ok" \
  "Mount the SMB share (Finder → Go → Connect to Server)"

# 2. Port free
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  port_ok=0
  pid=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN | head -n1)
  check "Port $PORT is free" 0 "In use by PID $pid — kill with: kill $pid"
else
  check "Port $PORT is free" 1
fi

# 3. Postgres reachable
if command -v pg_isready >/dev/null 2>&1; then
  if pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
    check "Postgres reachable" 1
  else
    check "Postgres reachable" 0 "Start Postgres (brew services start postgresql@16)"
  fi
else
  yellow "• pg_isready not found — skipping Postgres check"
fi

# 4. node_modules installed
[[ -d node_modules ]] && check "node_modules present" 1 \
  || check "node_modules present" 0 "Run: npm install"

# 5. Rust toolchain (only for tauri mode)
if [[ "$MODE" == "dev" ]]; then
  command -v cargo >/dev/null 2>&1 && check "Rust/cargo available" 1 \
    || check "Rust/cargo available" 0 "Install via https://rustup.rs"
fi

if (( fail )); then
  red "Preflight failed. Fix the items above and retry."
  exit 1
fi

echo
green "All checks passed. Starting app…"
echo

if [[ "$MODE" == "web" ]]; then
  exec npm run dev
else
  exec npm run tauri dev
fi
