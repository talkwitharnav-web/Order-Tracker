#!/usr/bin/env bash
# Thin wrapper so you can run `./export.sh` from the repo root.
# The real logic lives in scripts/docker-export.sh.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/scripts/docker-export.sh"
