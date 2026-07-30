#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
WORKSPACE_ROOT="${SCRIPT_DIR:h}"
RELAY_ROOT="${WORKSPACE_ROOT}/tools/codex-relay"
LOCAL_NODE_BIN="${WORKSPACE_ROOT}/.n/bin"
COREPACK_HOME="${WORKSPACE_ROOT}/.corepack"
CODEX_BIN_DEFAULT="${HOME}/.vscode/extensions/openai.chatgpt-26.616.51431-darwin-x64/bin/macos-x86_64/codex"

export PATH="${LOCAL_NODE_BIN}:$PATH"
export COREPACK_HOME
export CODEX_RELAY_WORKSPACE_PATH="${WORKSPACE_ROOT}"
export CODEX_RELAY_AUTH_DB_PATH="${WORKSPACE_ROOT}/.codex-relay/auth.db"
export CODEX_BIN="${CODEX_BIN:-$CODEX_BIN_DEFAULT}"
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

cd "${RELAY_ROOT}"
exec pnpm codex-relay:cli "$@"
