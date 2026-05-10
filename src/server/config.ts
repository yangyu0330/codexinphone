import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { z } from "zod";
import type { AuthMode, PublicConfig } from "../shared/messages.js";

dotenv.config({ quiet: true });

const authModeSchema = z.enum(["github", "token", "dev"]);
const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

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
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) {
    if (isProduction && secret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters in production.");
    }
    return secret;
  }
  if (isProduction) {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return crypto.randomBytes(32).toString("hex");
}

function isPathInsideRoots(candidate: string, roots: string[]): boolean {
  const normalizedCandidate =
    process.platform === "win32" ? path.resolve(candidate).toLowerCase() : path.resolve(candidate);

  return roots.some((root) => {
    const normalizedRoot =
      process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root);
    const relative = path.relative(normalizedRoot, normalizedCandidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }
  return value === "true";
}

function intFromEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
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
const publicOriginUrl = new URL(publicOrigin);
const cookieSecure = (process.env.COOKIE_SECURE ?? "").trim()
  ? process.env.COOKIE_SECURE === "true"
  : publicOrigin.startsWith("https://");

if (!isPathInsideRoots(defaultCwd, normalizedRoots)) {
  throw new Error("DEFAULT_CWD must be inside one of WORKSPACE_ROOTS.");
}

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
  nodeEnv,
  isProduction,
  host,
  port,
  publicOrigin,
  publicOriginUrl,
  dataDir: resolveMaybeRelative(process.env.DATA_DIR || ".codexinphone"),
  authMode,
  sessionSecret: buildSecret(),
  cookieSecure,
  trustProxy: boolFromEnv("TRUST_PROXY", false),
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
  },
  security: {
    apiRateLimitWindowMs: intFromEnv("API_RATE_LIMIT_WINDOW_MS", 60_000),
    apiRateLimitMax: intFromEnv("API_RATE_LIMIT_MAX", 240),
    authRateLimitWindowMs: intFromEnv("AUTH_RATE_LIMIT_WINDOW_MS", 60_000),
    authRateLimitMax: intFromEnv("AUTH_RATE_LIMIT_MAX", 12),
    wsMaxMessageBytes: intFromEnv("WS_MAX_MESSAGE_BYTES", 64 * 1024),
    wsMaxMessagesPerWindow: intFromEnv("WS_MAX_MESSAGES_PER_WINDOW", 240),
    wsRateLimitWindowMs: intFromEnv("WS_RATE_LIMIT_WINDOW_MS", 60_000)
  }
} as const;

export function productionConfigIssues(): string[] {
  const issues: string[] = [];
  const localOrigins = new Set(["localhost", "127.0.0.1", "::1"]);

  if (config.authMode === "dev") {
    issues.push("AUTH_MODE=dev is not allowed for production use.");
  }
  if (!config.cookieSecure && !localOrigins.has(config.publicOriginUrl.hostname)) {
    issues.push("COOKIE_SECURE must be true when PUBLIC_ORIGIN is not localhost.");
  }
  if (config.publicOriginUrl.protocol !== "https:" && !localOrigins.has(config.publicOriginUrl.hostname)) {
    issues.push("PUBLIC_ORIGIN must use https outside localhost.");
  }
  if (config.authMode === "github") {
    if (!config.github.clientId || !config.github.clientSecret) {
      issues.push("GitHub OAuth requires GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");
    }
    if (config.github.allowedEmails.length === 0 && config.github.allowedLogins.length === 0) {
      issues.push("GitHub OAuth requires ALLOWED_EMAILS or ALLOWED_GITHUB_LOGINS.");
    }
    if (!config.github.callbackUrl.startsWith(`${config.publicOrigin.replace(/\/$/, "")}/`)) {
      issues.push("GITHUB_CALLBACK_URL should be under PUBLIC_ORIGIN.");
    }
  }
  if (config.authMode === "token" && config.pairingToken.length < 32) {
    issues.push("PAIRING_TOKEN must be at least 32 characters in token auth mode.");
  }
  if (config.host === "0.0.0.0" || config.host === "::") {
    issues.push("HOST should stay on 127.0.0.1 behind Tailscale or Cloudflare Tunnel.");
  }

  return issues;
}

if (isProduction) {
  const issues = productionConfigIssues();
  if (issues.length > 0) {
    throw new Error(`Production configuration is not safe:\n- ${issues.join("\n- ")}`);
  }
}

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
