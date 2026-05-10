import crypto from "node:crypto";
import type { Request, Response } from "express";
import { parse, serialize } from "cookie";
import { config } from "../config.js";
import type { UserInfo } from "../../shared/messages.js";

const cookieName = "cip_session";
const maxAgeSeconds = 60 * 60 * 24 * 14;

type StoredSession = {
  user: UserInfo;
  iat: number;
  exp: number;
};

export class SessionStore {
  create(user: UserInfo): string {
    const now = Date.now();
    const session: StoredSession = {
      user,
      iat: now,
      exp: now + maxAgeSeconds * 1000
    };
    return this.sign(session);
  }

  get(value: string | undefined): UserInfo | undefined {
    if (!value) {
      return undefined;
    }

    const session = this.verify(value);
    if (!session) {
      return undefined;
    }

    if (Date.now() > session.exp) {
      return undefined;
    }

    return session.user;
  }

  destroy(_value: string | undefined): void {
    // Stateless signed cookies are invalidated client-side by clearing the cookie.
  }

  private sign(session: StoredSession): string {
    const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
    const signature = crypto
      .createHmac("sha256", config.sessionSecret)
      .update(payload)
      .digest("base64url");
    return `v1.${payload}.${signature}`;
  }

  private verify(value: string): StoredSession | undefined {
    const [version, payload, signature] = value.split(".");
    if (version !== "v1" || !payload || !signature) {
      return undefined;
    }

    const expected = crypto
      .createHmac("sha256", config.sessionSecret)
      .update(payload)
      .digest("base64url");
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StoredSession;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.iat !== "number" ||
        typeof parsed.exp !== "number" ||
        !parsed.user ||
        typeof parsed.user.id !== "string"
      ) {
        return undefined;
      }
      return parsed;
    } catch {
      return undefined;
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
