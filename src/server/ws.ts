import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { parse } from "cookie";
import { config, publicConfig } from "./config.js";
import { currentUser } from "./auth/index.js";
import { sessionStore } from "./auth/session-store.js";
import { sessionManager } from "./sessions/session-manager.js";
import type { ClientMessage, ServerMessage, UserInfo } from "../shared/messages.js";

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

export function createWebSocketServer(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<Client>();

  sessionManager.addListener({
    onChunk: (sessionId, chunk) => {
      broadcast(clients, { type: "terminal:chunk", sessionId, chunk });
    },
    onSessionUpdated: (session) => {
      broadcast(clients, { type: "session:updated", session });
      broadcast(clients, { type: "session:list", sessions: sessionManager.list() });
    },
    onApprovalRequired: (request) => {
      broadcast(clients, { type: "approval:required", request });
    },
    onApprovalResolved: (approvalId, approved) => {
      broadcast(clients, { type: "approval:resolved", approvalId, approved });
    }
  });

  wss.on("connection", (socket, req) => {
    const user = readUserFromUpgrade(req);
    if (!user) {
      socket.close(1008, "Authentication required");
      return;
    }

    const client: Client = { socket, user };
    clients.add(client);
    send(socket, { type: "hello", config: publicConfig(), user });
    send(socket, { type: "session:list", sessions: sessionManager.list() });

    socket.on("message", async (raw) => {
      try {
        const message = JSON.parse(raw.toString("utf8")) as ClientMessage;

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
              history: sessionManager.getHistory(session.id)
            });
            break;
          }
          case "session:attach": {
            send(socket, {
              type: "session:attached",
              session: sessionManager.getSummary(message.sessionId),
              history: sessionManager.getHistory(message.sessionId)
            });
            break;
          }
          case "stdin:append":
            sessionManager.appendInput(message.sessionId, message.data);
            break;
          case "session:resize":
            sessionManager.resize(message.sessionId, message.cols, message.rows);
            break;
          case "session:terminate":
            sessionManager.terminate(message.sessionId);
            break;
          case "approval:approve":
            sessionManager.approve(message.approvalId, true);
            break;
          case "approval:deny":
            sessionManager.approve(message.approvalId, false);
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
