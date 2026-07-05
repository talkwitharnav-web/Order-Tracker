#!/usr/bin/env bash
# Thin wrapper so you can run `./unpack.sh` (with any of its args, e.g.
# --start) from the app/ folder too. The real logic lives in
# ../scripts/docker-unpack.sh.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../scripts/docker-unpack.sh" "$@"
