#!/usr/bin/env bash
# Restaurant app - full-stack Docker export script (Mac/Linux/Git Bash).
#
# Run via `./export.sh` from either the repo root or app/.
#
# Builds a Docker image of the app, then assembles a self-contained,
# portable bundle (the app image + Postgres image + compose config +
# one-click launcher scripts + a README) into a single .zip at the repo
# root. Copy that .zip to ANY machine with Docker installed and running one
# launcher script brings up the whole app -- website AND database -- with
# no need for this source repo, Node.js, or a Docker registry on that
# machine.
#
# This mirrors scripts/docker-export.ps1's behavior/order exactly. If you
# change one, change the other -- they are two independent implementations
# kept in sync by hand, not generated from a shared source (see CLAUDE.md).
#
# Every time this runs, it prints where the bundle was saved and exactly
# how to use it -- on purpose, so you never have to hunt down these
# instructions later.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
APP_DIR="$REPO_ROOT/app"
DOCKERFILE_PATH="$APP_DIR/Dockerfile"
TEMPLATES_DIR="$SCRIPT_DIR/export-templates"

IMAGE_NAME="restaurant-app"
IMAGE_TAG="latest"
FULL_IMAGE_REF="${IMAGE_NAME}:${IMAGE_TAG}"

BUNDLE_FOLDER_NAME="restaurant-app-export"
BUNDLE_DIR="$REPO_ROOT/$BUNDLE_FOLDER_NAME"
ZIP_FILE_NAME="restaurant-app-export.zip"
ZIP_PATH="$REPO_ROOT/$ZIP_FILE_NAME"
IMAGE_TAR_NAME="restaurant-app-image.tar"

# docker-compose.export.yml references postgres:16 by tag but does not build
# it -- Docker will silently pull it from Docker Hub the first time the
# compose stack starts if it isn't already cached locally. That's a real gap
# against "just Docker, no internet needed" on a genuinely fresh machine, so
# it gets saved into the bundle too, exactly like the app image.
POSTGRES_IMAGE_REF="postgres:16"
POSTGRES_TAR_NAME="postgres-image.tar"

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
# generic "install it somehow" list of every OS's syntax. `uname -s` gives
# "Darwin" on macOS, "Linux" on Linux, and something like "MINGW64_NT-..."
# under Git Bash on Windows -- "Linux" alone isn't enough since there's no
# single package manager there, so multiple common ones are checked.
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
printf "${C_MAGENTA} Restaurant app - full-stack Docker export${C_RESET}\n"
printf "${C_MAGENTA}=========================================${C_RESET}\n"
info "Repo root: $REPO_ROOT"
info "App dir:   $APP_DIR"

# ---------------------------------------------------------------------------
# 1. Docker present and running
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

if [ ! -f "$DOCKERFILE_PATH" ]; then
  err "No Dockerfile found at $DOCKERFILE_PATH -- cannot build an image."
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Build the image
# ---------------------------------------------------------------------------
step "Building Docker image '$FULL_IMAGE_REF' from $APP_DIR ..."
info "This runs 'npm ci' and 'npm run build' INSIDE the container, so it doesn't"
info "matter whether your local node_modules/.next are up to date -- the image"
info "is always built fresh from source."
echo ""

docker build -t "$FULL_IMAGE_REF" -f "$DOCKERFILE_PATH" "$APP_DIR"
ok "Image built successfully: $FULL_IMAGE_REF"

# ---------------------------------------------------------------------------
# 3. Assemble the bundle folder
# ---------------------------------------------------------------------------
step "Assembling the export bundle..."

if [ -d "$BUNDLE_DIR" ]; then
  info "Removing previous bundle folder from an earlier export..."
  rm -rf "$BUNDLE_DIR"
fi
mkdir -p "$BUNDLE_DIR"

IMAGE_TAR_PATH="$BUNDLE_DIR/$IMAGE_TAR_NAME"
info "Saving image to $IMAGE_TAR_NAME (this can take a little while)..."
docker save -o "$IMAGE_TAR_PATH" "$FULL_IMAGE_REF"
IMAGE_SIZE_MB="$(du -m "$IMAGE_TAR_PATH" | cut -f1)"
ok "Image saved (${IMAGE_SIZE_MB} MB)."

step "Making sure the Postgres image is available locally..."
if ! docker image inspect "$POSTGRES_IMAGE_REF" >/dev/null 2>&1; then
  info "$POSTGRES_IMAGE_REF not found locally -- pulling it now (one-time, needs internet on THIS machine only)..."
  docker pull "$POSTGRES_IMAGE_REF"
else
  ok "$POSTGRES_IMAGE_REF already present locally."
fi

POSTGRES_TAR_PATH="$BUNDLE_DIR/$POSTGRES_TAR_NAME"
info "Saving $POSTGRES_IMAGE_REF to $POSTGRES_TAR_NAME so the exported bundle needs no internet access on the OTHER machine..."
docker save -o "$POSTGRES_TAR_PATH" "$POSTGRES_IMAGE_REF"
POSTGRES_SIZE_MB="$(du -m "$POSTGRES_TAR_PATH" | cut -f1)"
ok "Postgres image saved (${POSTGRES_SIZE_MB} MB)."

info "Copying compose config, launcher scripts, and README into the bundle..."
cp "$TEMPLATES_DIR/docker-compose.export.yml" "$BUNDLE_DIR/"
cp "$TEMPLATES_DIR/run.cmd" "$BUNDLE_DIR/"
cp "$TEMPLATES_DIR/run.sh" "$BUNDLE_DIR/"
cp "$TEMPLATES_DIR/README.txt" "$BUNDLE_DIR/"
chmod +x "$BUNDLE_DIR/run.sh"
ok "Bundle folder assembled at $BUNDLE_DIR"

# ---------------------------------------------------------------------------
# 4. Zip it up
# ---------------------------------------------------------------------------
step "Zipping the bundle..."
if [ -f "$ZIP_PATH" ]; then
  rm -f "$ZIP_PATH"
fi

if ! command -v zip >/dev/null 2>&1; then
  err "The 'zip' command is not installed or not on PATH."
  info "The bundle folder was still created successfully at:"
  info "  $BUNDLE_DIR"
  info "Install zip, then re-run this to get a .zip file too:"
  info "  $(suggest_install_command zip)"
  info "Or just hand off the folder as-is instead of a .zip file -- it works the same."
  exit 1
fi

(cd "$BUNDLE_DIR" && zip -r -q "$ZIP_PATH" .)
ZIP_SIZE_MB="$(du -m "$ZIP_PATH" | cut -f1)"
ok "Zipped: $ZIP_PATH (${ZIP_SIZE_MB} MB)"

# ---------------------------------------------------------------------------
# 5. Always print usage instructions, every run.
# ---------------------------------------------------------------------------
echo ""
printf "${C_MAGENTA}=========================================${C_RESET}\n"
printf "${C_MAGENTA} Done. Here's what happened and how to use it:${C_RESET}\n"
printf "${C_MAGENTA}=========================================${C_RESET}\n"
echo ""
printf "  ${C_YELLOW}Saved here:${C_RESET}\n"
echo "    $ZIP_PATH"
echo "    (${ZIP_SIZE_MB} MB -- a zipped copy of everything needed)"
echo ""
echo "    An unzipped copy is also left at:"
echo "    $BUNDLE_DIR"
echo ""
echo "  This ONE zip file is everything needed to run the entire app -- the"
echo "  website AND its database -- on any other machine that has Docker"
echo "  installed. That machine does NOT need this source code repo, Node.js,"
echo "  a Docker Hub / registry account, OR an internet connection -- both the"
echo "  app image and the Postgres image are bundled in the zip, so nothing gets"
echo "  pulled from the internet on the other machine."
echo ""
printf "  ${C_YELLOW}--- On the OTHER machine ---${C_RESET}\n"
echo ""
echo "  1. Copy $ZIP_FILE_NAME over (USB drive, network share, cloud upload --"
echo "     however you'd normally move a file) and unzip it anywhere."
echo ""
echo "  2. Make sure Docker Desktop is installed and running on that machine."
echo ""
echo "  3. Windows: double-click run.cmd"
echo "     Mac/Linux: open a terminal in that folder and run:  ./run.sh"
echo ""
echo "  4. Wait about 10-20 seconds, then visit http://localhost:3000"
echo ""
echo "  The launcher script handles everything else automatically: it generates"
echo "  a fresh random SESSION_SECRET for that machine, loads the app image into"
echo "  Docker, and starts Postgres + the app together (the app waits for the"
echo "  database to be healthy before it starts, so there's no manual ordering"
echo "  to get right)."
echo ""
printf "  ${C_GRAY}Full details are also in README.txt inside the bundle.${C_RESET}\n"
echo ""
printf "  ${C_YELLOW}--- To re-export later ---${C_RESET}\n"
echo "     Just re-run this export command -- it always rebuilds the image fresh"
echo "     from current source and overwrites the old zip/folder."
echo ""
