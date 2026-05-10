import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: process.env.LOG_LEVEL || (config.isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "*.OPENAI_API_KEY",
      "*.ANTHROPIC_API_KEY",
      "*.GITHUB_CLIENT_SECRET",
      "*.PAIRING_TOKEN",
      "*.SESSION_SECRET"
    ],
    censor: "[redacted]"
  }
});
