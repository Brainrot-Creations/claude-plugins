#!/usr/bin/env bash
# Launcher for stdio MCP when not using the Claude Code plugin loader (e.g. manual MCP config).
# Plugin installs use .mcp.json with ${CLAUDE_PLUGIN_ROOT}/dist/index.js (Socials Claude Code plugin).
set -euo pipefail
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
exec node "$ROOT/dist/index.js"
