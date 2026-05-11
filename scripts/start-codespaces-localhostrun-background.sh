#!/usr/bin/env bash
set -u

cd "$(dirname "$0")/.."
repo_dir="$(pwd)"

mkdir -p logs .codexinphone

monitor_pid_file=".codexinphone/localhostrun-monitor.pid"

if [[ -f "${monitor_pid_file}" ]]; then
  oldpid="$(cat "${monitor_pid_file}" 2>/dev/null || true)"
  if [[ -n "${oldpid}" ]] && kill -0 "${oldpid}" 2>/dev/null; then
    echo "localhost.run monitor is already running."
    exit 0
  fi
fi

nohup bash -c "
  cd \"${repo_dir}\"
  while true; do
    bash scripts/start-codespaces-localhostrun.sh || true
    sleep 30
  done
" > logs/localhostrun-monitor.log 2>&1 &

echo "$!" > "${monitor_pid_file}"
echo "localhost.run monitor started."
