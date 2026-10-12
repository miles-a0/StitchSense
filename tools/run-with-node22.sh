#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 64
fi

node_is_usable() {
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major === 22 && minor >= 13 ? 0 : 1);
  ' >/dev/null 2>&1
}

if ! node_is_usable; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  unset npm_config_prefix

  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    echo "Node >=22.13 <23 is required, and nvm was not found at $NVM_DIR." >&2
    echo "Install a Node 22 runtime with nvm, or put a compatible node first in PATH." >&2
    exit 1
  fi

  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"

  if nvm use 22.23.3 >/dev/null 2>&1; then
    :
  elif nvm use 22.23.0 >/dev/null 2>&1; then
    :
  elif nvm use 22 >/dev/null 2>&1; then
    :
  else
    echo "No compatible Node 22 runtime is installed in nvm." >&2
    echo "Install Node 22 once with: nvm install 22" >&2
    exit 1
  fi
fi

if ! node_is_usable; then
  echo "Active node is still incompatible: $(node -v 2>/dev/null || echo missing)" >&2
  exit 1
fi

exec "$@"
