#!/usr/bin/env bash
# Thin wrapper so you can run `./startup.sh` from the repo root.
# The real logic lives in scripts/startup.sh (kept in one place so the
# root and app/ wrappers can't drift out of sync with each other).
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/scripts/startup.sh"
