import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { config } from "../config.js";
import { sessionStore, setSessionCookie } from "./session-store.js";
import type { UserInfo } from "../../shared/messages.js";

type GithubUser = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
};

type GithubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

const pendingStates = new Map<string, { createdAt: number; redirectTo: string }>();

function assertGithubConfigured(): void {
  if (!config.github.clientId || !config.github.clientSecret) {
    throw new Error("GitHub OAuth is not configured. Fill GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");
  }
}

function normalizeRedirect(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }
  if (value.startsWith("//")) {
    return "/";
  }
  return value;
}

function allowed(user: GithubUser, emails: GithubEmail[]): boolean {
  const allowedLogins = config.github.allowedLogins;
  const allowedEmails = config.github.allowedEmails;

  const loginAllowed =
    allowedLogins.length === 0 || allowedLogins.includes(user.login.toLowerCase());
  const emailSet = new Set(
    emails
      .filter((email) => email.verified)
      .map((email) => email.email.toLowerCase())
      .concat(user.email ? [user.email.toLowerCase()] : [])
  );
  const emailAllowed =
    allowedEmails.length === 0 || allowedEmails.some((email) => emailSet.has(email));

  return loginAllowed && emailAllowed;
}

async function exchangeCode(code: string): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code,
      redirect_uri: config.github.callbackUrl
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const payload = (await response.json()) as { access_token?: string; error_description?: string };
  if (!payload.access_token) {
    throw new Error(payload.error_description || "GitHub did not return an access token.");
  }
  return payload.access_token;
}

async function fetchGithubJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "codexinphone"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function chooseEmail(user: GithubUser, emails: GithubEmail[]): string | undefined {
  if (user.email) {
    return user.email;
  }
  return emails.find((email) => email.primary && email.verified)?.email;
}

export function registerGithubAuth(app: Express): void {
  app.get("/auth/github", (req: Request, res: Response) => {
    assertGithubConfigured();
    const state = crypto.randomBytes(24).toString("base64url");
    pendingStates.set(state, {
      createdAt: Date.now(),
      redirectTo: normalizeRedirect(req.query.redirectTo)
    });

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", config.github.clientId);
    url.searchParams.set("redirect_uri", config.github.callbackUrl);
    url.searchParams.set("scope", "read:user user:email");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/auth/github/callback", async (req: Request, res: Response, next) => {
    try {
      assertGithubConfigured();
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const pending = pendingStates.get(state);
      pendingStates.delete(state);

      if (!code || !pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
        res.status(400).send("Invalid or expired GitHub OAuth state.");
        return;
      }

      const token = await exchangeCode(code);
      const [githubUser, emails] = await Promise.all([
        fetchGithubJson<GithubUser>("https://api.github.com/user", token),
        fetchGithubJson<GithubEmail[]>("https://api.github.com/user/emails", token)
      ]);

      if (!allowed(githubUser, emails)) {
        res.status(403).send("This GitHub account is not allowed for Codex in Phone.");
        return;
      }

      const user: UserInfo = {
        id: `github:${githubUser.id}`,
        displayName: githubUser.name || githubUser.login,
        login: githubUser.login,
        email: chooseEmail(githubUser, emails),
        authMode: "github"
      };
      const sessionId = sessionStore.create(user);
      setSessionCookie(res, sessionId);
      res.redirect(pending.redirectTo);
    } catch (error) {
      next(error);
    }
  });
}
