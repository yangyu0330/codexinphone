import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { config } from "../config.js";
import { logger } from "../logger.js";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function isCodespacesTunnelOrigin(origin: URL): boolean {
  return (
    config.publicOriginUrl.hostname.endsWith(".app.github.dev") &&
    origin.protocol === "https:" &&
    origin.hostname === "github.dev"
  );
}

export function requestLogger() {
  return pinoHttp<IncomingMessage, ServerResponse>({
    logger,
    genReqId: (req: IncomingMessage) => {
      const existing = req.headers["x-request-id"];
      return typeof existing === "string" && existing.length <= 128
        ? existing
        : crypto.randomUUID();
    },
    customProps: (req: IncomingMessage) => ({
      userAgent: req.headers["user-agent"]
    })
  });
}

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "data:"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.publicOriginUrl.protocol === "https:"
  });
}

export const apiRateLimiter = rateLimit({
  windowMs: config.security.apiRateLimitWindowMs,
  limit: config.security.apiRateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

export const authRateLimiter = rateLimit({
  windowMs: config.security.authRateLimitWindowMs,
  limit: config.security.authRateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.origin === config.publicOriginUrl.origin) {
    return true;
  }

  if (isCodespacesTunnelOrigin(parsed)) {
    return true;
  }

  return (
    !config.isProduction &&
    localHosts.has(parsed.hostname) &&
    parsed.protocol === config.publicOriginUrl.protocol
  );
}

export function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  if (!stateChangingMethods.has(req.method)) {
    next();
    return;
  }

  if (config.authMode === "token" && req.method === "POST" && req.path === "/auth/token") {
    next();
    return;
  }

  let origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (!origin && typeof req.headers.referer === "string") {
    try {
      origin = new URL(req.headers.referer).origin;
    } catch {
      origin = "invalid";
    }
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Cross-origin state-changing request rejected." });
    return;
  }

  next();
}
