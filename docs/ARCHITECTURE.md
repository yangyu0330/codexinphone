# Architecture

```text
Phone PWA
  |
  | HTTPS + WebSocket
  v
Node/Express control plane on Windows laptop
  |
  | node-pty when available
  v
Local Codex CLI process
  |
  v
Laptop files, git repos, tests, local commands
```

## Components

- `src/client`: React PWA with xterm terminal surface.
- `src/server/auth`: GitHub OAuth, pairing token fallback, session cookies.
- `src/server/sessions`: session lifecycle, log replay, approvals.
- `src/server/terminal`: PTY adapter with pipe fallback.
- `src/server/security`: output masking and risky input detection.
- `scripts`: Windows startup and mock CLI helpers.

## Message flow

- `session:create`: start Codex CLI in a configured working directory.
- `session:attach`: replay current history after phone reconnect.
- `stdin:append`: write terminal input after policy inspection.
- `terminal:chunk`: stream masked output to the phone.
- `approval:required`: hold risky input until user approves.
- `session:terminate`: stop the Codex CLI process.

## Persistence

Runtime sessions are in memory. Audit logs are stored under `.codexinphone/sessions/*.jsonl`. After a server restart, previous logs remain on disk but running PTY processes are not restored.
