import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { TerminalChunk } from "../../shared/messages.js";

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(path.join(config.dataDir, "sessions"), { recursive: true });
  await fs.mkdir(path.join(config.dataDir, "env-profiles"), { recursive: true });
}

export async function appendSessionEvent(
  sessionId: string,
  event: Record<string, unknown> | TerminalChunk
): Promise<void> {
  await ensureDataDirs();
  const logPath = path.join(config.dataDir, "sessions", `${sessionId}.jsonl`);
  await fs.appendFile(logPath, `${JSON.stringify(event)}\n`, "utf8");
}
