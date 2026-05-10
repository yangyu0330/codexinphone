# Security Notes

Codex in Phone exposes a local terminal-like interface to a phone. Treat it as a privileged control plane for your laptop.

## Required controls

- Keep `HOST=127.0.0.1` unless you have a private VPN or protected tunnel.
- Use `AUTH_MODE=github` for real remote access.
- Fill `ALLOWED_EMAILS` or `ALLOWED_GITHUB_LOGINS`.
- Use HTTPS for any non-local phone access.
- Keep `.env` out of git.
- Rotate `SESSION_SECRET` and OAuth secrets if a laptop is lost.

## Explicitly unsupported

- Direct public port forwarding
- Unauthenticated WebSocket terminal access
- Storing API keys in browser localStorage
- Reusing browser cookies from ChatGPT, OpenAI, or Codex web sessions
- Running the service as Administrator for normal use

## Logs

Session logs are written as JSONL under `.codexinphone/sessions`. Output is passed through token masking before it is broadcast or stored, but users should still avoid intentionally printing secrets.

## Remaining risk

The approval policy catches common risky command strings. It is not a complete shell sandbox. The Codex CLI process runs under the Windows user that starts this service and can access the same files that user can access.
