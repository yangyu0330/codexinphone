import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import { config, publicConfig } from "./config.js";
import { loginWithPairingToken, logout, requireAuth, currentUser } from "./auth/index.js";
import { registerGithubAuth } from "./auth/github.js";
import { ensureDataDirs } from "./sessions/audit-log.js";
import { createWebSocketServer } from "./ws.js";

await ensureDataDirs();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json(publicConfig());
});

app.get("/api/me", (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  res.json({ user });
});

app.post("/auth/token", loginWithPairingToken);
app.post("/api/logout", requireAuth, logout);
registerGithubAuth(app);

const clientDist = path.join(process.cwd(), "dist", "client");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/auth")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: message });
});

const server = http.createServer(app);
const wss = createWebSocketServer();

server.on("upgrade", (req, socket, head) => {
  if (!req.url?.startsWith("/ws")) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(config.port, config.host, () => {
  console.log(
    `Codex in Phone listening on http://${config.host}:${config.port} (${config.authMode} auth)`
  );
  if (config.host !== "127.0.0.1" && config.host !== "localhost") {
    console.warn("Security warning: avoid exposing this service directly to the internet.");
  }
});
