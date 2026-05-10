import type { IncomingMessage } from "node:http";
import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { parse } from "cookie";
import { config, publicConfig } from "./config.js";
import { sessionStore } from "./auth/session-store.js";
import { sessionManager } from "./sessions/session-manager.js";
import { isAllowedOrigin } from "./security/http.js";
import { parseClientMessage } from "./ws-validation.js";
import type { ServerMessage, UserInfo } from "../shared/messages.js";

type Client = {
  socket: WebSocket;
  user: UserInfo;
};

function readUserFromUpgrade(req: IncomingMessage): UserInfo | undefined {
  if (config.authMode === "dev") {
    return {
      id: "dev:local",
      displayName: "Local Dev",
      email: "local@codexinphone.dev",
      login: "local",
      authMode: "dev"
    };
  }

  const rawCookie = req.headers.cookie;
  const sessionId = rawCookie ? parse(rawCookie).cip_session : undefined;
  return sessionStore.get(sessionId);
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcast(clients: Set<Client>, message: ServerMessage): void {
  for (const client of clients) {
    send(client.socket, message);
  }
}

function broadcastToOwner(clients: Set<Client>, ownerUserId: string, message: ServerMessage): void {
  for (const client of clients) {
    if (client.user.id === ownerUserId) {
      send(client.socket, message);
    }
  }
}

function rawDataByteLength(raw: RawData): number {
  if (typeof raw === "string") {
    return Buffer.byteLength(raw);
  }
  if (Buffer.isBuffer(raw)) {
    return raw.length;
  }
  if (Array.isArray(raw)) {
    return raw.reduce((total, chunk) => total + chunk.length, 0);
  }
  return raw.byteLength;
}

function rawDataToString(raw: RawData): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (Buffer.isBuffer(raw)) {
    return raw.toString("utf8");
  }
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString("utf8");
  }
  return Buffer.from(raw).toString("utf8");
}

export function createWebSocketServer(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<Client>();

  sessionManager.addListener({
    onChunk: (sessionId, chunk, ownerUserId) => {
      broadcastToOwner(clients, ownerUserId, { type: "terminal:chunk", sessionId, chunk });
    },
    onSessionUpdated: (session, ownerUserId) => {
      broadcastToOwner(clients, ownerUserId, { type: "session:updated", session });
      for (const client of clients) {
        if (client.user.id === ownerUserId) {
          send(client.socket, {
            type: "session:list",
            sessions: sessionManager.list(client.user.id)
          });
        }
      }
    },
    onApprovalRequired: (request, ownerUserId) => {
      broadcastToOwner(clients, ownerUserId, { type: "approval:required", request });
    },
    onApprovalResolved: (approvalId, approved, ownerUserId) => {
      broadcastToOwner(clients, ownerUserId, { type: "approval:resolved", approvalId, approved });
    }
  });

  wss.on("connection", (socket, req) => {
    const user = readUserFromUpgrade(req);
    if (!user) {
      socket.close(1008, "Authentication required");
      return;
    }

    const client: Client = { socket, user };
    let windowStartedAt = Date.now();
    let messageCount = 0;
    clients.add(client);
    send(socket, { type: "hello", config: publicConfig(), user });
    send(socket, { type: "session:list", sessions: sessionManager.list(user.id) });

    socket.on("message", async (raw) => {
      try {
        if (rawDataByteLength(raw) > config.security.wsMaxMessageBytes) {
          socket.close(1009, "Message too large");
          return;
        }

        const now = Date.now();
        if (now - windowStartedAt > config.security.wsRateLimitWindowMs) {
          windowStartedAt = now;
          messageCount = 0;
        }
        messageCount += 1;
        if (messageCount > config.security.wsMaxMessagesPerWindow) {
          socket.close(1008, "Rate limit exceeded");
          return;
        }

        const message = parseClientMessage(rawDataToString(raw));

        switch (message.type) {
          case "session:create": {
            const session = await sessionManager.create({
              cwd: message.cwd,
              args: message.args,
              cols: message.cols,
              rows: message.rows,
              envProfile: message.envProfile,
              user: client.user
            });
            send(socket, { type: "session:created", session });
            send(socket, {
              type: "session:attached",
              session,
              history: sessionManager.getHistory(session.id, client.user.id)
            });
            break;
          }
          case "session:attach": {
            send(socket, {
              type: "session:attached",
              session: sessionManager.getSummary(message.sessionId, client.user.id),
              history: sessionManager.getHistory(message.sessionId, client.user.id)
            });
            break;
          }
          case "stdin:append":
            sessionManager.appendInput(message.sessionId, message.data, client.user.id);
            break;
          case "session:resize":
            sessionManager.resize(message.sessionId, message.cols, message.rows, client.user.id);
            break;
          case "session:terminate":
            sessionManager.terminate(message.sessionId, client.user.id);
            break;
          case "approval:approve":
            sessionManager.approve(message.approvalId, true, client.user.id);
            break;
          case "approval:deny":
            sessionManager.approve(message.approvalId, false, client.user.id);
            break;
          default:
            send(socket, { type: "error", message: "Unknown message type." });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send(socket, { type: "error", message });
      }
    });

    socket.on("close", () => {
      clients.delete(client);
    });
  });

  return wss;
}

export function validateWebSocketUpgrade(req: IncomingMessage): boolean {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  return isAllowedOrigin(origin);
}
