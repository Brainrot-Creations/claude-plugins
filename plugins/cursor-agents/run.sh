#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURSOR_AGENT_PATH="${CURSOR_AGENT_PATH:-agent}"
export CURSOR_AGENT_PATH
exec node "$DIR/server/index.js"
