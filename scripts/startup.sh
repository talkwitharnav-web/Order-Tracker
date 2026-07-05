#!/usr/bin/env bash
# Restaurant app startup script (Mac/Linux/Git Bash).
#
# Run this from EITHER the repo root or the app/ folder by typing
# `./startup.sh` (a thin wrapper in both locations forwards here). It never
# hardcodes a machine-specific path -- everything is resolved relative to
# this script's own location, so it works the same on any machine the repo
# is cloned/copied to.
#
# This mirrors scripts/startup.ps1's behavior/order exactly. If you change
# one, change the other -- they are two independent implementations kept in
# sync by hand, not generated from a shared source (see CLAUDE.md).
#
# What it does, in order, being verbose about every step:
#   1. Check Node.js is installed (and print the version).
#   2. Check npm is installed.
#   3. Check Docker is installed.
#   4. Check Docker is actually RUNNING (it does not auto-start).
#   5. Check/create app/.env.local (copies from .env.example, generates a
#      real random SESSION_SECRET automatically if missing).
#   6. Check/install npm dependencies in app/ (npm ci if a lockfile exists
#      and node_modules is missing/stale, else npm install).
#   7. Start the Postgres container via docker compose.
#   8. Start the dev server (node server.js).
#
# Written for portability across bash 3.2 (macOS's default, does not have
# associative arrays or some bash-4+ features) and bash 4+/5+ (Linux,
# Git Bash) -- avoid bash-4-only syntax if you touch this.

set -euo pipefail

# Resolve paths relative to THIS script, not the current working directory,
# so it doesn't matter whether you're in repo root or app/ when you run it.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
APP_DIR="$REPO_ROOT/app"

# Colors -- disabled automatically if not a real terminal (e.g. piped output)
if [ -t 1 ]; then
  C_CYAN='\033[0;36m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[0;33m'; C_RED='\033[0;31m'; C_GRAY='\033[0;90m'; C_MAGENTA='\033[0;35m'; C_RESET='\033[0m'
else
  C_CYAN=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_GRAY=''; C_MAGENTA=''; C_RESET=''
fi

step() { printf "\n${C_CYAN}==> %s${C_RESET}\n" "$1"; }
ok()   { printf "    ${C_GREEN}[OK]${C_RESET} %s\n" "$1"; }
warn() { printf "    ${C_YELLOW}[!]${C_RESET} %s\n" "$1"; }
err()  { printf "    ${C_RED}[FAIL]${C_RESET} %s\n" "$1"; }
info() { printf "    ${C_GRAY}%s${C_RESET}\n" "$1"; }

printf "${C_MAGENTA}=========================================${C_RESET}\n"
printf "${C_MAGENTA} Restaurant app - startup dependency check${C_RESET}\n"
printf "${C_MAGENTA}=========================================${C_RESET}\n"
info "Repo root: $REPO_ROOT"
info "App dir:   $APP_DIR"

# ---------------------------------------------------------------------------
# 1. Node.js
# ---------------------------------------------------------------------------
step "Checking for Node.js..."
if ! command -v node >/dev/null 2>&1; then
  err "Node.js is not installed or not on PATH."
  info "This script cannot install Node.js for you automatically (it's not a package, it's a runtime installer)."
  info "Install it from https://nodejs.org (LTS version) and re-run this script."
  exit 1
fi
NODE_VERSION="$(node --version)"
ok "Node.js found: $NODE_VERSION (at $(command -v node))"

NODE_MAJOR="$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 18 ]; then
  warn "Node.js $NODE_VERSION is older than the recommended minimum (v18+). Things may not work correctly."
else
  ok "Node.js version is recent enough (v18+)."
fi

# ---------------------------------------------------------------------------
# 2. npm
# ---------------------------------------------------------------------------
step "Checking for npm..."
if ! command -v npm >/dev/null 2>&1; then
  err "npm is not installed or not on PATH (it normally ships with Node.js)."
  info "Reinstall Node.js from https://nodejs.org, which includes npm, then re-run this script."
  exit 1
fi
NPM_VERSION="$(npm --version)"
ok "npm found: v$NPM_VERSION"

# ---------------------------------------------------------------------------
# 3. Docker installed
# ---------------------------------------------------------------------------
step "Checking for Docker..."
if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed or not on PATH."
  info "This app needs Docker to run its Postgres database locally."
  info "Download and install Docker Desktop from https://www.docker.com/products/docker-desktop/"
  info "Then start it once (it needs to be running, not just installed) and re-run this script."
  exit 1
fi
DOCKER_VERSION="$(docker --version)"
ok "Docker found: $DOCKER_VERSION"

# ---------------------------------------------------------------------------
# 4. Docker actually running
# ---------------------------------------------------------------------------
step "Checking Docker is running..."
if ! docker info >/dev/null 2>&1; then
  err "Docker is installed but does not appear to be running."
  info "This script will NOT try to launch Docker for you automatically --"
  info "please start Docker Desktop yourself (it can take 10-30s to finish starting up),"
  info "then re-run this script."
  exit 1
fi
ok "Docker is running."

# ---------------------------------------------------------------------------
# 5. app/.env.local
# ---------------------------------------------------------------------------
step "Checking app/.env.local..."
ENV_LOCAL_PATH="$APP_DIR/.env.local"
ENV_EXAMPLE_PATH="$APP_DIR/.env.example"

# Generates a random 48-byte value, base64url-encoded, no padding -- same
# shape as the PowerShell version. Prefers Node (already confirmed present
# above) over openssl/other tools for consistency across platforms.
generate_secret() {
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
}

if [ -f "$ENV_LOCAL_PATH" ]; then
  ok ".env.local already exists."
  if ! grep -qE '^SESSION_SECRET=\S' "$ENV_LOCAL_PATH" 2>/dev/null; then
    warn "SESSION_SECRET is missing or empty in .env.local -- generating one now."
    SECRET="$(generate_secret)"
    if [ -z "$SECRET" ]; then
      err "Failed to generate a random SESSION_SECRET. Cannot continue safely."
      exit 1
    fi
    if grep -q '^SESSION_SECRET=' "$ENV_LOCAL_PATH" 2>/dev/null; then
      # Portable in-place edit: write to a temp file then move, rather than
      # relying on `sed -i` flag differences between GNU sed (Linux) and
      # BSD sed (macOS), which take -i differently (macOS requires an
      # argument to -i, even if empty; GNU sed treats a bare -i as in-place
      # with no backup). Avoiding sed -i entirely sidesteps that mismatch.
      TMP_FILE="$(mktemp)"
      awk -v secret="$SECRET" '{ if ($0 ~ /^SESSION_SECRET=/) print "SESSION_SECRET=" secret; else print }' "$ENV_LOCAL_PATH" > "$TMP_FILE"
      mv "$TMP_FILE" "$ENV_LOCAL_PATH"
    else
      printf "\nSESSION_SECRET=%s\n" "$SECRET" >> "$ENV_LOCAL_PATH"
    fi
    ok "Generated a new random SESSION_SECRET and saved it to .env.local."
  else
    ok "SESSION_SECRET is already set."
  fi
else
  warn ".env.local does not exist yet -- creating it from .env.example."
  if [ ! -f "$ENV_EXAMPLE_PATH" ]; then
    err "app/.env.example is missing too -- cannot create .env.local automatically."
    exit 1
  fi
  cp "$ENV_EXAMPLE_PATH" "$ENV_LOCAL_PATH"
  ok "Copied .env.example -> .env.local"

  info "Generating a random SESSION_SECRET (this signs login sessions -- must be unique per install)..."
  SECRET="$(generate_secret)"
  if [ -z "$SECRET" ]; then
    err "Failed to generate a random SESSION_SECRET. Cannot continue safely."
    exit 1
  fi
  if grep -q '^SESSION_SECRET=' "$ENV_LOCAL_PATH" 2>/dev/null; then
    TMP_FILE="$(mktemp)"
    awk -v secret="$SECRET" '{ if ($0 ~ /^SESSION_SECRET=/) print "SESSION_SECRET=" secret; else print }' "$ENV_LOCAL_PATH" > "$TMP_FILE"
    mv "$TMP_FILE" "$ENV_LOCAL_PATH"
  else
    printf "\nSESSION_SECRET=%s\n" "$SECRET" >> "$ENV_LOCAL_PATH"
  fi
  ok "SESSION_SECRET generated and saved."
fi

# ---------------------------------------------------------------------------
# 6. npm dependencies
# ---------------------------------------------------------------------------
step "Checking npm dependencies in app/..."
NODE_MODULES_PATH="$APP_DIR/node_modules"
PACKAGE_LOCK_PATH="$APP_DIR/package-lock.json"
PACKAGE_JSON_PATH="$APP_DIR/package.json"

NEEDS_INSTALL=0
if [ ! -d "$NODE_MODULES_PATH" ]; then
  warn "node_modules does not exist yet."
  NEEDS_INSTALL=1
else
  # A timestamp comparison alone isn't reliable enough -- node_modules can
  # exist and look "fresh" while a specific package inside it is actually
  # missing or half-installed (this happened during testing on Windows:
  # node_modules existed, but node_modules/next/package.json was missing
  # entirely, and a plain folder-timestamp check would have said "looks
  # fine"). Actually verify every declared dependency resolves, using Node
  # itself to parse package.json and check -- avoids depending on `jq`,
  # which isn't guaranteed to be installed.
  #
  # Deliberately using fs.readFileSync + JSON.parse instead of require() --
  # require() on Windows Node.js cannot resolve the POSIX-style paths Git
  # Bash produces (e.g. /c/Users/... instead of C:/Users/...), which broke
  # this exact line when first tested under Git Bash on Windows. Passing
  # paths as plain strings into readFileSync has no such restriction.
  MISSING_DEPS="$(node -e "
    const fs = require('fs');
    const path = require('path');
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const nodeModulesPath = process.argv[2];
    const deps = Object.keys({ ...(pkg.dependencies||{}), ...(pkg.devDependencies||{}) });
    const missing = deps.filter(d => !fs.existsSync(path.join(nodeModulesPath, d, 'package.json')));
    console.log(missing.length + '|' + missing.join(','));
  " "$PACKAGE_JSON_PATH" "$NODE_MODULES_PATH")"
  MISSING_COUNT="$(echo "$MISSING_DEPS" | cut -d'|' -f1)"
  MISSING_NAMES="$(echo "$MISSING_DEPS" | cut -d'|' -f2)"

  if [ "$MISSING_COUNT" -gt 0 ]; then
    warn "node_modules exists but $MISSING_COUNT declared package(s) are missing/incomplete: $MISSING_NAMES"
    NEEDS_INSTALL=1
  else
    ok "node_modules exists and all declared dependencies resolve correctly."
  fi
fi

if [ "$NEEDS_INSTALL" -eq 1 ]; then
  info "Installing npm dependencies (this can take a minute or two)..."
  (
    cd "$APP_DIR"
    if [ -f "$PACKAGE_LOCK_PATH" ]; then
      info "Running: npm ci"
      npm ci
    else
      info "Running: npm install"
      npm install
    fi
  )
  ok "Dependencies installed successfully."
fi

# ---------------------------------------------------------------------------
# 7. Start Postgres via docker compose
# ---------------------------------------------------------------------------
step "Starting Postgres (docker compose up -d)..."
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
  err "docker-compose.yml not found at $COMPOSE_FILE"
  exit 1
fi
docker compose -f "$COMPOSE_FILE" up -d
ok "Postgres container is up (or was already running)."

info "Waiting for Postgres to report healthy..."
MAX_WAIT_SECONDS=30
WAITED=0
HEALTHY=0
while [ "$WAITED" -lt "$MAX_WAIT_SECONDS" ]; do
  if docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
    HEALTHY=1
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done
if [ "$HEALTHY" -eq 1 ]; then
  ok "Postgres is healthy."
else
  warn "Postgres did not report healthy within ${MAX_WAIT_SECONDS}s -- it may still be starting. Continuing anyway."
fi

# ---------------------------------------------------------------------------
# 8. Start the dev server
# ---------------------------------------------------------------------------
step "All checks passed. Starting the dev server..."
info "Running: node server.js  (from $APP_DIR)"
info "Press Ctrl+C to stop the server."
echo ""

cd "$APP_DIR"
exec node server.js
