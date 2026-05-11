#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${PORT:-8787}"
APP_HOST="${HOST:-127.0.0.1}"

fail() {
  echo "codespaces:start: $*" >&2
  exit 1
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "Missing required environment variable: ${name}. Add it in GitHub Codespaces secrets."
  fi
}

require_env "SESSION_SECRET"
require_env "PAIRING_TOKEN"

if (( ${#SESSION_SECRET} < 32 )); then
  fail "SESSION_SECRET must be at least 32 characters."
fi

if (( ${#PAIRING_TOKEN} < 32 )); then
  fail "PAIRING_TOKEN must be at least 32 characters."
fi

if [[ -z "${PUBLIC_ORIGIN:-}" ]]; then
  require_env "CODESPACE_NAME"
  require_env "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"
  PUBLIC_ORIGIN="https://${CODESPACE_NAME}-${APP_PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
fi

export NODE_ENV="${NODE_ENV:-production}"
export HOST="${APP_HOST}"
export PORT="${APP_PORT}"
export PUBLIC_ORIGIN
export AUTH_MODE="${AUTH_MODE:-token}"
export COOKIE_SECURE="${COOKIE_SECURE:-true}"
export TRUST_PROXY="${TRUST_PROXY:-1}"
export CODEX_COMMAND="${CODEX_COMMAND:-codex}"
export CODEX_ARGS="${CODEX_ARGS:-}"
export WORKSPACE_ROOTS="${WORKSPACE_ROOTS:-/workspaces}"
export DEFAULT_CWD="${DEFAULT_CWD:-$(pwd)}"
export DATA_DIR="${DATA_DIR:-.codexinphone}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

if ! command -v "${CODEX_COMMAND}" >/dev/null 2>&1; then
  fail "CODEX_COMMAND does not resolve on PATH: ${CODEX_COMMAND}. Rebuild the Codespace or run: npm install -g @openai/codex"
fi

echo "Codex in Phone"
echo "  URL: ${PUBLIC_ORIGIN}"
echo "  Auth: ${AUTH_MODE}"
echo "  Workspace: ${DEFAULT_CWD}"
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "  OpenAI API key: not set; run 'codex login --device-auth' in this Codespace if Codex asks you to log in."
else
  echo "  OpenAI API key: set"
fi
echo

npm run build
exec npm start
