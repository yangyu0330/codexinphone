import { z } from "zod";
import type { ClientMessage } from "../shared/messages.js";

const sessionId = z.string().min(1).max(128);
const approvalId = z.string().min(1).max(128);
const cwd = z.string().min(1).max(2048).optional();
const args = z.array(z.string().max(512)).max(32).optional();

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session:create"),
    cwd,
    args,
    cols: z.number().int().min(20).max(300).optional(),
    rows: z.number().int().min(8).max(120).optional(),
    envProfile: z.string().min(1).max(80).optional()
  }),
  z.object({ type: z.literal("session:attach"), sessionId }),
  z.object({
    type: z.literal("stdin:append"),
    sessionId,
    data: z.string().max(16 * 1024)
  }),
  z.object({
    type: z.literal("session:resize"),
    sessionId,
    cols: z.number().int().min(20).max(300),
    rows: z.number().int().min(8).max(120)
  }),
  z.object({ type: z.literal("session:terminate"), sessionId }),
  z.object({ type: z.literal("approval:approve"), approvalId }),
  z.object({ type: z.literal("approval:deny"), approvalId })
]);

export function parseClientMessage(raw: string): ClientMessage {
  return clientMessageSchema.parse(JSON.parse(raw)) as ClientMessage;
}
