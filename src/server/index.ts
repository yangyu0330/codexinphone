import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import { config, publicConfig } from "./config.js";
import { loginWithPairingToken, logout, requireAuth, currentUser } from "./auth/index.js";
import { registerGithubAuth } from "./auth/github.js";
import { ensureDataDirs } from "./sessions/audit-log.js";
import { createWebSocketServer, validateWebSocketUpgrade } from "./ws.js";
import { stopCurrentCodespace } from "./codespace-control.js";
import {
  apiRateLimiter,
  authRateLimiter,
  requestLogger,
  sameOriginOnly,
  securityHeaders
} from "./security/http.js";
import { logger } from "./logger.js";

await ensureDataDirs();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);
app.use(requestLogger());
app.use(securityHeaders());
app.use(sameOriginOnly);
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", apiRateLimiter);

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

app.use("/auth", authRateLimiter);
app.post("/auth/token", loginWithPairingToken);
app.post("/api/logout", requireAuth, logout);
app.post("/api/codespace/stop", requireAuth, async (_req, res, next) => {
  try {
    await stopCurrentCodespace();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
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
  logger.error({ error }, "Unhandled request error");
  res.status(500).json({ error: config.isProduction ? "Internal server error." : message });
});

const server = http.createServer(app);
const wss = createWebSocketServer();

server.on("upgrade", (req, socket, head) => {
  if (!req.url?.startsWith("/ws") || !validateWebSocketUpgrade(req)) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(config.port, config.host, () => {
  logger.info(
    { host: config.host, port: config.port, authMode: config.authMode },
    "Codex in Phone listening"
  );
  if (config.host !== "127.0.0.1" && config.host !== "localhost") {
    logger.warn("Security warning: avoid exposing this service directly to the internet.");
  }
});
