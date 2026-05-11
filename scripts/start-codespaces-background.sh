#!/usr/bin/env bash
set -u

cd "$(dirname "$0")/.."

mkdir -p logs .codexinphone

if curl -fsS http://127.0.0.1:${PORT:-8787}/health >/dev/null 2>&1; then
  echo "Codex in Phone is already running."
  exit 0
fi

if [[ -f ".codexinphone/codespaces-server.pid" ]]; then
  oldpid="$(cat .codexinphone/codespaces-server.pid 2>/dev/null || true)"
  if [[ -n "${oldpid}" ]]; then
    kill "${oldpid}" 2>/dev/null || true
  fi
fi

nohup npm run codespaces:start > logs/codespaces-server.log 2>&1 &
echo "$!" > .codexinphone/codespaces-server.pid

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:${PORT:-8787}/health >/dev/null 2>&1; then
    echo "Codex in Phone started."
    exit 0
  fi
  sleep 2
done

echo "Codex in Phone did not become ready. Last log lines:"
tail -n 80 logs/codespaces-server.log 2>/dev/null || true
exit 0
