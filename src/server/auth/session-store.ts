import crypto from "node:crypto";
import type { Request, Response } from "express";
import { parse, serialize } from "cookie";
import { config } from "../config.js";
import type { UserInfo } from "../../shared/messages.js";

const cookieName = "cip_session";
const maxAgeSeconds = 60 * 60 * 24 * 14;

type StoredSession = {
  id: string;
  user: UserInfo;
  createdAt: number;
  lastSeenAt: number;
};

export class SessionStore {
  private readonly sessions = new Map<string, StoredSession>();

  create(user: UserInfo): string {
    const id = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();
    this.sessions.set(id, {
      id,
      user,
      createdAt: now,
      lastSeenAt: now
    });
    return id;
  }

  get(id: string | undefined): UserInfo | undefined {
    if (!id) {
      return undefined;
    }

    const session = this.sessions.get(id);
    if (!session) {
      return undefined;
    }

    if (Date.now() - session.lastSeenAt > maxAgeSeconds * 1000) {
      this.sessions.delete(id);
      return undefined;
    }

    session.lastSeenAt = Date.now();
    return session.user;
  }

  destroy(id: string | undefined): void {
    if (id) {
      this.sessions.delete(id);
    }
  }
}

export const sessionStore = new SessionStore();

export function readSessionId(req: Request): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) {
    return undefined;
  }
  return parse(raw)[cookieName];
}

export function setSessionCookie(res: Response, sessionId: string): void {
  res.setHeader(
    "Set-Cookie",
    serialize(cookieName, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      path: "/",
      maxAge: maxAgeSeconds
    })
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    serialize(cookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      path: "/",
      maxAge: 0
    })
  );
}
