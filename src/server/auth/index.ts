import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { clearSessionCookie, readSessionId, sessionStore, setSessionCookie } from "./session-store.js";
import type { UserInfo } from "../../shared/messages.js";

export type AuthenticatedRequest = Request & {
  user: UserInfo;
};

const devUser: UserInfo = {
  id: "dev:local",
  displayName: "Local Dev",
  email: "local@codexinphone.dev",
  login: "local",
  authMode: "dev"
};

function getSessionUser(req: Request): UserInfo | undefined {
  return sessionStore.get(readSessionId(req));
}

export function currentUser(req: Request): UserInfo | undefined {
  if (config.authMode === "dev") {
    return getSessionUser(req) || devUser;
  }
  return getSessionUser(req);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  (req as AuthenticatedRequest).user = user;
  next();
}

export function loginWithPairingToken(req: Request, res: Response): void {
  if (config.authMode !== "token") {
    res.status(404).json({ error: "Token login is disabled." });
    return;
  }

  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!config.pairingToken || token !== config.pairingToken) {
    res.status(401).json({ error: "Invalid pairing token." });
    return;
  }

  const user: UserInfo = {
    id: "token:phone",
    displayName: "Paired Phone",
    authMode: "token"
  };
  const sessionId = sessionStore.create(user);
  setSessionCookie(res, sessionId);
  res.json({ user });
}

export function logout(req: Request, res: Response): void {
  sessionStore.destroy(readSessionId(req));
  clearSessionCookie(res);
  res.status(204).end();
}
