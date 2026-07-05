#!/usr/bin/env bash
# Restaurant app - unpack the exported bundle (Mac/Linux/Git Bash).
#
# Run via `./unpack.sh` from either the repo root or app/.
# Optional: `./unpack.sh --start` also runs `docker compose up` to fully
#           launch the app afterward (equivalent to running run.sh yourself).
# Optional: `./unpack.sh --destination <path>` to control where it's
# extracted (defaults to a timestamped folder next to the zip so re-running
# this doesn't silently clobber a previous unpack you might still be using).
#
# This extracts the zip AND loads both Docker images from it (docker load),
# since "unpacking" a Docker export isn't just decompressing files -- the
# images inside the .tar files aren't usable by Docker until they're loaded
# into its local image store.
#
# This mirrors scripts/docker-unpack.ps1's behavior/order exactly, including
# the self-cleanup-on-failure logic. If you change one, change the other --
# they are two independent implementations kept in sync by hand, not
# generated from a shared source (see CLAUDE.md).
#
# This is for unpacking restaurant-app-export.zip on THIS machine (e.g. to
# test it, or because you're setting this machine up as the "target" of an
# export you received). On a genuinely different machine, you won't have
# this script -- just unzip the file with whatever tool that machine has
# and run run.cmd/run.sh directly. This command exists purely as a
# convenience for staying inside one workflow on a machine that already has
# this repo.
#
# Every time this runs, it prints exactly what happened and what to do
# next -- same "always explain itself" pattern as startup/export.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ZIP_FILE_NAME="restaurant-app-export.zip"
ZIP_PATH="$REPO_ROOT/$ZIP_FILE_NAME"
APP_IMAGE_TAR_NAME="restaurant-app-image.tar"
POSTGRES_IMAGE_TAR_NAME="postgres-image.tar"
COMPOSE_FILE_NAME="docker-compose.export.yml"

DESTINATION=""
START=0

while [ $# -gt 0 ]; do
  case "$1" in
    --start)
      START=1
      shift
      ;;
    --destination)
      DESTINATION="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -t 1 ]; then
  C_CYAN='\033[0;36m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[0;33m'; C_RED='\033[0;31m'; C_GRAY='\033[0;90m'; C_MAGENTA='\033[0;35m'; C_RESET='\033[0m'
else
  C_CYAN=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_GRAY=''; C_MAGENTA=''; C_RESET=''
fi

step() { printf "\n${C_CYAN}==> %s${C_RESET}\n" "$1"; }
ok()   { printf "    ${C_GREEN}[OK]${C_RESET} %s\n" "$1"; }
err()  { printf "    ${C_RED}[FAIL]${C_RESET} %s\n" "$1"; }
info() { printf "    ${C_GRAY}%s${C_RESET}\n" "$1"; }

# Detects the OS (and, on Linux, which package manager is actually present)
# so error messages can give ONE correct install command instead of a
# generic "install it somehow" list of every OS's syntax. See
# docker-export.sh's copy of this same function for the reasoning -- kept
# duplicated rather than shared, matching this project's "independent
# per-platform scripts" approach (see CLAUDE.md).
suggest_install_command() {
  local package_name="$1"
  local os
  os="$(uname -s)"
  case "$os" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        echo "brew install $package_name"
      else
        echo "install Homebrew first (https://brew.sh), then: brew install $package_name"
      fi
      ;;
    Linux)
      if command -v apt >/dev/null 2>&1; then
        echo "sudo apt install $package_name"
      elif command -v dnf >/dev/null 2>&1; then
        echo "sudo dnf install $package_name"
      elif command -v yum >/dev/null 2>&1; then
        echo "sudo yum install $package_name"
      elif command -v pacman >/dev/null 2>&1; then
        echo "sudo pacman -S $package_name"
      elif command -v apk >/dev/null 2>&1; then
        echo "sudo apk add $package_name"
      elif command -v zypper >/dev/null 2>&1; then
        echo "sudo zypper install $package_name"
      else
        echo "install $package_name using your distro's package manager"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      if command -v pacman >/dev/null 2>&1; then
        echo "pacman -S $package_name (MSYS2/Git Bash package manager)"
      elif command -v choco >/dev/null 2>&1; then
        echo "choco install $package_name (Chocolatey)"
      else
        echo "install $package_name (e.g. via Git Bash's MSYS2 pacman, or Chocolatey if installed)"
      fi
      ;;
    *)
      echo "install $package_name using your system's package manager"
      ;;
  esac
}

printf "${C_MAGENTA}=========================================${C_RESET}\n"
printf "${C_MAGENTA} Restaurant app - unpack exported bundle${C_RESET}\n"
printf "${C_MAGENTA}=========================================${C_RESET}\n"

if [ ! -f "$ZIP_PATH" ]; then
  err "$ZIP_FILE_NAME not found at $REPO_ROOT"
  info "Run ./export.sh first to create it."
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Docker present and running (needed for the "docker load" step below,
#    not just for --start, so check this before doing any extraction work)
# ---------------------------------------------------------------------------
step "Checking Docker is installed and running..."
if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed or not on PATH. Install Docker Desktop first: https://www.docker.com/products/docker-desktop/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  err "Docker is installed but not running. Start Docker Desktop and try again."
  exit 1
fi
ok "Docker is installed and running."

# ---------------------------------------------------------------------------
# 2. Extract the zip
# ---------------------------------------------------------------------------
if [ -z "$DESTINATION" ]; then
  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  DESTINATION="$REPO_ROOT/restaurant-app-unpacked-$TIMESTAMP"
fi

step "Extracting $ZIP_FILE_NAME ..."
info "Source:      $ZIP_PATH"
info "Destination: $DESTINATION"

if ! command -v unzip >/dev/null 2>&1; then
  err "The 'unzip' command is not installed or not on PATH."
  info "Install it, then try again:"
  info "  $(suggest_install_command unzip)"
  exit 1
fi

mkdir -p "$DESTINATION"
unzip -q -o "$ZIP_PATH" -d "$DESTINATION"
ok "Extracted successfully."

FILE_COUNT="$(find "$DESTINATION" -maxdepth 1 -type f | wc -l | tr -d ' ')"
ok "$FILE_COUNT files extracted."

# ---------------------------------------------------------------------------
# 3. Load both Docker images from the extracted .tar files
# ---------------------------------------------------------------------------
APP_IMAGE_TAR_PATH="$DESTINATION/$APP_IMAGE_TAR_NAME"
POSTGRES_IMAGE_TAR_PATH="$DESTINATION/$POSTGRES_IMAGE_TAR_NAME"

if [ ! -f "$APP_IMAGE_TAR_PATH" ]; then
  err "$APP_IMAGE_TAR_NAME not found in the extracted folder -- something's wrong with the zip contents."
  exit 1
fi
if [ ! -f "$POSTGRES_IMAGE_TAR_PATH" ]; then
  err "$POSTGRES_IMAGE_TAR_NAME not found in the extracted folder -- something's wrong with the zip contents."
  exit 1
fi

step "Loading the app image into Docker (docker load)..."
docker load -i "$APP_IMAGE_TAR_PATH"
ok "App image loaded."

step "Loading the Postgres image into Docker (docker load)..."
docker load -i "$POSTGRES_IMAGE_TAR_PATH"
ok "Postgres image loaded."

# ---------------------------------------------------------------------------
# 4. .env (SESSION_SECRET) -- same generation + validation logic as run.sh,
#    duplicated here (not called out to a shared file) because run.cmd/run.sh
#    are meant to work standing alone on a machine with nothing else from
#    this repo -- see CLAUDE.md on why that independence matters.
# ---------------------------------------------------------------------------
ENV_PATH="$DESTINATION/.env"
if [ ! -f "$ENV_PATH" ]; then
  step "Generating a fresh random SESSION_SECRET for this machine..."
  SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" 2>/dev/null || true)"
  if [ -z "$SECRET" ]; then
    SECRET="$(openssl rand -base64 48 2>/dev/null | tr '+/' '-_' | tr -d '=\n' || true)"
  fi

  if [ -z "$SECRET" ] || [ "${#SECRET}" -lt 32 ]; then
    err "Could not generate a random SESSION_SECRET (need either 'node' or 'openssl' on PATH). Cannot continue safely."
    exit 1
  fi

  printf "SESSION_SECRET=%s" "$SECRET" > "$ENV_PATH"
  ok "Wrote .env with a new SESSION_SECRET."
else
  ok ".env already exists in the destination, reusing it."
fi

# ---------------------------------------------------------------------------
# 5. Optionally go all the way and start the stack
# ---------------------------------------------------------------------------
if [ "$START" -eq 1 ]; then
  step "Starting Postgres + the app (docker compose up -d, since --start was passed)..."
  COMPOSE_FILE_PATH="$DESTINATION/$COMPOSE_FILE_NAME"
  if ! (cd "$DESTINATION" && docker compose -f "$COMPOSE_FILE_PATH" up -d); then
    # A partial failure here (e.g. Postgres starts fine, then the app
    # container fails because port 3000 is already taken by something else)
    # leaves orphaned containers/network/volume behind if not cleaned up.
    # Tear down whatever this specific run just created rather than leaving
    # debris for the user to notice and puzzle over later.
    err "docker compose up failed. See output above."
    info "Cleaning up any containers/network/volume this run just created..."
    (cd "$DESTINATION" && docker compose -f "$COMPOSE_FILE_PATH" down -v) || true
    info "A common cause: something else on this machine (e.g. the normal dev server) is already using port 3000 or 5432."
    info "The extracted files are still at $DESTINATION if you want to edit docker-compose.export.yml's ports and try again."
    exit 1
  fi
  ok "Stack started."
fi

# ---------------------------------------------------------------------------
# 6. Always print what happened and what to do next
# ---------------------------------------------------------------------------
echo ""
printf "${C_MAGENTA}=========================================${C_RESET}\n"
printf "${C_MAGENTA} Done. Here's what happened and how to use it:${C_RESET}\n"
printf "${C_MAGENTA}=========================================${C_RESET}\n"
echo ""
printf "  ${C_YELLOW}Unpacked to:${C_RESET}\n"
echo "    $DESTINATION"
echo ""
echo "  Both Docker images (app + Postgres) are now loaded into Docker on this"
echo "  machine, ready to run -- that part is done, no internet was used for it."
echo ""

if [ "$START" -eq 1 ]; then
  echo "  The app is starting now. Wait about 10-20 seconds, then visit:"
  printf "    ${C_GREEN}http://localhost:3000${C_RESET}\n"
else
  echo "  To actually start the app running:"
  printf "    ${C_GREEN}cd \"%s\"${C_RESET}\n" "$DESTINATION"
  printf "    ${C_GREEN}docker compose -f %s up -d${C_RESET}\n" "$COMPOSE_FILE_NAME"
  printf "    ${C_GRAY}(or just re-run: ./unpack.sh --start)${C_RESET}\n"
fi
echo ""
echo "  Useful commands afterward (run from that folder):"
printf "    ${C_GRAY}docker compose -f %s ps        (check status)${C_RESET}\n" "$COMPOSE_FILE_NAME"
printf "    ${C_GRAY}docker compose -f %s logs -f    (watch logs)${C_RESET}\n" "$COMPOSE_FILE_NAME"
printf "    ${C_GRAY}docker compose -f %s down       (stop everything)${C_RESET}\n" "$COMPOSE_FILE_NAME"
echo ""
printf "  ${C_GRAY}This whole command is a convenience for THIS machine only. On a genuinely${C_RESET}\n"
printf "  ${C_GRAY}different machine, there's no unpack command available -- just unzip${C_RESET}\n"
printf "  ${C_GRAY}restaurant-app-export.zip normally and run run.cmd / run.sh, which do${C_RESET}\n"
printf "  ${C_GRAY}the same docker load + docker compose up steps on their own.${C_RESET}\n"
echo ""
