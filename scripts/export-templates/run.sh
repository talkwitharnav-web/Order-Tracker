#!/usr/bin/env bash
# Restaurant app - run this exported bundle (Mac/Linux).
# Works from any location this bundle is unzipped to on any machine that
# has Docker installed and running -- nothing here is hardcoded to a
# specific folder or user account.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "========================================="
echo " Restaurant app - starting from exported bundle"
echo "========================================="
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo "[FAIL] Docker is not installed or not on PATH."
  echo "       Install Docker Desktop first: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[FAIL] Docker is installed but not running."
  echo "       Start Docker Desktop, wait for it to finish starting, then re-run this."
  exit 1
fi
echo "[OK] Docker is installed and running."
echo ""

if [ ! -f ".env" ]; then
  echo "[!] .env not found -- generating a fresh random SESSION_SECRET for this machine."
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" 2>/dev/null || openssl rand -base64 48 2>/dev/null | tr '+/' '-_' | tr -d '=\n')
  # Validate before writing -- a silently-empty or short SECRET here would
  # mean neither node nor openssl was available, and writing that out as if
  # it were a real secret would be worse than failing loudly (see the
  # equivalent Windows run.cmd for the exact failure mode this guards against:
  # an API incompatibility there once produced an all-zero-byte "secret").
  if [ -z "$SECRET" ] || [ "${#SECRET}" -lt 32 ]; then
    echo "[FAIL] Could not generate a random SESSION_SECRET (need either 'node' or 'openssl' on PATH). Cannot continue safely."
    exit 1
  fi
  echo "SESSION_SECRET=${SECRET}" > .env
  echo "[OK] Wrote .env with a new SESSION_SECRET."
else
  echo "[OK] .env already exists, reusing it."
fi
echo ""

echo "==> Loading the app image (docker load)..."
docker load -i restaurant-app-image.tar
echo ""

echo "==> Loading the Postgres image (docker load)..."
# Bundled alongside the app image specifically so this whole launch needs
# zero internet access -- without this, `docker compose up` would try to
# pull postgres:16 from Docker Hub on a machine that's never run it before.
docker load -i postgres-image.tar
echo ""

echo "==> Starting Postgres + the app (docker compose up -d)..."
docker compose -f docker-compose.export.yml up -d
echo ""

echo "========================================="
echo " Done. The app should be starting up now."
echo "========================================="
echo ""
echo "  Visit http://localhost:3000 in a browser (give it 10-20 seconds to be ready)."
echo ""
echo "  Useful commands (run from this folder):"
echo "    docker compose -f docker-compose.export.yml ps        (check status)"
echo "    docker compose -f docker-compose.export.yml logs -f    (watch logs)"
echo "    docker compose -f docker-compose.export.yml down       (stop everything)"
echo ""
