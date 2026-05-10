import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { z } from "zod";
import type { AuthMode, PublicConfig } from "../shared/messages.js";

dotenv.config();

const authModeSchema = z.enum(["github", "token", "dev"]);

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("CODEX_ARGS JSON must be an array of strings.");
    }
    return parsed;
  }

  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(trimmed))) {
    args.push(match[1] ?? match[2] ?? match[0]);
  }
  return args;
}

function resolveMaybeRelative(value: string): string {
  if (path.isAbsolute(value)) {
    return path.normalize(value);
  }
  return path.resolve(process.cwd(), value);
}

function buildSecret(): string {
  if (process.env.SESSION_SECRET?.trim()) {
    return process.env.SESSION_SECRET.trim();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return crypto.randomBytes(32).toString("hex");
}

const host = process.env.HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const workspaceRoots = splitList(process.env.WORKSPACE_ROOTS);
const defaultRoot = os.homedir();
const normalizedRoots = (workspaceRoots.length ? workspaceRoots : [defaultRoot]).map(resolveMaybeRelative);
const defaultCwd = resolveMaybeRelative(process.env.DEFAULT_CWD || normalizedRoots[0] || defaultRoot);
const authMode = authModeSchema.parse((process.env.AUTH_MODE || "github").toLowerCase()) as AuthMode;
const publicOrigin = process.env.PUBLIC_ORIGIN?.trim() || `http://${host}:${port}`;
const cookieSecure = (process.env.COOKIE_SECURE ?? "").trim()
  ? process.env.COOKIE_SECURE === "true"
  : publicOrigin.startsWith("https://");

export const aiEnvKeys = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "MISTRAL_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "PERPLEXITY_API_KEY",
  "CODEX_MODEL"
] as const;

export const config = {
  host,
  port,
  publicOrigin,
  dataDir: resolveMaybeRelative(process.env.DATA_DIR || ".codexinphone"),
  authMode,
  sessionSecret: buildSecret(),
  cookieSecure,
  github: {
    clientId: process.env.GITHUB_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET?.trim() || "",
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL?.trim() ||
      `${publicOrigin.replace(/\/$/, "")}/auth/github/callback`,
    allowedEmails: splitList(process.env.ALLOWED_EMAILS).map((email) => email.toLowerCase()),
    allowedLogins: splitList(process.env.ALLOWED_GITHUB_LOGINS).map((login) => login.toLowerCase())
  },
  pairingToken: process.env.PAIRING_TOKEN?.trim() || "",
  codex: {
    command: process.env.CODEX_COMMAND?.trim() || "codex",
    args: parseArgs(process.env.CODEX_ARGS),
    workspaceRoots: normalizedRoots,
    defaultCwd
  }
} as const;

export function publicConfig(): PublicConfig {
  return {
    authMode: config.authMode,
    publicOrigin: config.publicOrigin,
    defaultCwd: config.codex.defaultCwd,
    workspaceRoots: [...config.codex.workspaceRoots],
    codexCommand: config.codex.command,
    codexArgs: [...config.codex.args],
    aiEnvStatus: Object.fromEntries(aiEnvKeys.map((key) => [key, Boolean(process.env[key])])),
    tunnelHint: "Use Tailscale or Cloudflare Tunnel; keep this server bound to 127.0.0.1 by default."
  };
}
