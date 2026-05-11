#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p logs .codexinphone

tunnel_log="logs/localhostrun.log"
tunnel_pid_file=".codexinphone/localhostrun.pid"
server_pid_file=".codexinphone/codespaces-server.pid"
app_port="${PORT:-8787}"

latest_url() {
  grep -Eo 'https://[A-Za-z0-9.-]+\.lhr\.life' "${tunnel_log}" 2>/dev/null | tail -n 1 || true
}

env_origin() {
  if [[ -f ".env.codespaces" ]]; then
    grep -E '^PUBLIC_ORIGIN=' ".env.codespaces" | tail -n 1 | cut -d= -f2- || true
  fi
}

set_env_origin() {
  local url="$1"
  if [[ -f ".env.codespaces" ]] && grep -qE '^PUBLIC_ORIGIN=' ".env.codespaces"; then
    sed -i "s#^PUBLIC_ORIGIN=.*#PUBLIC_ORIGIN=${url}#" ".env.codespaces"
  else
    printf 'PUBLIC_ORIGIN=%s\n' "${url}" >> ".env.codespaces"
  fi
}

tunnel_alive() {
  local pid=""
  pid="$(cat "${tunnel_pid_file}" 2>/dev/null || true)"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

stop_tunnel() {
  local oldpid=""
  oldpid="$(cat "${tunnel_pid_file}" 2>/dev/null || true)"
  if [[ -n "${oldpid}" ]]; then
    kill "${oldpid}" 2>/dev/null || true
  fi
}

start_tunnel() {
  if tunnel_alive; then
    return
  fi

  stop_tunnel

  : > "${tunnel_log}"
  nohup ssh \
    -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 \
    -o ExitOnForwardFailure=yes \
    -R "80:127.0.0.1:${app_port}" \
    nokey@localhost.run > "${tunnel_log}" 2>&1 &
  echo "$!" > "${tunnel_pid_file}"
}

wait_for_url() {
  for _ in $(seq 1 45); do
    local url=""
    url="$(latest_url)"
    if [[ -n "${url}" ]]; then
      printf '%s\n' "${url}"
      return 0
    fi
    sleep 2
  done
  return 1
}

restart_server() {
  FORCE_RESTART=1 bash scripts/start-codespaces-background.sh
}

ensure_server_origin() {
  local url="$1"
  local current=""
  current="$(env_origin)"

  if [[ "${current}" != "${url}" ]]; then
    set_env_origin "${url}"
    restart_server
    return
  fi

  if ! curl -fsS "http://127.0.0.1:${app_port}/health" >/dev/null 2>&1; then
    bash scripts/start-codespaces-background.sh
    return
  fi

  local configured=""
  configured="$(
    curl -fsS "http://127.0.0.1:${app_port}/api/config" 2>/dev/null |
      node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { try { process.stdout.write(JSON.parse(data).publicOrigin || ""); } catch {} });'
  )"
  if [[ "${configured}" != "${url}" ]]; then
    restart_server
  fi
}

start_tunnel
url="$(wait_for_url)"
if ! curl -fsS "http://127.0.0.1:${app_port}/health" >/dev/null 2>&1; then
  bash scripts/start-codespaces-background.sh
fi
if ! curl -fsS --max-time 10 "${url}/health" >/dev/null 2>&1; then
  stop_tunnel
  sleep 2
  start_tunnel
  url="$(wait_for_url)"
fi
ensure_server_origin "${url}"

echo "localhost.run tunnel ready: ${url}"
echo "server pid: $(cat "${server_pid_file}" 2>/dev/null || true)"
