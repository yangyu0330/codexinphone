import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const allowedEnvName = /^(OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|MISTRAL_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY|PERPLEXITY_API_KEY|CODEX_MODEL|AI_[A-Z0-9_]+)$/;

export type EnvProfile = {
  name: string;
  env: Record<string, string>;
  secretValues: string[];
};

export async function loadEnvProfile(name: string | undefined): Promise<EnvProfile | undefined> {
  if (!name || name === "default") {
    return undefined;
  }

  const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!safeName || safeName !== name) {
    throw new Error("Invalid env profile name.");
  }

  const filePath = path.join(config.dataDir, "env-profiles", `${safeName}.json`);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Env profile must be a JSON object.");
  }

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!allowedEnvName.test(key)) {
      throw new Error(`Env profile key ${key} is not allowed.`);
    }
    if (typeof value !== "string") {
      throw new Error(`Env profile value for ${key} must be a string.`);
    }
    env[key] = value;
  }

  return {
    name: safeName,
    env,
    secretValues: Object.values(env).filter((value) => value.length >= 8)
  };
}
