#!/usr/bin/env bash
# Launcher for Claude Code MCP (stdio). Resolves package root so .mcp.json needs no absolute paths.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/dist/index.js"
