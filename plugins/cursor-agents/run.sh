#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${CURSOR_AGENT_PATH:=$(command -v agent 2>/dev/null || true)}"
export CURSOR_AGENT_PATH

# Resolve node: prefer PATH, then NVM under $HOME (no hardcoded profile paths).
resolve_node() {
  local bin
  bin="$(command -v node 2>/dev/null || true)"
  if [[ -n "$bin" ]]; then
    printf '%s' "$bin"
    return 0
  fi

  local nvm_dirs=()
  [[ -n "${NVM_DIR:-}" ]] && nvm_dirs+=("$NVM_DIR")
  nvm_dirs+=("$HOME/.nvm")
  nvm_dirs+=("${XDG_CONFIG_HOME:-$HOME/.config}/nvm")

  local d nvm_sh
  for d in "${nvm_dirs[@]}"; do
    nvm_sh="${d%/}/nvm.sh"
    if [[ -s "$nvm_sh" ]]; then
      export NVM_DIR="${d%/}"
      # shellcheck source=/dev/null
      \. "$NVM_DIR/nvm.sh" --no-use
      bin="$(command -v node 2>/dev/null || true)"
      if [[ -z "$bin" ]]; then
        bin="$(nvm which current 2>/dev/null || true)"
      fi
      if [[ -n "$bin" ]]; then
        printf '%s' "$bin"
        return 0
      fi
    fi
  done

  return 1
}

NODE="$(resolve_node || true)"
if [[ -z "${NODE:-}" ]]; then
  echo "[cursor-agents] node not found in PATH; install Node or ensure nvm is under \"\$HOME\"." >&2
  exit 1
fi

exec "$NODE" "$DIR/server/index.js"
