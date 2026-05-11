#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

repo="${CIP_LAUNCHER_REPO:-yangyu0330/codexinphone}"
path="${CIP_LAUNCHER_PATH:-docs/current-url.json}"
branch="${CIP_LAUNCHER_BRANCH:-main}"
app_port="${PORT:-8787}"
url="${1:-${PUBLIC_ORIGIN:-}}"
token="${CIP_GITHUB_TOKEN:-}"

if [[ -z "${url}" ]]; then
  echo "No launcher URL was provided." >&2
  exit 1
fi

if ! node -e '
try {
  const url = new URL(process.argv[1]);
  if (url.protocol === "https:" && /^[a-z0-9-]+\.lhr\.life$/i.test(url.hostname)) {
    process.exit(0);
  }
} catch {}
process.exit(1);
' "${url}"; then
  echo "Refusing to publish unsafe launcher URL: ${url}" >&2
  exit 1
fi

if [[ -z "${token}" ]]; then
  echo "CIP_GITHUB_TOKEN is not set; launcher URL publish skipped." >&2
  exit 0
fi

api_url="https://api.github.com/repos/${repo}/contents/${path}"
auth_headers=(
  -H "Authorization: Bearer ${token}"
  -H "Accept: application/vnd.github+json"
  -H "X-GitHub-Api-Version: 2022-11-28"
)

existing="$(
  curl -fsS "${auth_headers[@]}" "${api_url}?ref=${branch}" 2>/dev/null || true
)"

sha="$(
  printf '%s' "${existing}" |
    node -e '
let data = "";
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
  try {
    const doc = JSON.parse(data);
    process.stdout.write(doc.sha || "");
  } catch {}
});
' || true
)"

current_url="$(
  printf '%s' "${existing}" |
    node -e '
let data = "";
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
  try {
    const doc = JSON.parse(data);
    const raw = Buffer.from(String(doc.content || "").replace(/\s/g, ""), "base64").toString("utf8");
    const current = JSON.parse(raw);
    process.stdout.write(current.url || "");
  } catch {}
});
' || true
)"

if [[ "${current_url}" == "${url}" ]]; then
  echo "Launcher URL already current: ${url}"
  exit 0
fi

export LAUNCHER_URL="${url}"
export LAUNCHER_UPDATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
export LAUNCHER_SOURCE="codespaces-localhostrun"
export LAUNCHER_CODESPACE_NAME="${CODESPACE_NAME:-}"
export LAUNCHER_CODESPACE_DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
export LAUNCHER_APP_PORT="${app_port}"

content_json="$(
  node - <<'NODE'
const data = {
  url: process.env.LAUNCHER_URL,
  updatedAt: process.env.LAUNCHER_UPDATED_AT,
  source: process.env.LAUNCHER_SOURCE,
  codespaceName: process.env.LAUNCHER_CODESPACE_NAME,
  manageUrl: process.env.LAUNCHER_CODESPACE_NAME
    ? `https://github.com/codespaces/${process.env.LAUNCHER_CODESPACE_NAME}`
    : "",
  fixedUrl: process.env.LAUNCHER_CODESPACE_NAME
    ? `https://${process.env.LAUNCHER_CODESPACE_NAME}-${process.env.LAUNCHER_APP_PORT}.${process.env.LAUNCHER_CODESPACE_DOMAIN}`
    : "",
};

for (const [key, value] of Object.entries(data)) {
  if (!value) {
    delete data[key];
  }
}

process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
NODE
)"

content_b64="$(printf '%s' "${content_json}" | base64 | tr -d '\n')"

export LAUNCHER_BRANCH="${branch}"
export LAUNCHER_MESSAGE="Update current Codex in Phone URL"
export LAUNCHER_CONTENT_B64="${content_b64}"
export LAUNCHER_SHA="${sha}"

payload="$(
  node - <<'NODE'
const payload = {
  message: process.env.LAUNCHER_MESSAGE,
  content: process.env.LAUNCHER_CONTENT_B64,
  branch: process.env.LAUNCHER_BRANCH,
};

if (process.env.LAUNCHER_SHA) {
  payload.sha = process.env.LAUNCHER_SHA;
}

process.stdout.write(JSON.stringify(payload));
NODE
)"

curl -fsS \
  -X PUT \
  "${auth_headers[@]}" \
  --data "${payload}" \
  "${api_url}" >/dev/null

echo "Published current launcher URL: ${url}"
