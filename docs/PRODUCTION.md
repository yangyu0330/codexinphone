# Production Readiness

Use this checklist before leaving the laptop unattended.

## Required Configuration

Run this after filling `.env`:

```powershell
npm run check:prod-config
```

The server also refuses to start with `NODE_ENV=production` when these controls are missing:

- `SESSION_SECRET` at least 32 characters
- `AUTH_MODE` is not `dev`
- GitHub OAuth credentials for `AUTH_MODE=github`
- `ALLOWED_EMAILS` or `ALLOWED_GITHUB_LOGINS`
- HTTPS `PUBLIC_ORIGIN` outside localhost
- Secure cookies outside localhost
- A long `PAIRING_TOKEN` when using token auth
- `DEFAULT_CWD` inside `WORKSPACE_ROOTS`

## Network Boundary

Keep the Node server on `127.0.0.1`. Put one of these in front:

- Tailscale Serve/Funnel with identity controls
- Cloudflare Tunnel with Cloudflare Access

Do not port-forward the server directly from a home router.

## Operational Checks

```powershell
npm run ci
npm run build
npm run check:prod-config
```

Then register the Windows scheduled task:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-task.ps1
Start-ScheduledTask -TaskName CodexInPhone
```

## Runtime Guarantees

- Security headers and CSP are enabled.
- Auth and API endpoints have rate limits.
- State-changing HTTP requests are same-origin checked.
- WebSocket origins, payload size, and message rate are checked.
- Session cookies are signed and survive server restart.
- Terminal sessions are scoped to the authenticated user.
- API keys and common tokens are masked before UI broadcast and audit storage.

## Remaining Limits

This service controls a local Codex CLI process. It is not a full sandbox. The process can still access files allowed to the Windows account running the service. Use a non-admin Windows account for daily operation.
